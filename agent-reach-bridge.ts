import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extractInterviewQuestions, INTERVIEW_QUESTION_PARSER_VERSION } from "./src/interview-question-extractor";
import {
  buildDeepCollectionQueries,
  DEEP_COLLECTION_MIN_QUERIES,
  DEEP_COLLECTION_SATURATION_ROUNDS,
  MAX_DEEP_COLLECTION_SOURCES,
} from "./src/search-strategy";

export const AGENT_REACH_SCHEMA = "agent-reach.interview-experience.v1" as const;
export const MAX_QUERY_LENGTH = 120;
export const MAX_SOURCE_LIMIT = MAX_DEEP_COLLECTION_SOURCES;
export const MAX_EXISTING_URLS = 200;
// A real Chrome-backed OpenCLI search commonly takes 14-20 seconds. Deep
// collection runs several bounded searches before reading unique notes.
const PROCESS_TIMEOUT_MS = 30_000;
const COLLECTION_TIMEOUT_MS = 360_000;
const NOTE_INTERVAL_MS = 2_000;
const MAX_REINDEX_SOURCES = 10;
const REINDEX_TIMEOUT_MS = 180_000;

export type AgentReachSource = {
  title: string;
  platform: "小红书";
  url: string;
  capturedAt: string;
  excerpts: string[];
  questions: string[];
  questionParserVersion: number;
};

export type SourceReindexPayload = {
  schemaVersion: typeof AGENT_REACH_SCHEMA;
  sources: AgentReachSource[];
  failures: Array<{ title: string; reason: string }>;
};

export type CollectionPayload = {
  schemaVersion: typeof AGENT_REACH_SCHEMA;
  target: { company: string; role: string };
  sources: AgentReachSource[];
  failures: Array<{ title: string; reason: string }>;
  coverage: {
    queries: Array<{
      query: string;
      status: "completed" | "failed";
      hitCount: number;
      newUniqueCount: number;
      error?: string;
    }>;
    stopReason: "source_limit" | "saturated" | "time_limit" | "query_plan_exhausted" | "no_results";
  };
  stats: {
    queryPlannedCount: number;
    queryExecutedCount: number;
    searchHitCount: number;
    uniqueHitCount: number;
    duplicateHitCount: number;
    existingSkippedCount: number;
    newCandidateCount: number;
    bodyReadCount: number;
    questionSourceCount: number;
    questionCount: number;
    failureCount: number;
  };
};

export type ProcessRunner = (args: readonly string[], timeoutMs: number) => Promise<string>;

type CollectorDependencies = {
  run?: ProcessRunner;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
};

type SearchItem = { title: string; url: string };

export function redactTransientSecrets(message: string) {
  return message.replace(/(xsec_token(?:=|%3D))[^&\s"']+/gi, "$1[redacted]");
}

export function validateCollectionInput(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("请求正文必须是 JSON 对象。");
  const input = value as Record<string, unknown>;
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query.length < 2) throw new Error("搜索词至少需要 2 个字符。");
  if (query.length > MAX_QUERY_LENGTH) throw new Error(`搜索词不能超过 ${MAX_QUERY_LENGTH} 个字符。`);
  const limit = input.limit === undefined ? MAX_SOURCE_LIMIT : input.limit;
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > MAX_SOURCE_LIMIT) {
    throw new Error(`正文读取数量必须是 1 到 ${MAX_SOURCE_LIMIT} 的整数。`);
  }
  const company = typeof input.company === "string" ? input.company.trim().slice(0, 80) : "";
  const role = typeof input.role === "string" ? input.role.trim().slice(0, 80) : "";
  const existingUrls = Array.isArray(input.existingUrls)
    ? input.existingUrls.flatMap((value) => typeof value === "string" ? [sanitizeSourceUrl(value)] : []).filter(Boolean).slice(0, MAX_EXISTING_URLS)
    : [];
  return { query, limit: Number(limit), company, role, existingUrls };
}

export function validateSourceReindexInput(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("请求正文必须是 JSON 对象。");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > MAX_REINDEX_SOURCES) {
    throw new Error(`重新读取来源数量必须是 1 到 ${MAX_REINDEX_SOURCES}。`);
  }
  const sources = input.sources.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`来源 ${index + 1} 无效。`);
    const source = item as Record<string, unknown>;
    const url = typeof source.url === "string" ? sanitizeSourceUrl(source.url) : "";
    if (!url) throw new Error(`来源 ${index + 1} 不是可信的小红书链接。`);
    const title = typeof source.title === "string" && source.title.trim()
      ? source.title.trim().slice(0, 160)
      : `小红书来源 ${index + 1}`;
    return { title, url };
  });
  return { sources };
}

function parseJson(output: string, label: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${label}返回了无法解析的 JSON。`);
  }
}

function listFromUnknown(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["results", "items", "data", "notes"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function isTrustedNoteUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && (url.hostname === "xiaohongshu.com" || url.hostname.endsWith(".xiaohongshu.com"));
  } catch {
    return false;
  }
}

export function sanitizeSourceUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !(url.hostname === "xiaohongshu.com" || url.hostname.endsWith(".xiaohongshu.com"))) return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function sourceIdentity(rawUrl: string) {
  const sanitized = sanitizeSourceUrl(rawUrl);
  if (!sanitized) return "";
  const url = new URL(sanitized);
  const segments = url.pathname.split("/").filter(Boolean);
  const noteId = segments.at(-1);
  return noteId ? `${url.hostname}/${noteId}` : sanitized;
}

export function parseSearchResults(output: string): SearchItem[] {
  return listFromUnknown(parseJson(output, "搜索命令")).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!isTrustedNoteUrl(url)) return [];
    const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : "未命名小红书笔记";
    return [{ title: title.slice(0, 160), url }];
  });
}

export function parseNoteFields(output: string) {
  const parsed = parseJson(output, "正文命令");
  const fields: Record<string, string> = {};
  for (const item of listFromUnknown(parsed)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.field !== "string") continue;
    const value = typeof record.value === "string" || typeof record.value === "number" ? String(record.value) : "";
    fields[record.field] = value.trim();
  }
  if (!Object.keys(fields).length && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") fields[key] = String(value).trim();
    }
  }
  return fields;
}

function excerptFrom(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 320);
}

function sourceFromNote(fields: Record<string, string>, fallback: SearchItem, capturedAt: string): AgentReachSource {
  const content = fields.content ?? "";
  if (!content) throw new Error("正文为空或当前账号无权读取。");
  return {
    title: (fields.title || fallback.title).slice(0, 160),
    platform: "小红书",
    url: sanitizeSourceUrl(fallback.url),
    capturedAt,
    excerpts: excerptFrom(content) ? [excerptFrom(content)] : [],
    questions: extractInterviewQuestions(content),
    questionParserVersion: INTERVIEW_QUESTION_PARSER_VERSION,
  };
}

export const runOpenCli: ProcessRunner = (args, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn("opencli", [...args], {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) reject(error);
    else resolve(stdout);
  };
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    finish(new Error("OpenCLI 响应超时，请确认 Chrome、扩展和登录状态后重试。"));
  }, timeoutMs);
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    if (stdout.length > 2_000_000) {
      child.kill("SIGTERM");
      finish(new Error("OpenCLI 返回内容过大，已停止本次采集。"));
    }
  });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on("error", () => finish(new Error("无法启动 OpenCLI，请先安装并连接桌面扩展。")));
  child.on("close", (code) => {
    if (code === 0) finish();
    else finish(new Error(redactTransientSecrets(stderr.trim().slice(0, 240)) || `OpenCLI 退出码 ${code ?? "未知"}。`));
  });
});

export function createXiaohongshuCollector(dependencies: CollectorDependencies = {}) {
  const run = dependencies.run ?? runOpenCli;
  const wait = dependencies.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = dependencies.now ?? (() => new Date());

  return async (untrustedInput: unknown): Promise<CollectionPayload> => {
    const input = validateCollectionInput(untrustedInput);
    const deadline = Date.now() + COLLECTION_TIMEOUT_MS;
    const queryPlan = buildDeepCollectionQueries(input.query, input.company, input.role);
    const existingUrls = new Set(input.existingUrls.map(sourceIdentity).filter(Boolean));
    const discovered = new Map<string, SearchItem>();
    const candidates = new Map<string, SearchItem>();
    const queryCoverage: CollectionPayload["coverage"]["queries"] = [];
    let rawHitCount = 0;
    let existingSkippedCount = 0;
    let noNewRounds = 0;
    let stopReason: CollectionPayload["coverage"]["stopReason"] = "query_plan_exhausted";

    for (const query of queryPlan) {
      if (queryCoverage.length > 0) await wait(NOTE_INTERVAL_MS);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        stopReason = "time_limit";
        break;
      }
      try {
        const searchOutput = await run(["xiaohongshu", "search", query, "-f", "json"], Math.min(PROCESS_TIMEOUT_MS, remaining));
        const searchResults = parseSearchResults(searchOutput);
        rawHitCount += searchResults.length;
        let newUniqueCount = 0;
        for (const result of searchResults) {
          const canonicalUrl = sanitizeSourceUrl(result.url);
          const identity = sourceIdentity(result.url);
          if (!canonicalUrl || !identity || discovered.has(identity)) continue;
          discovered.set(identity, result);
          if (existingUrls.has(identity)) {
            existingSkippedCount += 1;
            continue;
          }
          candidates.set(identity, result);
          newUniqueCount += 1;
        }
        queryCoverage.push({ query, status: "completed", hitCount: searchResults.length, newUniqueCount });
        noNewRounds = newUniqueCount === 0 ? noNewRounds + 1 : 0;
      } catch (error) {
        queryCoverage.push({
          query,
          status: "failed",
          hitCount: 0,
          newUniqueCount: 0,
          error: error instanceof Error ? redactTransientSecrets(error.message) : "搜索失败。",
        });
        noNewRounds += 1;
      }
      if (queryCoverage.length >= DEEP_COLLECTION_MIN_QUERIES && candidates.size >= input.limit) {
        stopReason = "source_limit";
        break;
      }
      if (queryCoverage.length >= DEEP_COLLECTION_MIN_QUERIES && noNewRounds >= DEEP_COLLECTION_SATURATION_ROUNDS) {
        stopReason = "saturated";
        break;
      }
    }

    if (!discovered.size && queryCoverage.length && queryCoverage.every((item) => item.status === "failed")) {
      throw new Error("全部搜索轮次均失败，请检查 OpenCLI、Chrome 扩展和小红书登录状态后重试。");
    }
    if (!discovered.size) stopReason = "no_results";
    const results = [...candidates.values()].slice(0, input.limit);

    const sources: AgentReachSource[] = [];
    const failures: CollectionPayload["failures"] = [];
    for (let index = 0; index < results.length; index += 1) {
      if (index > 0) await wait(NOTE_INTERVAL_MS);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        failures.push({ title: results[index].title, reason: "本次深度采集已达到总体时限。" });
        stopReason = "time_limit";
        break;
      }
      const result = results[index];
      try {
        const noteOutput = await run(["xiaohongshu", "note", result.url, "-f", "json"], Math.min(PROCESS_TIMEOUT_MS, remaining));
        const fields = parseNoteFields(noteOutput);
        sources.push(sourceFromNote(fields, result, now().toISOString()));
      } catch (error) {
        failures.push({ title: result.title, reason: error instanceof Error ? redactTransientSecrets(error.message) : "正文读取失败。" });
      }
    }
    return {
      schemaVersion: AGENT_REACH_SCHEMA,
      target: { company: input.company, role: input.role },
      sources,
      failures,
      coverage: { queries: queryCoverage, stopReason },
      stats: {
        queryPlannedCount: queryPlan.length,
        queryExecutedCount: queryCoverage.length,
        searchHitCount: rawHitCount,
        uniqueHitCount: discovered.size,
        duplicateHitCount: Math.max(0, rawHitCount - discovered.size),
        existingSkippedCount,
        newCandidateCount: candidates.size,
        bodyReadCount: sources.length,
        questionSourceCount: sources.filter((source) => source.questions.length > 0).length,
        questionCount: sources.reduce((sum, source) => sum + source.questions.length, 0),
        failureCount: failures.length,
      },
    };
  };
}

export function createXiaohongshuSourceReindexer(dependencies: CollectorDependencies = {}) {
  const run = dependencies.run ?? runOpenCli;
  const wait = dependencies.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = dependencies.now ?? (() => new Date());

  return async (untrustedInput: unknown): Promise<SourceReindexPayload> => {
    const input = validateSourceReindexInput(untrustedInput);
    const deadline = Date.now() + REINDEX_TIMEOUT_MS;
    const sources: AgentReachSource[] = [];
    const failures: SourceReindexPayload["failures"] = [];
    for (let index = 0; index < input.sources.length; index += 1) {
      if (index > 0) await wait(NOTE_INTERVAL_MS);
      const candidate = input.sources[index];
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        failures.push({ title: candidate.title, reason: "本次重新识别已达到总体时限。" });
        break;
      }
      try {
        const output = await run(["xiaohongshu", "note", candidate.url, "-f", "json"], Math.min(PROCESS_TIMEOUT_MS, remaining));
        sources.push(sourceFromNote(parseNoteFields(output), candidate, now().toISOString()));
      } catch (error) {
        failures.push({ title: candidate.title, reason: error instanceof Error ? redactTransientSecrets(error.message) : "正文读取失败。" });
      }
    }
    return { schemaVersion: AGENT_REACH_SCHEMA, sources, failures };
  };
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 32_768) throw new Error("请求正文过大。");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求正文不是有效 JSON。");
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

export function createAgentReachMiddleware(
  collect = createXiaohongshuCollector(),
  reindex = createXiaohongshuSourceReindexer(),
) {
  return async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    const isCollection = request.url === "/api/agent-reach/xiaohongshu";
    const isReindex = request.url === "/api/agent-reach/xiaohongshu/reindex";
    if (!isCollection && !isReindex) return next();
    if (request.method !== "POST") return sendJson(response, 405, { error: "仅支持 POST 请求。" });
    if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      return sendJson(response, 415, { error: "仅接受 application/json。" });
    }
    try {
      const body = await readJsonBody(request);
      sendJson(response, 200, isReindex ? await reindex(body) : await collect(body));
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? redactTransientSecrets(error.message) : "采集失败。" });
    }
  };
}

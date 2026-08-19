import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { composeInterviewQuestions } from "../deepseek-interview-bridge";
import { generateQuestionBanks } from "../src/engine";
import {
  evaluateCompositionObservation,
  renderCompositionObservationComparisonMarkdown,
  renderCompositionObservationMarkdown,
  type CompositionCaseObservation,
  type CompositionObservationReport,
} from "../src/question-composition-observation";
import { QUESTION_COMPOSITION_GOLDEN_CASES } from "../src/test/fixtures/question-composition-golden";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDirectory = resolve(projectDirectory, "..");

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (!process.argv.includes("--confirm-live")) {
  throw new Error("真实观察会调用 DeepSeek。请显式添加 --confirm-live；每个案例只调用一次且不会重试。");
}
if (process.env.CI && !process.argv.includes("--allow-ci")) {
  throw new Error("真实 DeepSeek 观察默认禁止在 CI 中运行。");
}

const localEnv = loadEnv("development", projectDirectory, "");
const workspaceEnv = loadEnv("development", workspaceDirectory, "");
const apiKey = process.env.DEEPSEEK_API_KEY || localEnv.DEEPSEEK_API_KEY || workspaceEnv.DEEPSEEK_API_KEY;
const model = process.env.DEEPSEEK_INTERVIEW_MODEL
  || localEnv.DEEPSEEK_INTERVIEW_MODEL
  || workspaceEnv.DEEPSEEK_INTERVIEW_MODEL
  || process.env.DEEPSEEK_RESUME_MODEL
  || localEnv.DEEPSEEK_RESUME_MODEL
  || workspaceEnv.DEEPSEEK_RESUME_MODEL
  || "deepseek-v4-pro";
if (!apiKey) throw new Error("没有找到本机 DeepSeek Key。请在未提交的 .env.local 中配置后再运行。");

const generatedAt = new Date().toISOString();
const outputPath = resolve(projectDirectory, argumentValue("--output") || `docs/observations/${generatedAt.replace(/[:.]/g, "-")}-question-composition.md`);
const jsonPath = outputPath.replace(/\.md$/i, ".json");
const cases: CompositionCaseObservation[] = [];

for (const golden of QUESTION_COMPOSITION_GOLDEN_CASES) {
  const attemptedAt = new Date().toISOString();
  const inputFingerprint = createHash("sha256")
    .update(JSON.stringify({ id: golden.id, target: golden.target, jdText: golden.jdText, resumeText: golden.resumeText, source: golden.source }))
    .digest("hex")
    .slice(0, 16);
  const localCandidates = generateQuestionBanks({
    company: golden.target.company,
    role: golden.target.role,
    jdText: golden.jdText,
    resumeText: golden.resumeText,
    experienceText: "",
    experienceOrigin: "agent",
    experienceSources: [golden.source],
  });
  try {
    const result = await composeInterviewQuestions({
      company: golden.target.company,
      role: golden.target.role,
      targetKey: golden.target.key,
      jdText: golden.jdText,
      resumeText: golden.resumeText,
      localCandidates,
      experienceSources: [{
        id: golden.source.id,
        targetKey: golden.target.key,
        title: golden.source.title,
        platform: golden.source.platform,
        url: golden.source.url,
        excerpt: golden.source.excerpt,
        questions: golden.source.questions,
      }],
    }, { apiKey, model, timeoutMs: 60_000 });
    const evaluated = evaluateCompositionObservation(golden, result);
    cases.push({
      caseId: golden.id,
      label: golden.label,
      targetRole: golden.target.role,
      inputFingerprint,
      attemptedAt,
      callStatus: "completed",
      model: result.model,
      ...evaluated,
      manualReview: {
        status: "pending",
        roleRelevance: "待根据脱敏题目标题人工检查。",
        questionDepth: "待检查是否形成具体、单一且有区分度的深挖。",
        coverageBalance: "待检查简历、JD 与面经原题的整体配比。",
        notes: "真实调用已完成；等待人工审阅，不重复调用择优。",
      },
    });
  } catch (caught) {
    const error = caught as { code?: string; message?: string };
    cases.push({
      caseId: golden.id,
      label: golden.label,
      targetRole: golden.target.role,
      inputFingerprint,
      attemptedAt,
      callStatus: "failed",
      model,
      questionCount: 0,
      warningCodes: [],
      machineStatus: "fail",
      rubric: [],
      questions: [],
      manualReview: { status: "pending", roleRelevance: "未生成", questionDepth: "未生成", coverageBalance: "未生成", notes: "调用失败且未重试。" },
      error: { code: error.code || "OBSERVATION_FAILED", message: error.message || "真实观察调用失败。" },
    });
  }
}

const report: CompositionObservationReport = {
  schemaVersion: "interview.question-composition-observation.v1",
  generatedAt,
  runPolicy: { liveCalls: true, attemptsPerCase: 1, retries: false, storesRawMaterials: false, storesRawModelResponse: false },
  cases,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputPath, renderCompositionObservationMarkdown(report), "utf8");
process.stdout.write(`已完成 ${cases.length} 个案例的单次受控观察。\nMarkdown: ${outputPath}\nJSON: ${jsonPath}\n`);
const baselineArgument = argumentValue("--baseline");
if (baselineArgument) {
  const baselinePath = resolve(projectDirectory, baselineArgument);
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as CompositionObservationReport;
  if (baseline.schemaVersion !== "interview.question-composition-observation.v1" || !Array.isArray(baseline.cases)) {
    throw new Error("基线观察报告结构无效，无法生成对比。");
  }
  const comparisonPath = resolve(projectDirectory, argumentValue("--comparison-output") || outputPath.replace(/\.md$/i, "-comparison.md"));
  await writeFile(comparisonPath, renderCompositionObservationComparisonMarkdown(baseline, report), "utf8");
  process.stdout.write(`Comparison: ${comparisonPath}\n`);
}

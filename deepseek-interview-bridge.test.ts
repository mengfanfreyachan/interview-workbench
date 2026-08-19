import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { analyzeInterviewAnswer, composeInterviewQuestions, createDeepSeekInterviewMiddleware, createDeepSeekKeySession, validateInterviewAnalysisInput, validateQuestionCompositionInput } from "./deepseek-interview-bridge";

const input = {
  company: "字节跳动",
  role: "豆包大模型产品经理",
  targetKey: "字节跳动::豆包大模型产品经理",
  jdText: "负责大模型产品的用户研究、需求判断与跨团队落地，并通过可靠指标验证产品价值。",
  resumeText: "候选人负责过一项智能产品项目，通过用户访谈和行为数据定位问题，协调设计与研发完成原型迭代，并在两周内完成小范围验证。候选人记录了指标口径、实验结论和后续复盘，也明确区分了个人行动与团队结果。",
  question: {
    id: "resume-1",
    kind: "resume" as const,
    category: "resume_deep_dive" as const,
    title: "请讲一次你从用户反馈中发现问题并推动落地的经历。",
    intent: "核对问题发现、行动和结果之间的证据链。",
    cues: ["背景与目标", "个人行动", "验证结果"],
    origin: "简历事实生成",
    provenance: "source_derived" as const,
    sourceRefs: [{ sourceId: "CV-01", sourceKind: "resume" as const, label: "当前简历", locator: "项目经历", excerpt: "通过用户访谈和行为数据定位问题" }],
  },
  experienceSources: [],
  previousTurns: [],
  answer: "我先通过八次用户访谈确认新用户理解成本较高，然后结合行为数据定位到首次配置环节。我负责整理问题、推动设计和研发调整流程，两周后用同一口径复测，完成率有所提升。复盘时我也记录了样本量有限，不能把全部变化都归因于这次改动。",
};

const validModelOutput = {
  reviewId: "REV-01",
  presentedEvidence: [{ id: "OBS-01", observation: "回答说明了访谈与行为数据的组合使用。", impact: "形成了问题定位证据。", confidence: "high", sourceRefs: [{ sourceId: "USR-01", quote: "通过八次用户访谈" }], nextAction: "补充样本选择方法。", capabilitySignal: "用户研究", status: "demonstrated" }],
  missingFacts: [{ id: "OBS-02", observation: "本次回答尚未说明完成率的具体变化。", impact: "无法核对结果幅度。", confidence: "high", sourceRefs: [{ sourceId: "USR-01" }], nextAction: "补充基线、结果与样本量。", status: "unresolved" }],
  communicationIssues: [],
  strategyRisks: [],
  jdConnections: [{ id: "OBS-03", observation: "回答与 JD 的用户研究要求直接相关，并用本轮事实作了佐证。", impact: "呈现了岗位所需的问题定位能力。", confidence: "high", sourceRefs: [{ sourceId: "JD-01", quote: "用户研究" }, { sourceId: "USR-01", quote: "八次用户访谈" }], nextAction: "补充验证结果。", jdRequirement: "用户研究与指标验证", status: "partial", experienceEvidence: "demonstrated" }],
  priorityImprovement: { observation: "优先补齐结果证据。", action: "重答时补充完成率基线、复测值和样本量。", retryConstraint: "90 秒内，只补真实数据。", successSignal: "结果口径可以核对。", sourceRefs: [{ sourceId: "USR-01" }, { sourceId: "JD-01" }], relatedObservationIds: ["OBS-02", "OBS-03"] },
  nextFollowUp: { question: "完成率的统计口径、基线和样本量分别是什么？", intent: "metric_validity", testsSignal: "指标有效性", origin: "coach_generated", sourceRefs: [{ sourceId: "USR-01" }, { sourceId: "JD-01" }] },
  limitations: ["本次只审阅单次回答，未验证数字真实性。"],
};

const sourceQuestion = {
  id: "imported-exp-1-1",
  kind: "role" as const,
  category: "role_capability" as const,
  title: "如何平衡用户体验和商业目标？",
  intent: "验证真实面试语境中的判断。",
  cues: [],
  origin: "Agent Reach 导入" as const,
  provenance: "source_question" as const,
  sourceId: "exp-1",
  sourceRefs: [{ sourceId: "exp-1", sourceKind: "interview_experience" as const, label: "某平台 · 脱敏面经", excerpt: "如何平衡用户体验和商业目标？" }],
};

const compositionInput = {
  company: input.company,
  role: input.role,
  targetKey: input.targetKey,
  jdText: input.jdText,
  resumeText: input.resumeText,
  localCandidates: [input.question, sourceQuestion],
  experienceSources: [{ id: "exp-1", targetKey: input.targetKey, title: "脱敏面经", platform: "某平台", url: "https://example.com/post", excerpt: "面试侧重用户判断。", questions: [sourceQuestion.title] }],
};

const callMiddleware = (
  middleware: ReturnType<typeof createDeepSeekInterviewMiddleware>,
  method: string,
  url: string,
  body?: unknown,
  requestHeaders: Record<string, string> = {},
) => new Promise<{ status: number; payload: Record<string, unknown>; headers: Record<string, string> }>((resolve, reject) => {
  const request = new PassThrough() as PassThrough & IncomingMessage;
  request.method = method;
  request.url = url;
  request.headers = body === undefined ? requestHeaders : { "content-type": "application/json", ...requestHeaders };
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    end(value: string) {
      resolve({ status: this.statusCode, payload: JSON.parse(value) as Record<string, unknown>, headers });
      return this;
    },
  } as unknown as ServerResponse;
  middleware(request, response, () => reject(new Error("middleware unexpectedly called next")));
  request.end(body === undefined ? undefined : JSON.stringify(body));
});

describe("DeepSeek interview analysis bridge", () => {
  it("keeps a user key only in the server session and falls back to environment config", () => {
    const session = createDeepSeekKeySession("environment-private-key");
    expect(session.status()).toEqual({ configured: true, keySource: "environment" });

    session.set("session-private-key");
    expect(session.currentKey()).toBe("session-private-key");
    expect(session.status()).toEqual({ configured: true, keySource: "session" });
    expect(JSON.stringify(session.status())).not.toContain("session-private-key");

    session.clear();
    expect(session.currentKey()).toBe("environment-private-key");
    expect(session.status()).toEqual({ configured: true, keySource: "environment" });
  });

  it("rejects unsafe session key values without replacing the active key", () => {
    const session = createDeepSeekKeySession();
    expect(() => session.set("short")).toThrow("格式无效");
    expect(() => session.set("valid-key-with whitespace")).toThrow("格式无效");
    expect(session.status()).toEqual({ configured: false, keySource: "none" });
  });

  it("configures and removes a BYOK session without returning the secret", async () => {
    const middleware = createDeepSeekInterviewMiddleware({ model: "deepseek-v4-pro" });
    const secret = "session-private-key-for-test";
    const configured = await callMiddleware(middleware, "POST", "/api/deepseek/interview-analysis/session-key", { apiKey: secret });
    expect(configured.status).toBe(200);
    expect(configured.payload).toMatchObject({ configured: true, keySource: "session", sessionKeyConfigurable: true });
    expect(configured.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(configured.payload)).not.toContain(secret);

    const status = await callMiddleware(middleware, "GET", "/api/deepseek/interview-analysis/status");
    expect(status.payload).toMatchObject({ configured: true, keySource: "session" });
    expect(JSON.stringify(status.payload)).not.toContain(secret);

    const removed = await callMiddleware(middleware, "DELETE", "/api/deepseek/interview-analysis/session-key");
    expect(removed.payload).toMatchObject({ configured: false, keySource: "none" });
  });

  it("rejects cross-origin browser requests before accepting a key", async () => {
    const middleware = createDeepSeekInterviewMiddleware({ model: "deepseek-v4-pro" });
    const rejected = await callMiddleware(
      middleware,
      "POST",
      "/api/deepseek/interview-analysis/session-key",
      { apiKey: "session-private-key-for-test" },
      { origin: "https://attacker.example", host: "127.0.0.1:4173" },
    );
    expect(rejected.status).toBe(403);
    expect(rejected.payload).toMatchObject({ code: "ORIGIN_NOT_ALLOWED" });
  });

  it("validates bounded interview materials", () => {
    expect(validateInterviewAnalysisInput(input)).toMatchObject({ company: "字节跳动", role: "豆包大模型产品经理" });
    expect(() => validateInterviewAnalysisInput({ ...input, answer: "太短" })).toThrow("至少需要 30 个字符");
    expect(() => validateInterviewAnalysisInput({ ...input, question: { ...input.question, kind: "unknown" } })).toThrow("类型无效");
  });

  it("validates scoped question-composition materials", () => {
    expect(validateQuestionCompositionInput(compositionInput).localCandidates).toHaveLength(2);
    expect(() => validateQuestionCompositionInput({ ...compositionInput, experienceSources: [{ ...compositionInput.experienceSources[0], targetKey: "另一公司::另一岗位" }] })).toThrow("不属于当前岗位");
    expect(() => validateQuestionCompositionInput({ ...compositionInput, localCandidates: [{ ...sourceQuestion, sourceRefs: [{ ...sourceQuestion.sourceRefs[0], sourceId: "missing" }] }] })).toThrow("可验证来源");
  });

  it("keeps selected source questions verbatim and marks generated questions as coach_generated", async () => {
    let requestBody = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        selectedCandidateIds: [sourceQuestion.id],
        generatedQuestions: [{ category: "resume_deep_dive", title: "你如何验证这次用户研究的结论？", intent: "核对验证方法。", cues: ["说明样本"], sourceRefs: [{ sourceId: "CV-01", quote: "用户访谈和行为数据" }] }],
      }) } }] }), { status: 200 });
    };
    const result = await composeInterviewQuestions(compositionInput, { apiKey: "private-test-key", fetchImpl });
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toMatchObject({ title: sourceQuestion.title, provenance: "source_question", sourceId: "exp-1" });
    expect(result.questions[1]).toMatchObject({ provenance: "coach_generated", origin: "DeepSeek 智能组题", category: "resume_deep_dive" });
    expect(result.warnings).toEqual([]);
    expect(JSON.parse(requestBody)).toMatchObject({ max_tokens: 4_000, response_format: { type: "json_object" } });
  });

  it("accepts composition quotes after NFKC, whitespace, and limited punctuation normalization", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      selectedCandidateIds: [],
      generatedQuestions: [{
        category: "resume_deep_dive",
        title: "你如何验证用户研究结论？",
        intent: "核对验证方法。",
        sourceRefs: [{ sourceId: "CV-01", quote: "用户访谈， 和　行为数据；ＡＩ产品" }],
      }],
    }) } }] }), { status: 200 });

    const result = await composeInterviewQuestions({ ...compositionInput, resumeText: `${compositionInput.resumeText} 用户访谈和行为数据 AI 产品` }, { apiKey: "private-test-key", fetchImpl });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].sourceRefs?.[0]).toMatchObject({ sourceId: "CV-01", excerpt: "用户访谈， 和　行为数据；ＡＩ产品" });
    expect(result.warnings).toEqual([]);
  });

  it("skips invalid selected and generated questions while retaining valid questions and warnings", async () => {
    const responseFor = (output: unknown): typeof fetch => async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
    const result = await composeInterviewQuestions(compositionInput, { apiKey: "private-test-key", fetchImpl: responseFor({
      selectedCandidateIds: [sourceQuestion.id, "missing-candidate", sourceQuestion.id],
      generatedQuestions: [
        { category: "role_capability", title: "虚构题？", intent: "测试", provenance: "source_question", sourceRefs: [{ sourceId: "JD-01", quote: "用户研究" }] },
        { category: "role_capability", title: "引用题？", intent: "测试", sourceRefs: [{ sourceId: "JD-01", quote: "JD 中不存在的内容" }] },
        { category: "role_capability", title: "如何判断大模型产品需求？", intent: "核对需求判断。", sourceRefs: [{ sourceId: "JD-01", quote: "需求判断" }] },
      ],
    }) });

    expect(result.questions.map((question) => question.title)).toEqual([sourceQuestion.title, "如何判断大模型产品需求？"]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "selected_candidate", itemIndex: 2, code: "INVALID_CANDIDATE_ID" }),
      expect.objectContaining({ scope: "selected_candidate", itemIndex: 3, code: "DUPLICATE_CANDIDATE_ID" }),
      expect.objectContaining({ scope: "generated_question", itemIndex: 1, code: "SOURCE_QUESTION_IMPERSONATION" }),
      expect.objectContaining({ scope: "generated_question", itemIndex: 2, code: "UNVERIFIABLE_QUOTE" }),
    ]));
  });

  it("skips generic JD restatements and multi-focus generated questions", async () => {
    const genericJdCandidate = {
      ...compositionInput.localCandidates[0],
      id: "generic-jd-candidate",
      kind: "role" as const,
      category: "role_capability" as const,
      title: "JD 提到“负责用户研究与需求分析”。请说明你会如何在实际工作中做到这一点？",
      sourceRefs: [{ sourceId: "JD-01", sourceKind: "jd" as const, label: "当前岗位 JD", excerpt: "用户研究" }],
    };
    let requestBody = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        selectedCandidateIds: [sourceQuestion.id, genericJdCandidate.id],
        generatedQuestions: [
          { category: "resume_deep_dive", title: "你具体负责了什么？又如何协调团队？", intent: "测试多问。", sourceRefs: [{ sourceId: "CV-01", quote: "协调设计与研发" }] },
          { category: "role_capability", title: "如果实验结果与用户访谈冲突，你会优先核验哪项证据？", intent: "测试决策。", sourceRefs: [{ sourceId: "JD-01", quote: "用户研究" }] },
        ],
      }) } }] }), { status: 200 });
    };
    const result = await composeInterviewQuestions({ ...compositionInput, localCandidates: [...compositionInput.localCandidates, genericJdCandidate] }, { apiKey: "private-test-key", fetchImpl });
    expect(result.questions.map((question) => question.title)).toEqual([sourceQuestion.title, "如果实验结果与用户访谈冲突，你会优先核验哪项证据？"]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "GENERIC_JD_RESTATEMENT" }),
      expect.objectContaining({ code: "MULTI_FOCUS_QUESTION" }),
    ]));
    const prompt = JSON.parse(requestBody).messages.map((message: { content: string }) => message.content).join("\n");
    expect(prompt).toContain("categoryDifferenceMaximum");
    expect(prompt).toContain("一个主要问题");
  });

  it("trims a dominant category until the final difference is at most two", async () => {
    const responseFor: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      selectedCandidateIds: [sourceQuestion.id],
      generatedQuestions: [1, 2, 3, 4].map((index) => ({
        category: "resume_deep_dive",
        title: `第 ${index} 项经历中最关键的个人决策是什么？`,
        intent: "核对个人决策。",
        sourceRefs: [{ sourceId: "CV-01", quote: "用户访谈" }],
      })),
    }) } }] }), { status: 200 });
    const result = await composeInterviewQuestions(compositionInput, { apiKey: "private-test-key", fetchImpl: responseFor });
    expect(result.questions.filter((question) => question.category === "resume_deep_dive")).toHaveLength(3);
    expect(result.questions.filter((question) => question.category === "role_capability")).toHaveLength(1);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CATEGORY_BALANCE_LIMIT" })]));
  });

  it("skips a generated question that copies a selected source question", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      selectedCandidateIds: [sourceQuestion.id],
      generatedQuestions: [
        { category: "role_capability", title: "如何平衡用户体验和商业目标?", intent: "重复题。", sourceRefs: [{ sourceId: "exp-1", quote: sourceQuestion.title }] },
        { category: "resume_deep_dive", title: "这次项目中最关键的个人决策是什么？", intent: "核对决策。", sourceRefs: [{ sourceId: "CV-01", quote: "用户访谈" }] },
      ],
    }) } }] }), { status: 200 });
    const result = await composeInterviewQuestions(compositionInput, { apiKey: "private-test-key", fetchImpl });
    expect(result.questions.map((question) => question.title)).toEqual([sourceQuestion.title, "这次项目中最关键的个人决策是什么？"]);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "DUPLICATE_QUESTION_TITLE" })]));
  });

  it("fails the composition only when every returned question is unusable", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      selectedCandidateIds: ["missing-candidate"],
      generatedQuestions: [{ category: "role_capability", title: "引用题？", intent: "测试", sourceRefs: [{ sourceId: "JD-01", quote: "JD 中不存在的内容" }] }],
    }) } }] }), { status: 200 });

    await expect(composeInterviewQuestions(compositionInput, { apiKey: "private-test-key", fetchImpl })).rejects.toThrow("均未通过来源校验");
  });

  it("uses the fixed DeepSeek endpoint, keeps the key server-side, and normalizes JSON output", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validModelOutput) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json", "x-request-id": "request-test" },
      });
    };

    const result = await analyzeInterviewAnswer(input, {
      apiKey: "private-test-key",
      model: "deepseek-v4-pro",
      fetchImpl,
      now: () => new Date("2026-08-10T12:00:00.000Z"),
    });

    expect(capturedUrl).toBe("https://api.deepseek.com/chat/completions");
    expect(new Headers(capturedInit?.headers).get("Authorization")).toBe("Bearer private-test-key");
    const requestBody = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(requestBody).toMatchObject({ model: "deepseek-v4-pro", response_format: { type: "json_object" }, thinking: { type: "disabled" }, stream: false });
    expect(JSON.stringify(requestBody)).toContain(input.answer);
    expect(result.analysis.schemaVersion).toBe("interview.evidence-review.v1");
    expect(result.analysis.jdConnections[0].status).toBe("partial");
    expect(result).toMatchObject({ model: "deepseek-v4-pro", analysis: { generatedAt: "2026-08-10T12:00:00.000Z" } });
    expect(JSON.stringify(requestBody)).not.toContain("scoreScale");
    expect(JSON.stringify(result)).not.toContain("private-test-key");
  });

  it("includes one prior turn as separately labeled context for a follow-up review", async () => {
    let requestBody = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validModelOutput) } }] }), { status: 200 });
    };
    await analyzeInterviewAnswer({ ...input, previousTurns: [{ question: "第一问", answer: "第一轮用户回答内容足够长。", reviewSummary: "第一轮尚未说明个人贡献。" }] }, { apiKey: "private-test-key", fetchImpl });
    expect(requestBody).toContain("USR-PREV-1");
    expect(requestBody).toContain("第一轮用户回答内容足够长");
  });

  it("does not call the network when the API key is missing", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response();
    };
    await expect(analyzeInterviewAnswer(input, { fetchImpl })).rejects.toThrow("尚未配置 DeepSeek API key");
    expect(called).toBe(false);
  });

  it.each([
    [401, "密钥无效"],
    [402, "余额不足"],
    [429, "请求过于频繁"],
    [503, "服务暂时繁忙"],
  ])("maps upstream status %s to a safe actionable error", async (status, message) => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ error: { message: "sensitive upstream detail" } }), { status });
    await expect(analyzeInterviewAnswer(input, { apiKey: "private-test-key", fetchImpl })).rejects.toThrow(message);
  });

  it("rejects incomplete model output instead of displaying it", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "只有总结" }) } }] }), { status: 200 });
    await expect(analyzeInterviewAnswer(input, { apiKey: "private-test-key", fetchImpl })).rejects.toThrow("证据审阅不符合来源协议");
  });

  it("rejects a quote that does not exist in its claimed source", async () => {
    const ungrounded = structuredClone(validModelOutput);
    ungrounded.presentedEvidence[0].sourceRefs[0].quote = "回答中不存在的虚构原句";
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ungrounded) } }] }), { status: 200 });
    await expect(analyzeInterviewAnswer(input, { apiKey: "private-test-key", fetchImpl })).rejects.toThrow("证据审阅不符合来源协议");
  });
});

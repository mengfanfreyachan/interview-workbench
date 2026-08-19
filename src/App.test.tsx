// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { INTERVIEW_REVIEW_SCHEMA_VERSION, type EvidenceReviewV1 } from "./interview-review-protocol";
import { SAMPLE_COMPANY } from "./sample-data";
import { createExperienceTarget } from "./target-scope";
import type { ExperienceSource, Question, WorkbenchState } from "./types";
import { WORKBENCH_STORAGE_KEY } from "./workbench-repository";

const savedAt = "2026-08-14T08:00:00.000Z";

const sourceFor = (id: string, title: string, target: ReturnType<typeof createExperienceTarget>, question: string): ExperienceSource => ({
  id,
  title,
  platform: "脱敏测试平台",
  url: "",
  capturedAt: savedAt,
  excerpt: `${target.company} ${target.role} 的脱敏面经正文。`,
  questions: [question],
  importMethod: "manual",
  target,
});

const questionFor = (id: string, title: string, source: ExperienceSource): Question => ({
  id,
  kind: "role",
  category: "role_capability",
  title,
  intent: "验证当前岗位材料是否保持隔离。",
  cues: [],
  origin: "用户导入面经",
  provenance: "source_question",
  sourceId: source.id,
  sourceRefs: [{ sourceId: source.id, sourceKind: "interview_experience", label: `${source.platform} · ${source.title}`, excerpt: title }],
});

const workbenchState = ({
  activeTarget,
  targets,
  sources,
  questions,
}: {
  activeTarget: ReturnType<typeof createExperienceTarget>;
  targets: Array<{ target: ReturnType<typeof createExperienceTarget>; jd: string; experience: string }>;
  sources: ExperienceSource[];
  questions: Question[];
}): WorkbenchState => ({
  company: activeTarget.company,
  role: activeTarget.role,
  jdDrafts: Object.fromEntries(targets.map(({ target, jd }) => [target.key, { target, text: jd, sourceName: "页面测试 JD", updatedAt: savedAt }])),
  experienceDrafts: Object.fromEntries(targets.map(({ target, experience }) => [target.key, { target, text: experience, origin: "manual" as const }])),
  experienceLibraries: Object.fromEntries(targets.map(({ target }) => [target.key, { id: target.key, target, createdAt: savedAt, updatedAt: savedAt }])),
  experienceSources: sources,
  resumeText: "这是一份仅用于页面回归测试的脱敏简历正文，包含足够长度的项目背景、个人行动、协作过程、验证结果和复盘信息，不包含任何真实个人资料。候选人在资源有限的情况下推动跨团队方案落地，并通过统一口径的数据记录完成效果核验。",
  questions,
  questionsTargetKey: activeTarget.key,
  selectedQuestionId: questions[0]?.id ?? "",
  answer: "",
  review: null,
  activeSession: null,
  trainingSessions: [],
  updatedAt: savedAt,
});

const jsonResponse = (payload: unknown, ok = true) => ({
  ok,
  json: async () => payload,
});

const renderWorkbench = (fetchImpl: typeof fetch = vi.fn(async () => jsonResponse({
    ok: true,
    configured: false,
    model: "deepseek-v4-pro",
    keySource: "none",
  })) as unknown as typeof fetch) => {
  vi.stubGlobal("fetch", fetchImpl);
  return render(<App />);
};

const reviewFor = (target: ReturnType<typeof createExperienceTarget>, question: Question, followUp: string, reviewId: string): EvidenceReviewV1 => ({
  schemaVersion: INTERVIEW_REVIEW_SCHEMA_VERSION,
  reviewId,
  generatedAt: savedAt,
  target,
  question: { id: question.id, text: question.title, origin: question.provenance ?? "source_derived", sourceRefs: [{ sourceId: "USR-01" }] },
  sourceLedger: [
    { id: "JD-01", kind: "jd", title: "当前岗位 JD", targetKey: target.key, provenance: "material_fact" },
    { id: "USR-01", kind: "user_answer", title: "本轮回答", targetKey: target.key, provenance: "user_claim_unverified" },
  ],
  presentedEvidence: [{
    id: `${reviewId}-OBS-1`,
    observation: "回答给出了可核对的个人行动。",
    impact: "能够支持当前能力判断。",
    confidence: "high",
    sourceRefs: [{ sourceId: "USR-01" }],
    nextAction: "继续补充结果口径。",
    capabilitySignal: "证据表达",
    status: "demonstrated",
  }],
  missingFacts: [],
  communicationIssues: [],
  strategyRisks: [],
  jdConnections: [],
  priorityImprovement: {
    observation: "优先补充验证结果。",
    action: "说明基线、行动和最终变化。",
    retryConstraint: "90 秒内回答。",
    successSignal: "结果口径可以核对。",
    sourceRefs: [{ sourceId: "USR-01" }],
    relatedObservationIds: [`${reviewId}-OBS-1`],
  },
  nextFollowUp: {
    question: followUp,
    intent: "metric_validity",
    testsSignal: "结果验证",
    origin: "coach_generated",
    sourceRefs: [{ sourceId: "USR-01" }],
  },
  limitations: ["仅用于页面流程测试。"],
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("面试工作台页面核心流程", () => {
  it("先预览备份，确认后才完整恢复并写入浏览器存储", async () => {
    const user = userEvent.setup();
    const restoredTarget = createExperienceTarget("恢复测试公司", "恢复测试岗位");
    const restoredJd = "恢复后的 JD：负责用户研究、需求判断、跨团队协作与结果验证。";
    const restoredQuestionText = "恢复后可见的岗位真题是什么？";
    const restoredSource = sourceFor("restored-source", "恢复后的面经来源", restoredTarget, restoredQuestionText);
    const restoredState = workbenchState({
      activeTarget: restoredTarget,
      targets: [{ target: restoredTarget, jd: restoredJd, experience: restoredQuestionText }],
      sources: [restoredSource],
      questions: [questionFor("restored-question", restoredQuestionText, restoredSource)],
    });

    renderWorkbench();
    await waitFor(() => expect(localStorage.getItem(WORKBENCH_STORAGE_KEY)).not.toBeNull());

    const companyInput = screen.getByRole("textbox", { name: "公司" });
    expect(companyInput).toHaveValue(SAMPLE_COMPANY);

    const file = new File([JSON.stringify({ schemaVersion: 6, ...restoredState })], "恢复备份.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("导入备份"), file);

    const dialog = await screen.findByRole("dialog", { name: "确认替换当前工作台" });
    expect(within(dialog).getByText("恢复备份.json")).toBeInTheDocument();
    expect(within(dialog).getByText("公司与岗位").closest("div")?.querySelector("dd")).toHaveTextContent("1");
    expect(within(dialog).getByText("面经来源").closest("div")?.querySelector("dd")).toHaveTextContent("1");
    expect(within(dialog).getByText("当前题库").closest("div")?.querySelector("dd")).toHaveTextContent("1");
    expect(companyInput).toHaveValue(SAMPLE_COMPANY);

    await user.click(within(dialog).getByRole("button", { name: "完整替换并恢复" }));

    await waitFor(() => expect(companyInput).toHaveValue(restoredTarget.company));
    expect(screen.getByRole("textbox", { name: "岗位" })).toHaveValue(restoredTarget.role);
    expect(screen.getByRole("textbox", { name: "JD 原文 · 可编辑" })).toHaveValue(restoredJd);
    expect(screen.getByText(restoredSource.title)).toBeInTheDocument();
    expect(screen.getAllByText(restoredQuestionText).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "确认替换当前工作台" })).not.toBeInTheDocument();
    expect(screen.getByText(/已从 恢复备份\.json 完整恢复工作台/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) ?? "{}")).toMatchObject({ company: restoredTarget.company, role: restoredTarget.role });
  });

  it("切换面经库后只显示当前岗位的 JD、面经和题库", async () => {
    const user = userEvent.setup();
    const targetA = createExperienceTarget("甲公司", "产品岗位");
    const targetB = createExperienceTarget("乙公司", "法务岗位");
    const jdA = "甲公司产品岗位 JD：负责产品策略与用户研究。";
    const jdB = "乙公司法务岗位 JD：负责合同审查与合规研究。";
    const questionA = "甲公司当前岗位专属真题？";
    const sourceA = sourceFor("source-a", "甲公司专属面经", targetA, questionA);
    const sourceB = sourceFor("source-b", "乙公司专属面经", targetB, "乙公司法务面试关注什么？");
    const storedState = workbenchState({
      activeTarget: targetA,
      targets: [
        { target: targetA, jd: jdA, experience: questionA },
        { target: targetB, jd: jdB, experience: "乙公司法务面经正文。" },
      ],
      sources: [sourceA, sourceB],
      questions: [questionFor("question-a", questionA, sourceA)],
    });
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({ schemaVersion: 6, ...storedState }));

    renderWorkbench();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "公司" })).toHaveValue(targetA.company));
    expect(screen.getByRole("textbox", { name: "JD 原文 · 可编辑" })).toHaveValue(jdA);
    expect(screen.getByText(sourceA.title)).toBeInTheDocument();
    expect(screen.getAllByText(questionA).length).toBeGreaterThan(0);

    const targetBCard = screen.getByRole("heading", { name: targetB.company }).closest("article");
    expect(targetBCard).not.toBeNull();
    await user.click(within(targetBCard as HTMLElement).getByRole("button", { name: /打开面经库/ }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "公司" })).toHaveValue(targetB.company));
    expect(screen.getByRole("textbox", { name: "岗位" })).toHaveValue(targetB.role);
    expect(screen.getByRole("textbox", { name: "JD 原文 · 可编辑" })).toHaveValue(jdB);
    expect(screen.getByText(sourceB.title)).toBeInTheDocument();
    expect(screen.queryByText(sourceA.title)).not.toBeInTheDocument();
    expect(screen.queryByText(questionA)).not.toBeInTheDocument();
    expect(screen.getAllByText("当前材料不足，暂未生成这一类题目。")).toHaveLength(2);
    expect(screen.getByText(/其他岗位 1 篇/)).toBeInTheDocument();

    const targetACard = screen.getByRole("heading", { name: targetA.company }).closest("article");
    expect(targetACard).not.toBeNull();
    await user.click(within(targetACard as HTMLElement).getByRole("button", { name: /打开面经库/ }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "公司" })).toHaveValue(targetA.company));
    expect(screen.getByRole("textbox", { name: "JD 原文 · 可编辑" })).toHaveValue(jdA);
    expect(screen.getByText(sourceA.title)).toBeInTheDocument();
    expect(screen.queryByText(sourceB.title)).not.toBeInTheDocument();
    expect(screen.getAllByText(questionA).length).toBeGreaterThan(0);
  });

  it("展示深度采集等待状态、增量请求和可解释覆盖报告", async () => {
    const user = userEvent.setup();
    let finishCollection: ((response: ReturnType<typeof jsonResponse>) => void) | undefined;
    const pendingCollection = new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
      finishCollection = resolve;
    });
    let collectionRequest: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/deepseek/interview-analysis/status")) {
        return jsonResponse({ configured: false, model: "deepseek-v4-pro", keySource: "none" });
      }
      if (url.includes("/api/agent-reach/xiaohongshu")) {
        collectionRequest = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return await pendingCollection;
      }
      throw new Error(`未预期的测试请求：${url}`);
    }) as unknown as typeof fetch;

    renderWorkbench(fetchImpl);
    await user.click(screen.getByRole("tab", { name: "Agent Reach 结果" }));
    await user.click(screen.getByRole("button", { name: "开始深度采集" }));

    expect(await screen.findByText("深度采集中")).toBeInTheDocument();
    expect(screen.getByText(/正在依次扩展搜索、去重并串行读取正文/)).toBeInTheDocument();
    expect(collectionRequest).toMatchObject({ limit: 20 });
    expect(collectionRequest?.existingUrls).toEqual(expect.any(Array));

    await act(async () => {
      finishCollection?.(jsonResponse({
        schemaVersion: "agent-reach.interview-experience.v1",
        target: { company: SAMPLE_COMPANY, role: "产品运营实习生（商业产品方向）" },
        sources: [{
          title: "采集成功的脱敏面经",
          platform: "小红书",
          url: "https://www.xiaohongshu.com/explore/test?xsec_token=temporary",
          capturedAt: savedAt,
          excerpts: ["正文包含两道脱敏问题。"],
          questions: ["采集真题一？", "采集真题二？"],
        }],
        failures: [{ title: "未读取的脱敏来源", reason: "正文暂时不可读" }],
        coverage: {
          stopReason: "saturated",
          queries: [
            { query: "脱敏公司 产品运营 面经", status: "completed", hitCount: 8, newUniqueCount: 5 },
            { query: "脱敏公司 产品运营 面试", status: "completed", hitCount: 6, newUniqueCount: 1 },
            { query: "脱敏公司 运营 面试题", status: "completed", hitCount: 3, newUniqueCount: 0 },
            { query: "脱敏公司 运营 一面 二面", status: "completed", hitCount: 3, newUniqueCount: 0 },
          ],
        },
        stats: { queryPlannedCount: 6, queryExecutedCount: 4, searchHitCount: 20, uniqueHitCount: 8, duplicateHitCount: 12, existingSkippedCount: 2, newCandidateCount: 6, bodyReadCount: 1, questionSourceCount: 1, questionCount: 2, failureCount: 1 },
      }));
    });

    const result = await screen.findByText("本次覆盖报告");
    const resultPanel = result.closest("div.collection-result");
    expect(resultPanel).not.toBeNull();
    expect(within(resultPanel as HTMLElement).getByText("20").closest("span")).toHaveTextContent("累计命中");
    expect(within(resultPanel as HTMLElement).getByText("8").closest("span")).toHaveTextContent("唯一来源");
    expect(within(resultPanel as HTMLElement).getAllByText("1")[0]?.closest("span")).toHaveTextContent("新增读取");
    expect(within(resultPanel as HTMLElement).getAllByText("2").find((item) => item.closest("span")?.textContent?.includes("真题提取"))?.closest("span")).toHaveTextContent("真题提取");
    expect(within(resultPanel as HTMLElement).getAllByText("1").find((item) => item.closest("span")?.textContent?.includes("读取失败"))?.closest("span")).toHaveTextContent("读取失败");
    expect(within(resultPanel as HTMLElement).getByText(/连续两轮没有发现新来源/)).toBeInTheDocument();
    await user.click(within(resultPanel as HTMLElement).getByText("查看每轮搜索覆盖"));
    expect(within(resultPanel as HTMLElement).getByText(/命中 8 篇 · 新增唯一来源 5 篇/)).toBeInTheDocument();
    await user.click(within(resultPanel as HTMLElement).getByText("查看 1 篇读取失败"));
    expect(within(resultPanel as HTMLElement).getByText(/未读取的脱敏来源：正文暂时不可读/)).toBeInTheDocument();
    expect(screen.getByText("采集成功的脱敏面经")).toBeInTheDocument();
    expect(screen.getByText("已提取 2 道真题")).toBeInTheDocument();
  });

  it("采集桥接失败时保留当前材料并显示可操作错误", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/deepseek/interview-analysis/status")) {
        return jsonResponse({ configured: false, model: "deepseek-v4-pro", keySource: "none" });
      }
      if (url.endsWith("/api/agent-reach/xiaohongshu")) {
        return jsonResponse({ error: "无法启动 OpenCLI，请先安装并连接桌面扩展。" }, false);
      }
      throw new Error(`未预期的测试请求：${url}`);
    }) as unknown as typeof fetch;

    renderWorkbench(fetchImpl);
    const resumeBefore = screen.getByRole("textbox", { name: "解析后的简历正文 · 可编辑" }).textContent;
    await user.click(screen.getByRole("tab", { name: "Agent Reach 结果" }));
    await user.click(screen.getByRole("button", { name: "开始深度采集" }));

    const alert = await screen.findByRole("alert", { name: "" });
    expect(alert).toHaveTextContent("采集未完成");
    expect(alert).toHaveTextContent("无法启动 OpenCLI，请先安装并连接桌面扩展。");
    expect(screen.getByRole("textbox", { name: "解析后的简历正文 · 可编辑" }).textContent).toBe(resumeBefore);
  });

  it("摘要仍不足时由用户触发原文重读并升级零题来源", async () => {
    const user = userEvent.setup();
    const target = createExperienceTarget("字节跳动", "法务");
    const source: ExperienceSource = {
      id: "zero-source",
      title: "字节法务实习面经",
      platform: "小红书",
      url: "https://www.xiaohongshu.com/search_result/legal-note",
      capturedAt: savedAt,
      excerpt: "这是一段没有保留到题目位置的短摘要。",
      questions: [],
      questionParserVersion: 2,
      importMethod: "agent-reach",
      target,
    };
    const state = workbenchState({
      activeTarget: target,
      targets: [{ target, jd: "负责合同审查、平台规则研究与业务合规支持。", experience: source.excerpt }],
      sources: [source],
      questions: [],
    });
    state.experienceDrafts[target.key] = { target, text: source.excerpt, origin: "agent" };
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({ schemaVersion: 6, ...state }));

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/deepseek/interview-analysis/status")) {
        return jsonResponse({ configured: false, model: "deepseek-v4-pro", keySource: "none" });
      }
      if (url.endsWith("/api/agent-reach/xiaohongshu/reindex")) {
        return jsonResponse({
          schemaVersion: "agent-reach.interview-experience.v1",
          sources: [{
            title: source.title,
            platform: "小红书",
            url: source.url,
            capturedAt: savedAt,
            excerpts: ["面试问题：如何看待和应对法务实习中的基础性工作；谈仅退款规则的理解"],
            questions: ["如何看待和应对法务实习中的基础性工作", "谈仅退款规则的理解"],
            questionParserVersion: 2,
          }],
          failures: [],
        });
      }
      throw new Error(`未预期的测试请求：${url}`);
    }) as unknown as typeof fetch;

    renderWorkbench(fetchImpl);
    expect(await screen.findByText("已保存正文摘要，尚未识别到真题")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新识别真题" }));

    expect(await screen.findByText("已提取 2 道真题")).toBeInTheDocument();
    expect(screen.getByText(/重新读取 1 篇原文/)).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledWith("/api/agent-reach/xiaohongshu/reindex", expect.objectContaining({ method: "POST" }));
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) ?? "{}") as WorkbenchState;
      expect(persisted.experienceSources[0].id).toBe(source.id);
      expect(persisted.experienceSources[0].questions).toHaveLength(2);
      expect(persisted.experienceSources[0].questionParserVersion).toBe(2);
    });
  });

  it("另一个标签页保存数据时先提示，确认后才加载最新状态", async () => {
    const user = userEvent.setup();
    const firstTarget = createExperienceTarget("当前标签公司", "产品岗位");
    const latestTarget = createExperienceTarget("另一标签公司", "法务岗位");
    const firstState = workbenchState({
      activeTarget: firstTarget,
      targets: [{ target: firstTarget, jd: "当前标签页的产品岗位 JD 正文。", experience: "当前标签页面经。" }],
      sources: [],
      questions: [],
    });
    const latestState = workbenchState({
      activeTarget: latestTarget,
      targets: [{ target: latestTarget, jd: "另一个标签页保存的法务岗位 JD 正文。", experience: "另一个标签页面经。" }],
      sources: [],
      questions: [],
    });
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({ schemaVersion: 6, ...firstState }));
    renderWorkbench();
    const companyInput = await screen.findByRole("textbox", { name: "公司" });
    expect(companyInput).toHaveValue(firstTarget.company);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) ?? "{}").company).toBe(firstTarget.company));

    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({ schemaVersion: 6, ...latestState }));
    window.dispatchEvent(new StorageEvent("storage", { key: WORKBENCH_STORAGE_KEY }));

    expect(await screen.findByText("另一个标签页保存了新数据")).toBeInTheDocument();
    expect(companyInput).toHaveValue(firstTarget.company);
    await user.click(screen.getByRole("button", { name: "加载最新数据" }));
    await waitFor(() => expect(companyInput).toHaveValue(latestTarget.company));
    expect(screen.getByText("已加载另一个标签页保存的最新工作台数据。")).toBeInTheDocument();
  });

  it("使用当前岗位材料生成本地来源化题库并写入浏览器存储", async () => {
    const user = userEvent.setup();
    const target = createExperienceTarget("产品测试公司", "产品经理");
    const sourceQuestion = "你如何判断一个需求值得进入产品路线图？";
    const source = { ...sourceFor("local-compose-source", "产品岗位脱敏面经", target, sourceQuestion), importMethod: "agent-reach" as const };
    const state = workbenchState({
      activeTarget: target,
      targets: [{
        target,
        jd: "负责用户研究与需求分析，设计产品方案并推动跨团队项目落地，持续通过数据验证产品效果。",
        experience: sourceQuestion,
      }],
      sources: [source],
      questions: [],
    });
    state.experienceDrafts[target.key] = { ...state.experienceDrafts[target.key], origin: "agent" };
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({ schemaVersion: 6, ...state }));

    renderWorkbench();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "公司" })).toHaveValue(target.company));
    await user.click(screen.getByRole("button", { name: "本地规则组题" }));

    expect(await screen.findByText(new RegExp(`已为 ${target.company} · ${target.role} 生成`))).toBeInTheDocument();
    expect(screen.getAllByText(sourceQuestion).length).toBeGreaterThan(0);
    expect(screen.getAllByText("面经原题").length).toBeGreaterThan(0);
    expect(screen.getAllByText("本地规则生成").length).toBeGreaterThan(0);
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) ?? "{}") as WorkbenchState;
      expect(persisted.questionsTargetKey).toBe(target.key);
      expect(persisted.questions.some((question) => question.category === "resume_deep_dive")).toBe(true);
      expect(persisted.questions.some((question) => question.category === "role_capability")).toBe(true);
      expect(persisted.questions.find((question) => question.title === sourceQuestion)).toMatchObject({
        provenance: "source_question",
        sourceId: source.id,
      });
    });
  });

  it("DeepSeek 部分成功时保留有效题目并分类展示四种安全跳过原因", async () => {
    const user = userEvent.setup();
    const target = createExperienceTarget("运营测试公司", "产品运营");
    const otherTarget = createExperienceTarget("法务测试公司", "法务");
    const sourceQuestion = "你会如何定位一次活动转化率下降的原因？";
    const source = { ...sourceFor("deepseek-compose-source", "运营岗位脱敏面经", target, sourceQuestion), importMethod: "agent-reach" as const };
    const otherSource = sourceFor("other-target-source", "其他岗位隔离面经", otherTarget, "如何审查合同责任条款？");
    const state = workbenchState({
      activeTarget: target,
      targets: [
        { target, jd: "负责活动运营、用户分层和数据分析，协同产品团队持续优化转化与留存。", experience: sourceQuestion },
        { target: otherTarget, jd: "负责合同审查与合规研究。", experience: otherSource.questions[0] },
      ],
      sources: [source, otherSource],
      questions: [],
    });
    state.experienceDrafts[target.key] = { ...state.experienceDrafts[target.key], origin: "agent" };
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({ schemaVersion: 6, ...state }));

    const selectedQuestion = questionFor("deepseek-selected", sourceQuestion, source);
    const generatedQuestion: Question = {
      id: "deepseek-generated",
      kind: "role",
      category: "role_capability",
      title: "如果数据口径发生变化，你会如何重新验证活动效果？",
      intent: "验证数据判断与复盘能力。",
      cues: ["说明口径", "给出验证方法"],
      origin: "DeepSeek 智能组题",
      provenance: "coach_generated",
      sourceRefs: [{ sourceId: "JD-01", sourceKind: "jd", label: "当前岗位 JD", excerpt: "数据分析" }],
    };
    const compositionRequests: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/deepseek/interview-analysis/status")) {
        return jsonResponse({ configured: true, model: "deepseek-v4-pro", keySource: "environment" });
      }
      if (url.endsWith("/api/deepseek/question-composition")) {
        compositionRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse({
          schemaVersion: "interview.question-composition.v1",
          questions: [selectedQuestion, generatedQuestion],
          model: "deepseek-v4-pro",
          warnings: [
            { scope: "selected_candidate", itemIndex: 1, code: "GENERIC_JD_RESTATEMENT", message: "模板题已跳过。" },
            { scope: "generated_question", itemIndex: 2, code: "DUPLICATE_QUESTION_TITLE", message: "重复题已跳过。" },
            { scope: "generated_question", itemIndex: 3, code: "MULTI_FOCUS_QUESTION", message: "多焦点题已跳过。" },
            { scope: "generated_question", itemIndex: 4, code: "SOURCE_QUOTE_MISMATCH", message: "该题引文未通过来源校验，已跳过。" },
          ],
        });
      }
      throw new Error(`未预期的测试请求：${url}`);
    }) as unknown as typeof fetch;

    renderWorkbench(fetchImpl);
    expect(await screen.findByText("DeepSeek 已接入")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "DeepSeek 智能组题 →" }));

    const resultPanel = await screen.findByRole("status", { name: "智能组题部分成功" });
    expect(within(resultPanel).getByText("已保留 2 道有效题")).toBeInTheDocument();
    expect(within(resultPanel).getByText("另有 4 道未通过质量检查，已安全跳过。")).toBeInTheDocument();
    expect(within(resultPanel).getByText("模板式 JD 题").closest("li")).toHaveTextContent("1 道");
    expect(within(resultPanel).getByText("重复题").closest("li")).toHaveTextContent("1 道");
    expect(within(resultPanel).getByText("包含多个问题的题").closest("li")).toHaveTextContent("1 道");
    expect(within(resultPanel).getByText("来源或引文无法核验的题").closest("li")).toHaveTextContent("1 道");
    expect(resultPanel).toHaveTextContent("有效题库已经保存，可以继续练习。");
    expect(resultPanel).not.toHaveTextContent("模板题已跳过");
    expect(screen.queryByText(/已由 deepseek-v4-pro 完成智能组题/)).not.toBeInTheDocument();
    expect(screen.getAllByText(sourceQuestion).length).toBeGreaterThan(0);
    expect(screen.getAllByText(generatedQuestion.title).length).toBeGreaterThan(0);
    expect(screen.getAllByText("DeepSeek 生成").length).toBeGreaterThan(0);
    expect(compositionRequests).toHaveLength(1);
    expect(compositionRequests[0]).toMatchObject({ company: target.company, role: target.role, targetKey: target.key });
    const requestedSources = compositionRequests[0].experienceSources as Array<{ id: string; targetKey: string }>;
    expect(requestedSources).toEqual([expect.objectContaining({ id: source.id, targetKey: target.key })]);
    expect(requestedSources.some((item) => item.id === otherSource.id)).toBe(false);
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) ?? "{}") as WorkbenchState;
      expect(persisted.questions).toHaveLength(2);
      expect(persisted.questions.map((question) => question.id)).toEqual([selectedQuestion.id, generatedQuestion.id]);
    });
  });

  it("通过页面配置本次 DeepSeek Key 且不会回显或写入浏览器存储", async () => {
    const user = userEvent.setup();
    const secret = "test-local-release-key";
    const requests: Array<{ url: string; body?: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("/api/deepseek/interview-analysis/status")) {
        return jsonResponse({ configured: false, model: "deepseek-v4-pro", keySource: "none" });
      }
      if (url.endsWith("/api/deepseek/interview-analysis/session-key") && init?.method === "POST") {
        return jsonResponse({ configured: true, model: "deepseek-v4-pro", keySource: "session" });
      }
      throw new Error(`未预期的测试请求：${url}`);
    }) as unknown as typeof fetch;

    renderWorkbench(fetchImpl);
    expect(await screen.findByText("尚未配置 DeepSeek")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "配置自己的 Key" }));
    await user.type(screen.getByLabelText("DeepSeek API Key"), secret);
    await user.click(screen.getByRole("button", { name: "仅为本次运行启用" }));

    expect(await screen.findByText("正在使用你本次填写的 Key")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(localStorage.getItem(WORKBENCH_STORAGE_KEY)).not.toContain(secret);
    expect(requests.find((request) => request.url.endsWith("/session-key"))?.body).toBe(JSON.stringify({ apiKey: secret }));
  });

  it("完成首轮审阅、唯一追问和第二轮审阅后自动保存有界训练", async () => {
    const user = userEvent.setup();
    const target = createExperienceTarget("训练测试公司", "训练测试岗位");
    const rootQuestionText = "请说明你如何推动一次跨团队项目？";
    const followUpText = "你用什么指标验证这次推动真正有效？";
    const source = sourceFor("training-source", "训练测试面经", target, rootQuestionText);
    const rootQuestion = questionFor("training-question", rootQuestionText, source);
    const state = workbenchState({
      activeTarget: target,
      targets: [{ target, jd: "训练测试岗位 JD：负责跨团队协作、项目推进与结果验证。", experience: rootQuestionText }],
      sources: [source],
      questions: [rootQuestion],
    });
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({ schemaVersion: 6, ...state }));

    const analysisRequests: Array<Record<string, unknown>> = [];
    let analysisCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/deepseek/interview-analysis/status")) {
        return jsonResponse({ configured: true, model: "deepseek-v4-pro", keySource: "environment" });
      }
      if (url.endsWith("/api/deepseek/interview-analysis")) {
        analysisRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        analysisCount += 1;
        const review = reviewFor(target, rootQuestion, analysisCount === 1 ? followUpText : "第二轮后不再进入新的训练追问。", `REV-${analysisCount}`);
        return jsonResponse({ analysis: review, model: "deepseek-v4-pro" });
      }
      throw new Error(`未预期的测试请求：${url}`);
    }) as unknown as typeof fetch;

    renderWorkbench(fetchImpl);
    expect(await screen.findByText("DeepSeek 已接入")).toBeInTheDocument();

    const answerInput = screen.getByRole("textbox", { name: "你的回答" });
    await user.type(answerInput, "我先统一目标和责任边界，再协调产品、设计与研发推进，并记录了每周结果变化用于复盘验证。 ");
    await user.click(screen.getByRole("button", { name: "DeepSeek 证据审阅" }));

    expect(await screen.findByText("首轮审阅已完成")).toBeInTheDocument();
    expect(screen.getAllByText(followUpText).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /继续这条追问/ }));

    await waitFor(() => expect(answerInput).toHaveValue(""));
    expect(screen.getAllByText(followUpText).length).toBeGreaterThan(0);
    await user.type(answerInput, "我使用项目完成率、关键节点延期数量和上线后的用户反馈作为验证指标，并保持前后统计口径一致。 ");
    await user.click(screen.getByRole("button", { name: "DeepSeek 证据审阅" }));

    expect(await screen.findByText("本轮训练已保存")).toBeInTheDocument();
    expect(screen.getByText(/2 轮问答/)).toBeInTheDocument();
    expect(screen.getByText("主问题")).toBeInTheDocument();
    expect(screen.getByText("唯一追问")).toBeInTheDocument();
    expect(analysisRequests).toHaveLength(2);
    expect(analysisRequests[0]).toMatchObject({ previousTurns: [] });
    expect(analysisRequests[1]).toMatchObject({ previousTurns: [expect.objectContaining({ question: rootQuestionText })] });
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) ?? "{}") as WorkbenchState;
      expect(persisted.trainingSessions).toHaveLength(1);
      expect(persisted.trainingSessions[0]).toMatchObject({ status: "completed", turns: [{ id: "TURN-1" }, { id: "TURN-2" }] });
    });
  });
});

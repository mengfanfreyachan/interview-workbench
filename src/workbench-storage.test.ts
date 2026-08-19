import { describe, expect, it } from "vitest";
import { createExperienceTarget } from "./target-scope";
import type { ExperienceSource, WorkbenchState } from "./types";
import { restoreWorkbenchState } from "./workbench-storage";

const target = createExperienceTarget("字节跳动", "法务");
const initialState: WorkbenchState = {
  company: target.company,
  role: target.role,
  jdDrafts: {},
  experienceDrafts: {},
  experienceLibraries: {},
  experienceSources: [],
  resumeText: "脱敏简历",
  questions: [],
  selectedQuestionId: "",
  answer: "",
  review: null,
  activeSession: null,
  trainingSessions: [],
  updatedAt: "2026-08-11",
};

const legacySource: ExperienceSource = {
  id: "legacy",
  title: "无法判断属于运营还是法务",
  platform: "小红书",
  url: "https://www.xiaohongshu.com/explore/legacy",
  capturedAt: "2026-08-10",
  excerpt: "",
  questions: ["旧问题？"],
  importMethod: "agent-reach",
};

describe("restoreWorkbenchState", () => {
  it("quarantines unscoped V1 sources and clears possibly mixed questions", () => {
    const restored = restoreWorkbenchState({
      ...initialState,
      experienceText: "运营和法务混合文本",
      experienceOrigin: "agent",
      experienceSources: [legacySource],
      questions: [{ id: "mixed", kind: "role", title: "混合题？", intent: "", cues: [], origin: "Agent Reach 导入" }],
      selectedQuestionId: "mixed",
    }, initialState);
    expect(restored.migratedFromLegacy).toBe(true);
    expect(restored.quarantinedSourceCount).toBe(1);
    expect(restored.state.experienceDrafts).toEqual({});
    expect(restored.state.questions).toEqual([]);
    expect(restored.state.experienceSources).toHaveLength(1);
  });

  it("preserves a V1 manual draft when no ambiguous sources exist", () => {
    const restored = restoreWorkbenchState({ ...initialState, experienceText: "纯手动面经正文", experienceOrigin: "manual" }, initialState);
    expect(restored.state.experienceDrafts[target.key]?.text).toBe("纯手动面经正文");
  });

  it("preserves scoped V2 questions", () => {
    const restored = restoreWorkbenchState({
      schemaVersion: 2,
      ...initialState,
      experienceDrafts: { [target.key]: { target, text: "法务面经", origin: "agent" } },
      questionsTargetKey: target.key,
    }, initialState);
    expect(restored.migratedFromLegacy).toBe(false);
    expect(restored.upgradedLibraryHistory).toBe(true);
    expect(restored.state.experienceDrafts[target.key]?.text).toBe("法务面经");
    expect(restored.state.experienceLibraries[target.key]?.target.role).toBe("法务");
  });

  it("preserves V3 library timestamps", () => {
    const restored = restoreWorkbenchState({
      schemaVersion: 3,
      ...initialState,
      experienceDrafts: { [target.key]: { target, text: "法务面经", origin: "agent" } },
      experienceLibraries: {
        [target.key]: { id: target.key, target, createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-11T10:00:00.000Z" },
      },
    }, initialState);
    expect(restored.upgradedLibraryHistory).toBe(false);
    expect(restored.state.experienceLibraries[target.key]?.createdAt).toBe("2026-08-10T10:00:00.000Z");
    expect(restored.state.jdDrafts).toEqual({});
  });

  it("preserves target-bound V4 JD drafts", () => {
    const restored = restoreWorkbenchState({
      schemaVersion: 4,
      ...initialState,
      jdDrafts: {
        [target.key]: { target, text: "负责合同审查与业务合规支持。", sourceName: "法务JD.txt", updatedAt: "2026-08-12T10:00:00.000Z" },
      },
    }, initialState);
    expect(restored.state.jdDrafts[target.key]?.text).toContain("合同审查");
    expect(restored.state.jdDrafts[target.key]?.sourceName).toBe("法务JD.txt");
  });

  it("drops a legacy score while preserving a V5 evidence review", () => {
    const review = { schemaVersion: "interview.evidence-review.v1" } as WorkbenchState["review"];
    const restored = restoreWorkbenchState({ schemaVersion: 5, ...initialState, review, score: { total: 88 } }, initialState);
    expect(restored.state.review).toBe(review);
    expect("score" in restored.state).toBe(false);
  });

  it("restores completed V6 training history", () => {
    const session = { id: "SESSION-1", target, rootQuestionId: "Q-1", status: "completed", turns: [{ id: "TURN-01" }], startedAt: "2026-08-12", completedAt: "2026-08-12" } as unknown as WorkbenchState["trainingSessions"][number];
    const restored = restoreWorkbenchState({ schemaVersion: 6, ...initialState, trainingSessions: [session] }, initialState);
    expect(restored.state.trainingSessions).toHaveLength(1);
    expect(restored.state.trainingSessions[0].status).toBe("completed");
  });

  it("versions and re-indexes a legacy zero-question source from its saved excerpt", () => {
    const zeroSource: ExperienceSource = {
      ...legacySource,
      id: "legacy-zero",
      target,
      excerpt: "面试问题：1⃣️如何看待和应对法务实习中的基础性工作 2⃣️谈仅退款规则的理解",
      questions: [],
    };
    const restored = restoreWorkbenchState({
      schemaVersion: 6,
      ...initialState,
      experienceDrafts: { [target.key]: { target, text: zeroSource.excerpt, origin: "agent" } },
      experienceSources: [zeroSource],
    }, initialState);
    expect(restored.reindexedSourceCount).toBe(1);
    expect(restored.recoveredQuestionCount).toBe(2);
    expect(restored.state.experienceSources[0]).toMatchObject({ questionParserVersion: 2 });
    expect(restored.state.experienceSources[0].questions).toEqual([
      "如何看待和应对法务实习中的基础性工作",
      "谈仅退款规则的理解",
    ]);
  });

  it("migrates legacy four-category questions without losing source provenance", () => {
    const restored = restoreWorkbenchState({
      schemaVersion: 6,
      ...initialState,
      questions: [
        { id: "legacy-jd", kind: "role", category: "jd_capability", title: "专业题", intent: "", cues: [], origin: "岗位推演" },
        { id: "legacy-connection", kind: "resume", category: "jd_resume_connection", title: "结合题", intent: "", cues: [], origin: "岗位推演", sourceRefs: [{ sourceId: "JD-01", sourceKind: "jd", label: "JD" }, { sourceId: "CV-01", sourceKind: "resume", label: "简历" }] },
        { id: "legacy-experience", kind: "role", category: "experience_original", title: "面经原题？", intent: "", cues: [], origin: "用户导入面经", sourceId: "exp-1" },
      ],
      questionsTargetKey: target.key,
    }, initialState);
    expect(restored.state.questions.map((question) => question.category)).toEqual(["role_capability", "role_capability", "role_capability"]);
    expect(restored.state.questions[2].provenance).toBe("source_question");
  });

  it("drops malformed or cross-key JD entries during restore", () => {
    const restored = restoreWorkbenchState({
      schemaVersion: 4,
      ...initialState,
      jdDrafts: {
        [target.key]: { target, text: "有效 JD", updatedAt: "2026-08-12T10:00:00.000Z" },
        broken: { text: "没有目标信息" },
      },
    }, initialState);
    expect(Object.keys(restored.state.jdDrafts)).toEqual([target.key]);
  });

  it("treats a partially hot-reloaded V2 object without drafts as legacy", () => {
    const restored = restoreWorkbenchState({
      schemaVersion: 2,
      ...initialState,
      experienceDrafts: undefined,
      experienceText: "混合旧文本",
      experienceSources: [legacySource],
      questions: [{ id: "mixed", kind: "role", title: "混合题？", intent: "", cues: [], origin: "Agent Reach 导入" }],
    }, initialState);
    expect(restored.migratedFromLegacy).toBe(true);
    expect(restored.state.questions).toEqual([]);
  });

  it("restores old resume questions with safe probe metadata and preserves excerpts", () => {
    const restored = restoreWorkbenchState({
      schemaVersion: 6, ...initialState,
      questions: [{ id: "old-resume", kind: "resume", category: "resume_deep_dive", title: "旧简历题", intent: "", cues: [], origin: "简历事实生成", sourceRefs: [{ sourceId: "CV-01", sourceKind: "resume", label: "当前简历", excerpt: "负责搭建流程" }] }],
      questionsTargetKey: target.key,
    }, initialState);
    expect(restored.state.questions[0].primaryProbe).toBe("personal_contribution");
    expect(restored.state.questions[0].jdRelevance).toBe("general_signal");
    expect(restored.state.questions[0].sourceRefs?.[0].excerpt).toBe("负责搭建流程");
  });

  it("clears the old mechanical question bank while preserving materials and completed training", () => {
    const completed = { id: "SESSION-OLD", target, rootQuestionId: "old-resume", status: "completed", turns: [{ id: "TURN-01" }], startedAt: "2026-08-12", completedAt: "2026-08-12" } as unknown as WorkbenchState["trainingSessions"][number];
    const restored = restoreWorkbenchState({
      schemaVersion: 6,
      ...initialState,
      jdDrafts: { [target.key]: { target, text: "负责合同审查", updatedAt: "2026-08-13" } },
      questions: [{ id: "old-resume", kind: "resume", category: "resume_deep_dive", title: "这件事的目标、你的具体责任和结果依据分别是什么？", intent: "", cues: [], origin: "简历事实生成" }],
      questionsTargetKey: target.key,
      selectedQuestionId: "old-resume",
      answer: "尚未提交的回答",
      trainingSessions: [completed],
    }, initialState);

    expect(restored.clearedMechanicalQuestionBank).toBe(true);
    expect(restored.state.questions).toEqual([]);
    expect(restored.state.selectedQuestionId).toBe("");
    expect(restored.state.answer).toBe("");
    expect(restored.state.jdDrafts[target.key]?.text).toContain("合同审查");
    expect(restored.state.resumeText).toBe("脱敏简历");
    expect(restored.state.trainingSessions).toHaveLength(1);
  });

  it("also clears the earlier generic resume drill bank", () => {
    const restored = restoreWorkbenchState({
      schemaVersion: 6,
      ...initialState,
      questions: [{ id: "generic-resume", kind: "resume", category: "resume_deep_dive", title: "请选一段最能代表你的经历，讲清楚目标、关键行动和最终结果。", intent: "", cues: [], origin: "简历事实生成" }],
    }, initialState);
    expect(restored.clearedMechanicalQuestionBank).toBe(true);
    expect(restored.state.questions).toEqual([]);
  });
});

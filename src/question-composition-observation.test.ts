import { describe, expect, it } from "vitest";
import type { DeepSeekQuestionComposition } from "../deepseek-interview-bridge";
import { evaluateCompositionObservation, renderCompositionObservationComparisonMarkdown, renderCompositionObservationMarkdown, type CompositionObservationReport } from "./question-composition-observation";
import { QUESTION_COMPOSITION_GOLDEN_CASES } from "./test/fixtures/question-composition-golden";

const golden = QUESTION_COMPOSITION_GOLDEN_CASES[0];

const validResult: DeepSeekQuestionComposition = {
  schemaVersion: "interview.question-composition.v1",
  model: "deepseek-test-model",
  warnings: [{ scope: "generated_question", itemIndex: 2, code: "UNVERIFIABLE_QUOTE", message: "测试 warning" }],
  questions: [
    {
      id: "selected-source",
      kind: "role",
      category: "role_capability",
      title: golden.source.questions[0],
      intent: "验证需求判断。",
      cues: [],
      origin: "Agent Reach 导入",
      provenance: "source_question",
      sourceId: golden.source.id,
      sourceRefs: [{ sourceId: golden.source.id, sourceKind: "interview_experience", label: golden.source.title, excerpt: golden.source.questions[0] }],
    },
    {
      id: "generated-resume",
      kind: "resume",
      category: "resume_deep_dive",
      title: "你如何确认激活率提升主要来自引导流程调整？",
      intent: "验证指标归因。",
      cues: [],
      origin: "DeepSeek 智能组题",
      provenance: "coach_generated",
      sourceRefs: [{ sourceId: "CV-01", sourceKind: "resume", label: "当前简历", excerpt: golden.expectedResumeEvidence }],
    },
  ],
};

describe("question composition observation", () => {
  it("按统一 Rubric 识别有效的部分成功结果", () => {
    const observation = evaluateCompositionObservation(golden, validResult);
    expect(observation.machineStatus).toBe("pass");
    expect(observation.warningCodes).toEqual(["UNVERIFIABLE_QUOTE"]);
    expect(observation.rubric.find((item) => item.id === "partial_success")).toMatchObject({ status: "pass" });
    expect(observation.rubric.find((item) => item.id === "non_template_jd")).toMatchObject({ status: "pass" });
    expect(observation.rubric.find((item) => item.id === "category_balance")).toMatchObject({ status: "pass" });
    expect(observation.questions).toHaveLength(2);
  });

  it("识别模板式 JD 复述、类别失衡和法务情境题不足", () => {
    const legal = QUESTION_COMPOSITION_GOLDEN_CASES[2];
    const result = structuredClone(validResult);
    result.questions = [
      ...Array.from({ length: 4 }, (_, index) => ({
        ...validResult.questions[1],
        id: `legal-resume-${index}`,
        title: `第 ${index + 1} 项经历中最关键的判断依据是什么？`,
        sourceRefs: [{ sourceId: "CV-01", sourceKind: "resume" as const, label: "当前简历", excerpt: legal.expectedResumeEvidence }],
      })),
      {
        ...validResult.questions[0],
        id: "legal-jd-template",
        title: "JD 提到“负责业务合同审查”。请说明你会如何在实际工作中做到这一点？",
        provenance: "source_derived" as const,
        sourceRefs: [{ sourceId: "JD-01", sourceKind: "jd" as const, label: "当前 JD", excerpt: "负责业务合同审查" }],
      },
    ];
    const observation = evaluateCompositionObservation(legal, result);
    expect(observation.rubric.find((item) => item.id === "non_template_jd")).toMatchObject({ status: "warn" });
    expect(observation.rubric.find((item) => item.id === "category_balance")).toMatchObject({ status: "warn" });
    expect(observation.rubric.find((item) => item.id === "legal_scenario_coverage")).toMatchObject({ status: "warn" });
  });

  it("识别以业务团队或你发现开头的法务情境题", () => {
    const legal = QUESTION_COMPOSITION_GOLDEN_CASES[2];
    const result = structuredClone(validResult);
    result.questions = [
      {
        ...validResult.questions[0],
        id: "legal-source",
        title: legal.source.questions[0],
        sourceId: legal.source.id,
        sourceRefs: [{ sourceId: legal.source.id, sourceKind: "interview_experience" as const, label: legal.source.title, excerpt: legal.source.questions[0] }],
      },
      ...["业务团队要求接受高风险数据条款时，你会如何推动决策？", "你发现项目使用了来源不明的开源组件时，你会如何推动整改？"].map((title, index) => ({
        ...validResult.questions[0],
        id: `legal-scenario-${index}`,
        title,
        provenance: "coach_generated" as const,
        sourceRefs: [{ sourceId: "JD-01", sourceKind: "jd" as const, label: "当前 JD", excerpt: index ? "知识产权" : "数据合规" }],
      })),
      {
        ...validResult.questions[1],
        id: "legal-resume",
        title: "合同审查中最关键的个人判断是什么？",
        sourceRefs: [{ sourceId: "CV-01", sourceKind: "resume" as const, label: "当前简历", excerpt: legal.expectedResumeEvidence }],
      },
    ];
    const observation = evaluateCompositionObservation(legal, result);
    expect(observation.rubric.find((item) => item.id === "legal_scenario_coverage")).toMatchObject({ status: "pass", detail: "模型生成的法务情境题 2 道。" });
  });

  it("把跨岗位或未知来源判为硬失败", () => {
    const invalid = structuredClone(validResult);
    invalid.questions[1].sourceRefs = [{ sourceId: golden.foreignSource.id, sourceKind: "interview_experience", label: "其他岗位" }];
    const observation = evaluateCompositionObservation(golden, invalid);
    expect(observation.machineStatus).toBe("fail");
    expect(observation.rubric.find((item) => item.id === "target_isolation")).toMatchObject({ status: "fail" });
  });

  it("脱敏 Markdown 不包含完整 JD、完整简历或任何 Key 字段", () => {
    const evaluated = evaluateCompositionObservation(golden, validResult);
    const report: CompositionObservationReport = {
      schemaVersion: "interview.question-composition-observation.v1",
      generatedAt: "2026-08-14T10:00:00.000Z",
      runPolicy: { liveCalls: true, attemptsPerCase: 1, retries: false, storesRawMaterials: false, storesRawModelResponse: false },
      cases: [{
        caseId: golden.id,
        label: golden.label,
        targetRole: golden.target.role,
        inputFingerprint: "abcdef1234567890",
        attemptedAt: "2026-08-14T10:00:00.000Z",
        callStatus: "completed",
        model: validResult.model,
        ...evaluated,
        manualReview: { status: "pending", roleRelevance: "待审阅", questionDepth: "待审阅", coverageBalance: "待审阅", notes: "待审阅" },
      }],
    };
    const markdown = renderCompositionObservationMarkdown(report);
    expect(markdown).not.toContain(golden.jdText);
    expect(markdown).not.toContain(golden.resumeText);
    expect(markdown).not.toMatch(/apiKey|DEEPSEEK_API_KEY|sk-[A-Za-z0-9]/);
    expect(markdown).toContain(validResult.questions[0].title);
  });

  it("生成不含原材料的跨轮质量对比", () => {
    const evaluated = evaluateCompositionObservation(golden, validResult);
    const makeReport = (generatedAt: string): CompositionObservationReport => ({
      schemaVersion: "interview.question-composition-observation.v1",
      generatedAt,
      runPolicy: { liveCalls: true, attemptsPerCase: 1, retries: false, storesRawMaterials: false, storesRawModelResponse: false },
      cases: [{
        caseId: golden.id,
        label: golden.label,
        targetRole: golden.target.role,
        inputFingerprint: "abcdef1234567890",
        attemptedAt: generatedAt,
        callStatus: "completed",
        model: validResult.model,
        ...evaluated,
        manualReview: { status: "pending", roleRelevance: "待审阅", questionDepth: "待审阅", coverageBalance: "待审阅", notes: "待审阅" },
      }],
    });
    const comparison = renderCompositionObservationComparisonMarkdown(makeReport("2026-08-14T10:00:00.000Z"), makeReport("2026-08-14T11:00:00.000Z"));
    expect(comparison).toContain("模板 JD V1→V2");
    expect(comparison).not.toContain(golden.jdText);
    expect(comparison).not.toContain(golden.resumeText);
  });
});

import { describe, expect, it } from "vitest";
import { INTERVIEW_REVIEW_SCHEMA_VERSION, ReviewProtocolError, parseEvidenceReview } from "./interview-review-protocol";

const validReview = () => ({
  schemaVersion: INTERVIEW_REVIEW_SCHEMA_VERSION,
  reviewId: "REV-01",
  generatedAt: "2026-08-12T12:00:00.000Z",
  target: { key: "字节跳动::产品经理", company: "字节跳动", role: "产品经理" },
  question: {
    id: "Q-01",
    text: "请说明你如何确定需求优先级？",
    origin: "source_derived",
    sourceRefs: [{ sourceId: "JD-01", locator: "职责 2" }],
  },
  sourceLedger: [
    { id: "JD-01", kind: "jd", title: "目标岗位 JD", targetKey: "字节跳动::产品经理", provenance: "material_fact" },
    { id: "CV-01", kind: "resume", title: "用户简历", targetKey: "字节跳动::产品经理", provenance: "material_fact" },
    { id: "USR-01", kind: "user_answer", title: "本轮回答", targetKey: "字节跳动::产品经理", provenance: "user_claim_unverified" },
  ],
  presentedEvidence: [{
    id: "OBS-01",
    observation: "回答说明了先统一决策规则。",
    impact: "能够体现跨团队对齐意识。",
    confidence: "medium",
    sourceRefs: [{ sourceId: "USR-01", quote: "先建立大家认可的决策规则" }],
    nextAction: "补充规则如何落地。",
    capabilitySignal: "跨团队决策",
    status: "emerging",
  }],
  missingFacts: [{
    id: "OBS-02",
    observation: "本次回答尚未说明需求排序实际使用的数据。",
    impact: "无法核对决策依据是否可靠。",
    confidence: "high",
    sourceRefs: [{ sourceId: "USR-01" }],
    nextAction: "补充一个真实案例及其指标口径。",
    status: "unresolved",
  }],
  communicationIssues: [{
    id: "OBS-03",
    observation: "结论出现较晚。",
    impact: "听者需要等待较久才能理解主线。",
    confidence: "medium",
    sourceRefs: [{ sourceId: "USR-01" }],
    nextAction: "先用一句话说明排序原则。",
    issueType: "ordering",
  }],
  strategyRisks: [{
    id: "OBS-04",
    observation: "回答没有说明意见无法统一时由谁决策。",
    impact: "执行责任边界仍不清楚。",
    confidence: "medium",
    sourceRefs: [{ sourceId: "USR-01" }],
    nextAction: "说明升级与最终拍板机制。",
    riskType: "stakeholder",
  }],
  jdConnections: [{
    id: "OBS-05",
    observation: "回答与 JD 的跨部门推进要求部分关联。",
    impact: "已有相关信号，但缺少真实结果。",
    confidence: "medium",
    sourceRefs: [{ sourceId: "JD-01", locator: "职责 2" }, { sourceId: "USR-01" }, { sourceId: "CV-01", locator: "项目经历" }],
    nextAction: "补充一次推进结果和个人动作。",
    jdRequirement: "推动跨部门协作并完成关键项目",
    status: "partial",
    experienceEvidence: "demonstrated",
  }],
  priorityImprovement: {
    observation: "最优先补齐真实排序案例。",
    action: "重答时只选一次冲突最明显的需求排序。",
    retryConstraint: "90 秒内，结论前置。",
    successSignal: "包含决策标准、个人动作和可核对结果。",
    sourceRefs: [{ sourceId: "USR-01" }, { sourceId: "JD-01" }],
    relatedObservationIds: ["OBS-02", "OBS-05"],
  },
  nextFollowUp: {
    question: "你实际用过哪些数据判断两个需求的优先级？",
    intent: "metric_validity",
    testsSignal: "决策依据与指标有效性",
    origin: "coach_generated",
    sourceRefs: [{ sourceId: "USR-01" }, { sourceId: "JD-01" }],
  },
  limitations: ["当前只审阅了一次回答，未验证数字真实性。"],
});

describe("interview evidence review protocol", () => {
  it("accepts a complete source-traceable review", () => {
    const parsed = parseEvidenceReview(validReview());
    expect(parsed.schemaVersion).toBe(INTERVIEW_REVIEW_SCHEMA_VERSION);
    expect(parsed.jdConnections[0].status).toBe("partial");
    expect(parsed.nextFollowUp.intent).toBe("metric_validity");
  });

  it("rejects a judgment without material sources", () => {
    const review = validReview();
    review.communicationIssues[0].sourceRefs = [];
    expect(() => parseEvidenceReview(review)).toThrow(ReviewProtocolError);
  });

  it("rejects cross-target source contamination", () => {
    const review = validReview();
    review.sourceLedger[1].targetKey = "其他公司::法务";
    expect(() => parseEvidenceReview(review)).toThrow(/不属于当前 target key/);
  });

  it("requires JD connections to cite both JD and candidate material", () => {
    const review = validReview();
    review.jdConnections[0].sourceRefs = [{ sourceId: "JD-01" }];
    expect(() => parseEvidenceReview(review)).toThrow(/候选人材料或回答来源/);
  });

  it("requires the priority improvement to point to a real observation", () => {
    const review = validReview();
    review.priorityImprovement.relatedObservationIds = ["OBS-404"];
    expect(() => parseEvidenceReview(review)).toThrow(/不存在的观察/);
  });
});

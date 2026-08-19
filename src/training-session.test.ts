import { describe, expect, it } from "vitest";
import { completeTrainingSession, enterFollowUp, finishTrainingSessionEarly, followUpQuestionFromSession, startTrainingSession } from "./training-session";
import type { EvidenceReviewV1 } from "./interview-review-protocol";
import type { Question } from "./types";

const question: Question = { id: "Q-1", kind: "role", category: "role_capability", title: "如何决策？", intent: "测试决策", cues: [], origin: "岗位推演", provenance: "source_derived", sourceRefs: [{ sourceId: "JD-01", sourceKind: "jd", label: "JD" }] };
const review = { nextFollowUp: { question: "你实际舍弃了什么？", testsSignal: "取舍", intent: "tradeoff", origin: "coach_generated", sourceRefs: [{ sourceId: "USR-01" }] } } as EvidenceReviewV1;

describe("bounded two-turn training session", () => {
  it("creates exactly one coach follow-up and completes after the second answer", () => {
    const first = startTrainingSession({ company: "某公司", role: "产品", key: "某公司::产品" }, question, "首轮回答足够长。", review, "2026-08-12T10:00:00.000Z");
    const followUp = followUpQuestionFromSession(first);
    expect(followUp.title).toBe("你实际舍弃了什么？");
    expect(followUp.provenance).toBe("coach_generated");
    const completed = completeTrainingSession(enterFollowUp(first), followUp, "第二轮回答足够长。", review, "2026-08-12T10:05:00.000Z");
    expect(completed.status).toBe("completed");
    expect(completed.turns.map((item) => item.answerSourceId)).toEqual(["USR-01", "USR-02"]);
  });

  it("allows the user to stop after the first review", () => {
    const first = startTrainingSession({ company: "某公司", role: "法务", key: "某公司::法务" }, question, "首轮回答。", review, "2026-08-12T10:00:00.000Z");
    expect(finishTrainingSessionEarly(first, "2026-08-12T10:01:00.000Z").turns).toHaveLength(1);
  });
});

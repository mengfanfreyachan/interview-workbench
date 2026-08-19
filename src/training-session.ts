import type { EvidenceReviewV1 } from "./interview-review-protocol";
import type { ExperienceTarget, Question, TrainingSession, TrainingTurn } from "./types";

const turn = (index: number, question: Question, answer: string, review: EvidenceReviewV1, createdAt: string): TrainingTurn => ({
  id: `TURN-${index}`,
  question,
  answer: answer.trim(),
  answerSourceId: `USR-${String(index).padStart(2, "0")}`,
  review,
  createdAt,
});

export function startTrainingSession(target: ExperienceTarget, question: Question, answer: string, review: EvidenceReviewV1, createdAt: string): TrainingSession {
  return {
    id: `SESSION-${createdAt}-${question.id}`,
    target,
    rootQuestionId: question.id,
    status: "awaiting_follow_up",
    turns: [turn(1, question, answer, review, createdAt)],
    startedAt: createdAt,
  };
}

export function followUpQuestionFromSession(session: TrainingSession): Question {
  const latest = session.turns.at(-1);
  if (!latest || session.status !== "awaiting_follow_up") throw new Error("当前训练没有可继续的追问。");
  const followUp = latest.review.nextFollowUp;
  return {
    id: `${session.rootQuestionId}-follow-up-1`,
    kind: latest.question.kind,
    category: latest.question.category,
    title: followUp.question,
    intent: `继续验证：${followUp.testsSignal}`,
    cues: [followUp.testsSignal],
    origin: "岗位推演",
    provenance: "coach_generated",
    sourceRefs: latest.question.sourceRefs,
  };
}

export function enterFollowUp(session: TrainingSession): TrainingSession {
  if (session.status !== "awaiting_follow_up") throw new Error("当前训练不能重复进入追问。");
  return { ...session, status: "answering_follow_up" };
}

export function completeTrainingSession(session: TrainingSession, question: Question, answer: string, review: EvidenceReviewV1, completedAt: string): TrainingSession {
  if (session.status !== "answering_follow_up" || session.turns.length !== 1) throw new Error("当前训练不在第二轮作答阶段。");
  return { ...session, status: "completed", turns: [...session.turns, turn(2, question, answer, review, completedAt)], completedAt };
}

export function finishTrainingSessionEarly(session: TrainingSession, completedAt: string): TrainingSession {
  if (session.status !== "awaiting_follow_up") throw new Error("只能在首轮审阅后提前结束。");
  return { ...session, status: "completed", completedAt };
}

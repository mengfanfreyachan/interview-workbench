import { useCallback } from "react";
import type { EvidenceReviewV1 } from "./interview-review-protocol";
import {
  completeTrainingSession,
  enterFollowUp,
  finishTrainingSessionEarly,
  followUpQuestionFromSession,
  startTrainingSession,
} from "./training-session";
import type { ExperienceTarget, Question, WorkbenchState } from "./types";

type Params = {
  state: WorkbenchState;
  currentTarget: ExperienceTarget;
  selectedQuestion?: Question;
  patchState: (patch: Partial<WorkbenchState>) => void;
  setNotice: (message: string) => void;
};

export function useTrainingActions({ state, currentTarget, selectedQuestion, patchState, setNotice }: Params) {
  const recordReview = useCallback((analysis: EvidenceReviewV1, model: string, completedAt: string) => {
    if (!selectedQuestion) return;
    if (state.activeSession?.status === "answering_follow_up") {
      const completed = completeTrainingSession(state.activeSession, selectedQuestion, state.answer, analysis, completedAt);
      patchState({
        review: analysis,
        activeSession: completed,
        trainingSessions: [completed, ...state.trainingSessions.filter((session) => session.id !== completed.id)],
      });
      setNotice(`已由 ${model} 完成第二轮审阅，并把整轮训练保存到历史。`);
      return;
    }
    const session = startTrainingSession(currentTarget, selectedQuestion, state.answer, analysis, completedAt);
    patchState({ review: analysis, activeSession: session, followUpQuestion: followUpQuestionFromSession(session) });
    setNotice(`已由 ${model} 完成首轮审阅；你可以继续唯一追问，或结束并保存本轮。`);
  }, [currentTarget, patchState, selectedQuestion, setNotice, state.activeSession, state.answer, state.trainingSessions]);

  const continueFollowUp = useCallback(() => {
    if (!state.activeSession || !state.followUpQuestion) return;
    patchState({ activeSession: enterFollowUp(state.activeSession), answer: "", review: null });
    setNotice("已进入第二轮：只回答这一条追问。完成审阅后，本轮会自动保存到训练历史。");
    document.querySelector("#practice")?.scrollIntoView({ behavior: "smooth" });
  }, [patchState, setNotice, state.activeSession, state.followUpQuestion]);

  const finishCurrentSession = useCallback(() => {
    if (!state.activeSession) return;
    const completed = finishTrainingSessionEarly(state.activeSession, new Date().toISOString());
    patchState({
      activeSession: completed,
      trainingSessions: [completed, ...state.trainingSessions.filter((session) => session.id !== completed.id)],
    });
    setNotice("已结束追问并保存本轮训练记录。你可以从题库开始下一次练习。");
  }, [patchState, setNotice, state.activeSession, state.trainingSessions]);

  return { recordReview, continueFollowUp, finishCurrentSession };
}

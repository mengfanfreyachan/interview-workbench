import { useCallback, useState } from "react";
import { analyzeInterviewAnswer } from "./deepseek-client";
import type { EvidenceReviewV1 } from "./interview-review-protocol";
import type { ExperienceSource, ExperienceTarget, JdDraft, Question, WorkbenchState } from "./types";

type Params = {
  state: WorkbenchState;
  currentTarget: ExperienceTarget;
  currentJdDraft: JdDraft;
  selectedQuestion?: Question;
  sourceById: Record<string, ExperienceSource>;
  deepSeekConfigured: boolean;
  setError: (message: string) => void;
  onReviewed: (analysis: EvidenceReviewV1, model: string, completedAt: string) => void;
};

export function useAnswerReview({ state, currentTarget, currentJdDraft, selectedQuestion, sourceById, deepSeekConfigured, setError, onReviewed }: Params) {
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const clearReviewError = useCallback(() => setReviewError(""), []);

  const evaluate = useCallback(async () => {
    if (!selectedQuestion) return;
    if (state.answer.trim().length < 30) return setError("回答至少需要 30 个字，才能进行 DeepSeek 深度分析。");
    if (!deepSeekConfigured) return setError("DeepSeek 尚未配置或本地服务不可用，请先配置 API key。");
    if (currentJdDraft.text.trim().length < 20) return setError("当前岗位缺少有效 JD，无法进行 JD 关联审阅。");
    setError("");
    setReviewError("");
    setAnalyzing(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 50_000);
    try {
      const payload = await analyzeInterviewAnswer({
        company: state.company,
        role: state.role,
        targetKey: currentTarget.key,
        jdText: currentJdDraft.text,
        resumeText: state.resumeText,
        question: selectedQuestion,
        experienceSources: selectedQuestion.sourceRefs?.filter((ref) => ref.sourceKind === "interview_experience").map((ref) => {
          const source = sourceById[ref.sourceId];
          return {
            id: ref.sourceId,
            title: source?.title || ref.label,
            locator: ref.locator,
            excerpt: source ? `${source.questions.join("\n")}\n${source.excerpt}`.trim() : ref.excerpt || "",
          };
        }) ?? [],
        previousTurns: state.activeSession?.status === "answering_follow_up" ? state.activeSession.turns.map((turn) => ({
          question: turn.question.title,
          answer: turn.answer,
          reviewSummary: `${turn.review.priorityImprovement.observation}；下一条追问：${turn.review.nextFollowUp.question}`,
        })) : [],
        answer: state.answer,
      }, controller.signal);
      if (!payload.analysis) throw new Error("DeepSeek 本次没有返回可用分析。");
      onReviewed(payload.analysis, payload.model, new Date().toISOString());
    } catch (caught) {
      const message = caught instanceof DOMException && caught.name === "AbortError"
        ? "DeepSeek 分析超过等待时间，请重试；当前回答不会丢失。"
        : caught instanceof Error ? caught.message : "DeepSeek 分析未完成，请重试。";
      setReviewError(message);
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      setAnalyzing(false);
    }
  }, [currentJdDraft, currentTarget, deepSeekConfigured, onReviewed, selectedQuestion, setError, sourceById, state]);

  return { analyzing, reviewError, clearReviewError, evaluate };
}

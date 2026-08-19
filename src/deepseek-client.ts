import { requestJson } from "./api-client";
import type { DeepSeekAnalysisResponse, DeepSeekQuestionCompositionResponse, DeepSeekStatusResponse, Question } from "./types";

type QuestionCompositionInput = {
  company: string;
  role: string;
  targetKey: string;
  jdText: string;
  resumeText: string;
  localCandidates: Question[];
  experienceSources: Array<{
    id: string;
    targetKey?: string;
    title: string;
    platform: string;
    url: string;
    excerpt: string;
    questions: string[];
  }>;
};

type InterviewAnalysisInput = {
  company: string;
  role: string;
  targetKey: string;
  jdText: string;
  resumeText: string;
  question: Question;
  experienceSources: Array<{ id: string; title: string; locator?: string; excerpt: string }>;
  previousTurns: Array<{ question: string; answer: string; reviewSummary: string }>;
  answer: string;
};

export const getDeepSeekStatus = (signal: AbortSignal) => requestJson<DeepSeekStatusResponse>(
  "/api/deepseek/interview-analysis/status",
  { signal },
  "DeepSeek 配置状态暂时不可用。",
);

export const configureDeepSeekKey = (apiKey: string) => requestJson<DeepSeekStatusResponse>(
  "/api/deepseek/interview-analysis/session-key",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  },
  "DeepSeek API key 未能配置，请重试。",
);

export const removeDeepSeekKey = () => requestJson<DeepSeekStatusResponse>(
  "/api/deepseek/interview-analysis/session-key",
  { method: "DELETE" },
  "本次会话 Key 未能移除，请重试。",
);

export const composeDeepSeekQuestions = (input: QuestionCompositionInput, signal: AbortSignal) => requestJson<DeepSeekQuestionCompositionResponse>(
  "/api/deepseek/question-composition",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  },
  "DeepSeek 本次没有返回可用题目。",
);

export const analyzeInterviewAnswer = (input: InterviewAnalysisInput, signal: AbortSignal) => requestJson<DeepSeekAnalysisResponse>(
  "/api/deepseek/interview-analysis",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  },
  "DeepSeek 本次没有返回可用分析。",
);

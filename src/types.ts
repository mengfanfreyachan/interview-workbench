export type QuestionKind = "resume" | "role";
/** 主类别只有简历深挖与专业/JD；面经原题通过 provenance/source badge 表达。 */
export type QuestionCategory = "resume_deep_dive" | "role_capability";
export type QuestionOrigin = "source_question" | "source_derived" | "coach_generated" | "user_requested";
export type ResumeProbe = "personal_contribution" | "decision_reasoning" | "metric_validity" | "constraint_execution" | "tradeoff_or_failure" | "counterfactual";
export type QuestionJdRelevance = "jd_aligned" | "general_signal";

export type QuestionSourceRef = {
  sourceId: string;
  sourceKind: "jd" | "resume" | "interview_experience";
  label: string;
  locator?: string;
  excerpt?: string;
};

export type Question = {
  id: string;
  kind: QuestionKind;
  category?: QuestionCategory;
  title: string;
  intent: string;
  cues: string[];
  origin: "简历事实生成" | "岗位推演" | "用户导入面经" | "Agent Reach 导入" | "DeepSeek 智能组题";
  provenance?: QuestionOrigin;
  sourceRefs?: QuestionSourceRef[];
  sourceId?: string;
  /** 简历题的单一主要追问切口；旧缓存恢复时会补安全默认值。 */
  primaryProbe?: ResumeProbe;
  /** 仅表示确定性词项是否与当前 JD 有交集，不代表模型匹配结论。 */
  jdRelevance?: QuestionJdRelevance;
};

export type TrainingTurn = {
  id: string;
  question: Question;
  answer: string;
  answerSourceId: string;
  review: EvidenceReviewV1;
  createdAt: string;
};

export type TrainingSession = {
  id: string;
  target: ExperienceTarget;
  rootQuestionId: string;
  status: "awaiting_follow_up" | "answering_follow_up" | "completed";
  turns: TrainingTurn[];
  startedAt: string;
  completedAt?: string;
};

export type ExperienceTarget = {
  company: string;
  role: string;
  key: string;
};

export type ExperienceDraft = {
  target: ExperienceTarget;
  text: string;
  origin: "manual" | "agent";
};

export type JdDraft = {
  target: ExperienceTarget;
  text: string;
  sourceName?: string;
  updatedAt: string;
};

export type ExperienceLibrary = {
  id: string;
  target: ExperienceTarget;
  createdAt: string;
  updatedAt: string;
};

export type ExperienceSource = {
  id: string;
  title: string;
  platform: string;
  url: string;
  capturedAt: string;
  excerpt: string;
  questions: string[];
  /** Missing/0 means the source predates versioned question extraction. */
  questionParserVersion?: number;
  importMethod: "manual" | "agent-reach";
  target?: ExperienceTarget;
};

import type { EvidenceReviewV1 } from "./interview-review-protocol";

export type WorkbenchState = {
  company: string;
  role: string;
  jdDrafts: Record<string, JdDraft>;
  experienceDrafts: Record<string, ExperienceDraft>;
  experienceLibraries: Record<string, ExperienceLibrary>;
  experienceSources: ExperienceSource[];
  resumeText: string;
  questions: Question[];
  questionsTargetKey?: string;
  selectedQuestionId: string;
  answer: string;
  review: EvidenceReviewV1 | null;
  followUpQuestion?: Question;
  activeSession: TrainingSession | null;
  trainingSessions: TrainingSession[];
  updatedAt: string;
};

export type AgentReachPayload = {
  schemaVersion?: string;
  target?: { company?: string; role?: string };
  sources?: Array<{
    title?: string;
    platform?: string;
    url?: string;
    capturedAt?: string;
      excerpts?: string[];
      questions?: string[];
      questionParserVersion?: number;
    }>;
};

export type AgentReachCollectionResponse = {
  schemaVersion: "agent-reach.interview-experience.v1";
  target: { company: string; role: string };
  sources: NonNullable<AgentReachPayload["sources"]>;
  failures: Array<{ title: string; reason: string }>;
  coverage?: {
    queries: Array<{
      query: string;
      status: "completed" | "failed";
      hitCount: number;
      newUniqueCount: number;
      error?: string;
    }>;
    stopReason: "source_limit" | "saturated" | "time_limit" | "query_plan_exhausted" | "no_results";
  };
  stats: {
    queryPlannedCount?: number;
    queryExecutedCount?: number;
    searchHitCount: number;
    uniqueHitCount?: number;
    duplicateHitCount?: number;
    existingSkippedCount?: number;
    newCandidateCount?: number;
    bodyReadCount: number;
    questionSourceCount?: number;
    questionCount: number;
    failureCount: number;
  };
};

export type AgentReachSourceReindexResponse = {
  schemaVersion: "agent-reach.interview-experience.v1";
  sources: NonNullable<AgentReachPayload["sources"]>;
  failures: Array<{ title: string; reason: string }>;
};

export type DeepSeekStatusResponse = {
  provider: "deepseek";
  configured: boolean;
  model: string;
  keySource: "session" | "environment" | "none";
  sessionKeyConfigurable: boolean;
};

export type DeepSeekAnalysisResponse = {
  analysis: EvidenceReviewV1;
  model: string;
  error?: string;
  code?: string;
};

export type DeepSeekQuestionCompositionResponse = {
  schemaVersion: "interview.question-composition.v1";
  questions: Question[];
  model: string;
  warnings?: Array<{
    scope: "selected_candidate" | "generated_question";
    itemIndex: number;
    code: string;
    message: string;
  }>;
  error?: string;
  code?: string;
};

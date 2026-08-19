import { createExperienceTarget, deriveExperienceLibraries } from "./target-scope";
import { reindexSourceQuestionsFromExcerpt } from "./experience-source-utils";
import type { ExperienceDraft, ExperienceLibrary, ExperienceSource, JdDraft, ResumeProbe, TrainingSession, WorkbenchState } from "./types";

export const WORKBENCH_SCHEMA_VERSION = 6 as const;
const RESUME_PROBES: ResumeProbe[] = ["personal_contribution", "decision_reasoning", "metric_validity", "constraint_execution", "tradeoff_or_failure", "counterfactual"];

type LegacyState = Partial<WorkbenchState> & {
  schemaVersion?: unknown;
  experienceText?: unknown;
  experienceOrigin?: unknown;
  score?: unknown;
};

const isExperienceDraft = (value: unknown): value is ExperienceDraft => {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ExperienceDraft>;
  return Boolean(draft.target && typeof draft.target.key === "string" && typeof draft.text === "string" && (draft.origin === "manual" || draft.origin === "agent"));
};

const sanitizeDrafts = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, ExperienceDraft] => isExperienceDraft(entry[1])));
};

const isJdDraft = (value: unknown): value is JdDraft => {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<JdDraft>;
  return Boolean(
    draft.target
    && typeof draft.target.key === "string"
    && typeof draft.target.company === "string"
    && typeof draft.target.role === "string"
    && typeof draft.text === "string"
    && typeof draft.updatedAt === "string",
  );
};

const sanitizeJdDrafts = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, JdDraft] => isJdDraft(entry[1]) && entry[0] === entry[1].target.key));
};

const isExperienceLibrary = (value: unknown): value is ExperienceLibrary => {
  if (!value || typeof value !== "object") return false;
  const library = value as Partial<ExperienceLibrary>;
  return Boolean(
    library.target
    && typeof library.id === "string"
    && typeof library.target.key === "string"
    && typeof library.target.company === "string"
    && typeof library.target.role === "string"
    && typeof library.createdAt === "string"
    && typeof library.updatedAt === "string",
  );
};

const sanitizeLibraries = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, ExperienceLibrary] => isExperienceLibrary(entry[1])));
};

const isTrainingSession = (value: unknown): value is TrainingSession => {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<TrainingSession>;
  return Boolean(session.id && session.target?.key && Array.isArray(session.turns) && session.turns.length >= 1 && session.turns.length <= 2 && ["awaiting_follow_up", "answering_follow_up", "completed"].includes(session.status ?? ""));
};

/** Normalize question taxonomy from V1.1/V6 caches without dropping source provenance. */
const migrateQuestionCategory = (question: unknown) => {
  if (!question || typeof question !== "object") return question;
  const next = { ...(question as Record<string, unknown>) };
  const legacy = next.category;
  if (legacy === "resume_deep_dive") next.category = "resume_deep_dive";
  else if (legacy === "role_capability" || legacy === "jd_capability") next.category = "role_capability";
  else if (legacy === "jd_resume_connection") {
    // Combined questions now live in the professional/JD bank; retain both source refs.
    next.category = "role_capability";
  } else if (legacy === "experience_original") {
    // Original interview questions are role questions with source_question provenance.
    next.category = "role_capability";
    if (!next.provenance) next.provenance = "source_question";
  } else if (!legacy) {
    next.category = next.kind === "resume" ? "resume_deep_dive" : "role_capability";
  }
  if (next.kind === "resume") {
    if (!RESUME_PROBES.includes(next.primaryProbe as ResumeProbe)) next.primaryProbe = "personal_contribution";
    if (next.jdRelevance !== "jd_aligned" && next.jdRelevance !== "general_signal") next.jdRelevance = "general_signal";
    if (!Array.isArray(next.sourceRefs)) next.sourceRefs = [];
  }
  return next;
};

const migrateTrainingSession = (session: TrainingSession): TrainingSession => ({
  ...session,
  turns: session.turns.map((turn) => turn.question
    ? { ...turn, question: migrateQuestionCategory(turn.question) as TrainingSession["turns"][number]["question"] }
    : turn),
});

export type RestoreResult = {
  state: WorkbenchState;
  migratedFromLegacy: boolean;
  upgradedLibraryHistory: boolean;
  quarantinedSourceCount: number;
  clearedMechanicalQuestionBank: boolean;
  reindexedSourceCount: number;
  recoveredQuestionCount: number;
};

const isMechanicalResumeTemplate = (question: unknown) => {
  if (!question || typeof question !== "object") return false;
  const item = question as Record<string, unknown>;
  return item.kind === "resume"
    && typeof item.title === "string"
    && (
      /(?:目标|这件事的目标).*(?:具体责任).*(?:结果依据).*(?:分别是什么)/.test(item.title)
      || /^(?:请选一段最能代表你的经历|简历里的结果数据是怎样定义和统计的|讲一次项目没有按预期推进的经历|为什么你过去的经历能支持你胜任)/.test(item.title)
    );
};

export const restoreWorkbenchState = (raw: unknown, initialState: WorkbenchState): RestoreResult => {
  if (!raw || typeof raw !== "object") throw new Error("本地备份不是有效的工作台数据。");
  const stored = raw as LegacyState;
  if (typeof stored.company !== "string" || !Array.isArray(stored.questions)) throw new Error("本地备份缺少必要字段。");

  const storedSources = Array.isArray(stored.experienceSources) ? stored.experienceSources as ExperienceSource[] : [];
  let reindexedSourceCount = 0;
  let recoveredQuestionCount = 0;
  const sources = storedSources.map((source) => {
    if (!source || !Array.isArray(source.questions)) return source;
    const migrated = reindexSourceQuestionsFromExcerpt({
      ...source,
      questionParserVersion: Number.isInteger(source.questionParserVersion) ? source.questionParserVersion : 0,
    });
    if (migrated.questionParserVersion !== source.questionParserVersion) reindexedSourceCount += 1;
    recoveredQuestionCount += Math.max(0, migrated.questions.length - source.questions.length);
    return migrated;
  });
  const quarantinedSourceCount = sources.filter((source) => !source?.target?.key).length;
  const hasDraftContainer = Boolean(stored.experienceDrafts && typeof stored.experienceDrafts === "object" && !Array.isArray(stored.experienceDrafts));
  const isScopedVersion = (stored.schemaVersion === 2 || stored.schemaVersion === 3 || stored.schemaVersion === 4 || stored.schemaVersion === 5 || stored.schemaVersion === WORKBENCH_SCHEMA_VERSION) && hasDraftContainer;
  const hasLibraryHistory = (stored.schemaVersion === 3 || stored.schemaVersion === 4 || stored.schemaVersion === 5 || stored.schemaVersion === WORKBENCH_SCHEMA_VERSION) && hasDraftContainer;
  const target = createExperienceTarget(stored.company, typeof stored.role === "string" ? stored.role : "");
  let experienceDrafts = sanitizeDrafts(stored.experienceDrafts);

  if (!isScopedVersion && !sources.length && typeof stored.experienceText === "string" && stored.experienceText.trim()) {
    experienceDrafts = {
      [target.key]: {
        target,
        text: stored.experienceText,
        origin: stored.experienceOrigin === "agent" ? "agent" : "manual",
      },
    };
  }

  const updatedAt = typeof stored.updatedAt === "string" ? stored.updatedAt : initialState.updatedAt;
  const experienceLibraries = hasLibraryHistory
    ? sanitizeLibraries(stored.experienceLibraries)
    : deriveExperienceLibraries(sources, experienceDrafts, updatedAt);
  const clearedMechanicalQuestionBank = isScopedVersion && stored.questions.some(isMechanicalResumeTemplate);

  const state: WorkbenchState = {
    ...initialState,
    ...stored,
    role: typeof stored.role === "string" ? stored.role : initialState.role,
    jdDrafts: sanitizeJdDrafts(stored.jdDrafts),
    experienceDrafts,
    experienceLibraries,
    experienceSources: sources,
    questions: isScopedVersion && !clearedMechanicalQuestionBank ? stored.questions.map(migrateQuestionCategory) as WorkbenchState["questions"] : [],
    questionsTargetKey: isScopedVersion && !clearedMechanicalQuestionBank && typeof stored.questionsTargetKey === "string" ? stored.questionsTargetKey : undefined,
    selectedQuestionId: isScopedVersion && !clearedMechanicalQuestionBank && typeof stored.selectedQuestionId === "string" ? stored.selectedQuestionId : "",
    answer: isScopedVersion && !clearedMechanicalQuestionBank && typeof stored.answer === "string" ? stored.answer : "",
    review: isScopedVersion && !clearedMechanicalQuestionBank && stored.review?.schemaVersion === "interview.evidence-review.v1" ? stored.review : null,
    followUpQuestion: isScopedVersion && !clearedMechanicalQuestionBank && stored.followUpQuestion?.id ? migrateQuestionCategory(stored.followUpQuestion) as WorkbenchState["followUpQuestion"] : undefined,
    activeSession: isScopedVersion && !clearedMechanicalQuestionBank && isTrainingSession(stored.activeSession) ? migrateTrainingSession(stored.activeSession) : null,
    trainingSessions: isScopedVersion && Array.isArray(stored.trainingSessions) ? stored.trainingSessions.filter(isTrainingSession).filter((session) => session.status === "completed").map(migrateTrainingSession).slice(0, 100) : [],
  };

  delete (state as unknown as LegacyState).experienceText;
  delete (state as unknown as LegacyState).experienceOrigin;
  delete (state as unknown as LegacyState).schemaVersion;
  delete (state as unknown as LegacyState).score;
  if (!state.followUpQuestion) delete state.followUpQuestion;

  return {
    state,
    migratedFromLegacy: !isScopedVersion,
    upgradedLibraryHistory: isScopedVersion && !hasLibraryHistory,
    quarantinedSourceCount,
    clearedMechanicalQuestionBank,
    reindexedSourceCount,
    recoveredQuestionCount,
  };
};

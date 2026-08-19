import { createExperienceTarget } from "./target-scope";
import type { WorkbenchState } from "./types";
import { restoreWorkbenchState, type RestoreResult, WORKBENCH_SCHEMA_VERSION } from "./workbench-storage";

export const WORKBENCH_BACKUP_FILENAME = "面试工作台备份.json";
export const MAX_WORKBENCH_BACKUP_BYTES = 10 * 1024 * 1024;

export type WorkbenchBackupPreview = {
  targetCount: number;
  sourceCount: number;
  questionCount: number;
  trainingSessionCount: number;
  resumeCharacterCount: number;
};

export type ParsedWorkbenchBackup = RestoreResult & {
  preview: WorkbenchBackupPreview;
};

/** Keep the backup contract explicit so runtime-only UI state and credentials cannot leak into exports. */
export const createWorkbenchBackup = (state: WorkbenchState) => ({
  schemaVersion: WORKBENCH_SCHEMA_VERSION,
  company: state.company,
  role: state.role,
  jdDrafts: state.jdDrafts,
  experienceDrafts: state.experienceDrafts,
  experienceLibraries: state.experienceLibraries,
  experienceSources: state.experienceSources,
  resumeText: state.resumeText,
  questions: state.questions,
  questionsTargetKey: state.questionsTargetKey,
  selectedQuestionId: state.selectedQuestionId,
  answer: state.answer,
  review: state.review,
  followUpQuestion: state.followUpQuestion,
  activeSession: state.activeSession,
  trainingSessions: state.trainingSessions,
  updatedAt: state.updatedAt,
});

export const serializeWorkbenchBackup = (state: WorkbenchState) => JSON.stringify(createWorkbenchBackup(state), null, 2);

const durableState = (state: WorkbenchState): WorkbenchState => ({
  company: state.company,
  role: state.role,
  jdDrafts: state.jdDrafts,
  experienceDrafts: state.experienceDrafts,
  experienceLibraries: state.experienceLibraries,
  experienceSources: state.experienceSources,
  resumeText: state.resumeText,
  questions: state.questions,
  questionsTargetKey: state.questionsTargetKey,
  selectedQuestionId: state.selectedQuestionId,
  answer: state.answer,
  review: state.review,
  followUpQuestion: state.followUpQuestion,
  activeSession: state.activeSession,
  trainingSessions: state.trainingSessions,
  updatedAt: state.updatedAt,
});

export const summarizeWorkbenchBackup = (state: WorkbenchState): WorkbenchBackupPreview => {
  const targetKeys = new Set<string>();
  const addTarget = (target?: { company?: string; role?: string; key?: string }) => {
    if (!target?.company?.trim() || !target.role?.trim()) return;
    targetKeys.add(target.key || createExperienceTarget(target.company, target.role).key);
  };

  addTarget(createExperienceTarget(state.company, state.role));
  Object.values(state.jdDrafts).forEach((draft) => addTarget(draft.target));
  Object.values(state.experienceDrafts).forEach((draft) => addTarget(draft.target));
  Object.values(state.experienceLibraries).forEach((library) => addTarget(library.target));
  state.experienceSources.forEach((source) => addTarget(source.target));
  state.trainingSessions.forEach((session) => addTarget(session.target));

  return {
    targetCount: targetKeys.size,
    sourceCount: state.experienceSources.length,
    questionCount: state.questions.length,
    trainingSessionCount: state.trainingSessions.length,
    resumeCharacterCount: state.resumeText.length,
  };
};

export function parseWorkbenchBackupText(text: string, initialState: WorkbenchState): ParsedWorkbenchBackup {
  if (!text.trim()) throw new Error("备份文件为空。");
  if (new TextEncoder().encode(text).byteLength > MAX_WORKBENCH_BACKUP_BYTES) throw new Error("备份文件超过 10 MB，已停止读取。");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("备份文件不是有效的 JSON。");
  }

  const restored = restoreWorkbenchState(raw, initialState);
  const state = durableState(restored.state);
  return { ...restored, state, preview: summarizeWorkbenchBackup(state) };
}

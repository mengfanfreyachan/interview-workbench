import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createExperienceTarget, partitionSourcesByTarget, upsertExperienceLibrary } from "./target-scope";
import type { WorkbenchState } from "./types";
import { clearWorkbenchState, loadWorkbenchState, saveWorkbenchState, WORKBENCH_STORAGE_KEY } from "./workbench-repository";
import { restoreWorkbenchState } from "./workbench-storage";
import { initialWorkbenchState } from "./workbench-initial-state";

export function useWorkbenchController() {
  const [state, setState] = useState<WorkbenchState>(initialWorkbenchState);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("已载入脱敏样例，你可以直接体验完整流程。");
  const [error, setError] = useState("");
  const [externalUpdateAvailable, setExternalUpdateAvailable] = useState(false);
  const persistenceEnabledRef = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const restored = loadWorkbenchState(localStorage, initialWorkbenchState);
        if (restored) {
          setState(restored.state);
          setNotice(restored.recoveredQuestionCount > 0
            ? `已用新版解析器重新识别 ${restored.reindexedSourceCount} 篇历史来源，恢复 ${restored.recoveredQuestionCount} 道真题。`
            : restored.clearedMechanicalQuestionBank
            ? "简历深挖策略已升级：旧模板题库已清空，请为当前岗位重新生成；JD、简历、面经和训练历史均已保留。"
            : restored.migratedFromLegacy
            ? restored.quarantinedSourceCount
              ? `已升级本地数据：${restored.quarantinedSourceCount} 条旧面经因无法判断岗位归属而被隔离，不会进入当前题库。请为当前岗位重新采集。`
              : "已升级并恢复上次的本地练习数据。"
            : restored.upgradedLibraryHistory
              ? "已恢复上次的本地练习数据，并整理到“我的面经库”。"
              : "已恢复上次保存在当前浏览器的练习进度。");
        }
        persistenceEnabledRef.current = true;
      } catch {
        setError("本地数据读取失败，已临时显示脱敏样例，但不会覆盖原有数据。请导入有效备份或清除本地数据后继续。");
      } finally {
        setReady(true);
      }
    });
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      if (event.key === null || event.key === WORKBENCH_STORAGE_KEY) {
        setExternalUpdateAvailable(true);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (state.experienceDrafts && state.experienceLibraries) return;
    const runtimeSchemaVersion = state.experienceDrafts ? 2 : 1;
    const restored = restoreWorkbenchState({ ...state, schemaVersion: runtimeSchemaVersion } as unknown, initialWorkbenchState);
    setState(restored.state);
    setNotice(restored.quarantinedSourceCount
      ? `已隔离 ${restored.quarantinedSourceCount} 条无法判断岗位归属的旧面经；它们不会进入当前题库。`
      : "已完成岗位资料隔离升级。");
  }, [state]);

  useEffect(() => {
    if (!ready || !persistenceEnabledRef.current) return;
    try {
      saveWorkbenchState(localStorage, { ...state, updatedAt: new Date().toISOString() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "浏览器本地数据保存失败。");
    }
  }, [ready, state]);

  const currentTarget = useMemo(() => createExperienceTarget(state.company, state.role), [state.company, state.role]);
  const currentJdDraft = state.jdDrafts?.[currentTarget.key] ?? { target: currentTarget, text: "", updatedAt: "" };
  const currentDraft = state.experienceDrafts?.[currentTarget.key] ?? { target: currentTarget, text: "", origin: "manual" as const };
  const scopedSources = useMemo(() => partitionSourcesByTarget(state.experienceSources, currentTarget), [currentTarget, state.experienceSources]);
  const experienceLibraries = useMemo(() => Object.values(state.experienceLibraries ?? {})
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [state.experienceLibraries]);
  const currentTrainingSessions = useMemo(() => state.trainingSessions.filter((session) => session.target.key === currentTarget.key), [currentTarget.key, state.trainingSessions]);
  const visibleQuestions = state.questionsTargetKey === currentTarget.key ? state.questions : [];

  const patchState = useCallback((patch: Partial<WorkbenchState>) => {
    setState((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }, []);

  const patchJdDraft = useCallback((patch: Partial<{ text: string; sourceName: string }>) => {
    setState((current) => {
      const savedAt = new Date().toISOString();
      const drafts = current.jdDrafts ?? {};
      const existing = drafts[currentTarget.key] ?? { target: currentTarget, text: "", updatedAt: savedAt };
      const nextDraft = { ...existing, ...patch, target: currentTarget, updatedAt: savedAt };
      return {
        ...current,
        jdDrafts: { ...drafts, [currentTarget.key]: nextDraft },
        experienceLibraries: nextDraft.text.trim()
          ? upsertExperienceLibrary(current.experienceLibraries ?? {}, currentTarget, savedAt)
          : current.experienceLibraries ?? {},
        updatedAt: savedAt,
      };
    });
  }, [currentTarget]);

  const patchExperienceDraft = useCallback((patch: Partial<{ text: string; origin: "manual" | "agent" }>) => {
    setState((current) => {
      const drafts = current.experienceDrafts ?? {};
      const existing = drafts[currentTarget.key] ?? { target: currentTarget, text: "", origin: "manual" as const };
      return {
        ...current,
        experienceDrafts: { ...drafts, [currentTarget.key]: { ...existing, ...patch, target: currentTarget } },
        updatedAt: new Date().toISOString(),
      };
    });
  }, [currentTarget]);

  const replaceWorkbenchState = useCallback((nextState: WorkbenchState) => {
    saveWorkbenchState(localStorage, nextState);
    persistenceEnabledRef.current = true;
    setState(nextState);
    setExternalUpdateAvailable(false);
  }, []);

  const resetWorkbenchState = useCallback(() => {
    clearWorkbenchState(localStorage);
    persistenceEnabledRef.current = true;
    setState(initialWorkbenchState);
    setExternalUpdateAvailable(false);
  }, []);

  const refreshExternalState = useCallback(() => {
    try {
      const restored = loadWorkbenchState(localStorage, initialWorkbenchState);
      setState(restored?.state ?? initialWorkbenchState);
      persistenceEnabledRef.current = true;
      setExternalUpdateAvailable(false);
      setError("");
      setNotice(restored ? "已加载另一个标签页保存的最新工作台数据。" : "另一个标签页已清除工作台，当前页面已同步重置。");
    } catch {
      setError("无法读取另一个标签页的最新数据；当前页面内容未被覆盖。");
    }
  }, []);

  return {
    state,
    setState,
    patchState,
    patchJdDraft,
    patchExperienceDraft,
    replaceWorkbenchState,
    resetWorkbenchState,
    notice,
    setNotice,
    error,
    setError,
    externalUpdateAvailable,
    refreshExternalState,
    dismissExternalUpdate: () => setExternalUpdateAvailable(false),
    currentTarget,
    currentJdDraft,
    currentDraft,
    scopedSources,
    experienceLibraries,
    currentTrainingSessions,
    visibleQuestions,
  };
}

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { collectXiaohongshuExperience } from "./agent-reach-client";
import { emptyCollectionStats, idleCollectionState } from "./collection-state";
import { agentSourcesToExperienceSources, experienceTextFromSources } from "./experience-source-utils";
import { buildAgentSearchQuery, type SearchMode } from "./search-strategy";
import { createExperienceTarget, deduplicateSources, partitionSourcesByTarget, upsertExperienceLibrary } from "./target-scope";
import type { ExperienceTarget, WorkbenchState } from "./types";

type Params = {
  state: WorkbenchState;
  setState: Dispatch<SetStateAction<WorkbenchState>>;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
  isDev: boolean;
};

export function useExperienceCollection({ state, setState, setNotice, setError, isDev }: Params) {
  const [searchMode, setSearchMode] = useState<SearchMode>("exact");
  const [agentQuery, setAgentQuery] = useState(() => buildAgentSearchQuery(state.company, state.role, "exact"));
  const [agentQueryEdited, setAgentQueryEdited] = useState(false);
  const [collection, setCollection] = useState(idleCollectionState);

  useEffect(() => {
    if (!agentQueryEdited) setAgentQuery(buildAgentSearchQuery(state.company, state.role, searchMode));
  }, [agentQueryEdited, searchMode, state.company, state.role]);

  const changeSearchMode = useCallback((mode: SearchMode) => {
    setSearchMode(mode);
    setAgentQuery(buildAgentSearchQuery(state.company, state.role, mode));
    setAgentQueryEdited(false);
  }, [state.company, state.role]);

  const changeAgentQuery = useCallback((value: string) => {
    setAgentQuery(value);
    setAgentQueryEdited(true);
  }, []);

  const restoreAgentQuery = useCallback(() => {
    setAgentQuery(buildAgentSearchQuery(state.company, state.role, searchMode));
    setAgentQueryEdited(false);
  }, [searchMode, state.company, state.role]);

  const resetForTarget = useCallback((target: ExperienceTarget) => {
    setAgentQuery(buildAgentSearchQuery(target.company, target.role, searchMode));
    setAgentQueryEdited(false);
    setCollection(idleCollectionState());
  }, [searchMode]);

  const collect = useCallback(async () => {
    setError("");
    if (!isDev) {
      setCollection({ status: "failed", stats: emptyCollectionStats(), failures: [], coverage: undefined, error: "深度采集仅在本地 npm run dev 可用；静态部署需要服务端 adapter。" });
      return;
    }
    if (!state.company.trim() || !state.role.trim()) {
      setError("请先填写目标公司和岗位，再发起采集。");
      return;
    }
    const requestTarget = createExperienceTarget(state.company, state.role);
    const query = agentQuery.trim();
    if (query.length < 2 || query.length > 120) {
      setError("搜索词需要 2 到 120 个字符。");
      return;
    }

    setCollection({ status: "collecting", stats: emptyCollectionStats(), failures: [], coverage: undefined, error: "" });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 375_000);
    try {
      const existingUrls = partitionSourcesByTarget(state.experienceSources, requestTarget).current.map((source) => source.url).filter(Boolean);
      const payload = await collectXiaohongshuExperience({ query, limit: 20, existingUrls, company: state.company, role: state.role, searchMode }, controller.signal);
      const collectedSources = agentSourcesToExperienceSources(payload.sources ?? [], `agent-live-${Date.now()}`, requestTarget);
      setState((current) => {
        const savedAt = new Date().toISOString();
        const mergedSources = deduplicateSources([...current.experienceSources, ...collectedSources]);
        const requestSources = partitionSourcesByTarget(mergedSources, requestTarget).current;
        return {
          ...current,
          experienceSources: mergedSources,
          experienceDrafts: {
            ...(current.experienceDrafts ?? {}),
            [requestTarget.key]: { target: requestTarget, text: experienceTextFromSources(requestSources), origin: "agent" },
          },
          experienceLibraries: collectedSources.length > 0
            ? upsertExperienceLibrary(current.experienceLibraries ?? {}, requestTarget, savedAt)
            : current.experienceLibraries ?? {},
          updatedAt: savedAt,
        };
      });
      const questionCount = collectedSources.reduce((sum, source) => sum + source.questions.length, 0);
      const stats = payload.stats ?? {
        queryPlannedCount: 1,
        queryExecutedCount: 1,
        searchHitCount: collectedSources.length + (payload.failures?.length ?? 0),
        uniqueHitCount: collectedSources.length + (payload.failures?.length ?? 0),
        duplicateHitCount: 0,
        existingSkippedCount: 0,
        newCandidateCount: collectedSources.length + (payload.failures?.length ?? 0),
        bodyReadCount: collectedSources.length,
        questionSourceCount: collectedSources.filter((source) => source.questions.length > 0).length,
        questionCount,
        failureCount: payload.failures?.length ?? 0,
      };
      setCollection({ status: "done", stats, failures: payload.failures ?? [], coverage: payload.coverage, error: "" });
      setNotice(`深度采集完成：执行 ${stats.queryExecutedCount ?? 1} 组搜索，新增读取 ${stats.bodyReadCount} 篇，提取真题 ${stats.questionCount} 道${collectedSources.length ? "；来源已归档到“我的面经库”" : ""}。`);
    } catch (caught) {
      const message = caught instanceof DOMException && caught.name === "AbortError"
        ? "本次深度采集超过约 6 分钟，已停止等待。已完成的结果不会由失败响应写入，请检查 OpenCLI、Chrome 扩展和小红书登录状态后重试。"
        : caught instanceof Error ? caught.message : "深度采集失败。";
      setCollection({ status: "failed", stats: emptyCollectionStats(), failures: [], coverage: undefined, error: message });
    } finally {
      window.clearTimeout(timeout);
    }
  }, [agentQuery, isDev, searchMode, setError, setNotice, setState, state.company, state.experienceSources, state.role]);

  return {
    searchMode,
    agentQuery,
    agentQueryEdited,
    collection,
    changeSearchMode,
    changeAgentQuery,
    restoreAgentQuery,
    resetForTarget,
    collect,
  };
}

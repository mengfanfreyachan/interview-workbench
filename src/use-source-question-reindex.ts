import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { reindexXiaohongshuSources } from "./agent-reach-client";
import { agentSourcesToExperienceSources, experienceTextFromSources, reindexSourceQuestionsFromExcerpt } from "./experience-source-utils";
import { deduplicateSources, partitionSourcesByTarget, upsertExperienceLibrary } from "./target-scope";
import type { ExperienceTarget, WorkbenchState } from "./types";

export type SourceQuestionReindexState = {
  status: "idle" | "running" | "done" | "failed";
  message: string;
};

type Params = {
  state: WorkbenchState;
  target: ExperienceTarget;
  setState: Dispatch<SetStateAction<WorkbenchState>>;
  setError: (message: string) => void;
  isDev: boolean;
};

const isRereadableXiaohongshuSource = (source: { importMethod: string; url: string }) => source.importMethod === "agent-reach"
  && /^https:\/\/(?:[^/]+\.)?xiaohongshu\.com\//i.test(source.url);

export function useSourceQuestionReindex({ state, target, setState, setError, isDev }: Params) {
  const [result, setResult] = useState<SourceQuestionReindexState>({ status: "idle", message: "" });
  const currentSources = useMemo(() => partitionSourcesByTarget(state.experienceSources, target).current, [state.experienceSources, target]);
  const pendingCount = currentSources.filter((source) => source.questions.length === 0).length;

  const reindex = useCallback(async () => {
    setError("");
    const zeroSources = currentSources.filter((source) => source.questions.length === 0);
    if (!zeroSources.length) {
      setResult({ status: "done", message: "当前岗位所有来源都已有真题识别结果。" });
      return;
    }
    setResult({ status: "running", message: "正在先用本地摘要重新识别…" });
    const locallyReindexed = zeroSources.map((source) => reindexSourceQuestionsFromExcerpt(source, true));
    const localRecovered = locallyReindexed.reduce((sum, source, index) => sum + Math.max(0, source.questions.length - zeroSources[index].questions.length), 0);
    let replacements = locallyReindexed;
    let rereadCount = 0;
    let failures: Array<{ title: string; reason: string }> = [];
    const unresolved = locallyReindexed.filter((source) => source.questions.length === 0 && isRereadableXiaohongshuSource(source));

    if (unresolved.length && isDev) {
      setResult({ status: "running", message: `摘要不足，正在重新读取 ${Math.min(unresolved.length, 10)} 篇原文…` });
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 195_000);
      try {
        const payload = await reindexXiaohongshuSources(
          unresolved.slice(0, 10).map((source) => ({ title: source.title, url: source.url })),
          controller.signal,
        );
        const remoteSources = agentSourcesToExperienceSources(payload.sources, `agent-reindex-${Date.now()}`, target);
        replacements = deduplicateSources([...locallyReindexed, ...remoteSources]);
        rereadCount = remoteSources.length;
        failures = payload.failures ?? [];
      } catch (caught) {
        const message = caught instanceof DOMException && caught.name === "AbortError"
          ? "重新读取原文超过约 3 分钟，本地摘要识别结果已保留。"
          : caught instanceof Error ? caught.message : "重新读取原文失败，本地摘要识别结果已保留。";
        failures = [{ title: "原文重读", reason: message }];
      } finally {
        window.clearTimeout(timeout);
      }
    }

    setState((current) => {
      const replacementIds = new Set(zeroSources.map((source) => source.id));
      const untouched = current.experienceSources.filter((source) => !replacementIds.has(source.id));
      const mergedSources = deduplicateSources([...untouched, ...replacements]);
      const targetSources = partitionSourcesByTarget(mergedSources, target).current;
      const savedAt = new Date().toISOString();
      return {
        ...current,
        experienceSources: mergedSources,
        experienceDrafts: {
          ...(current.experienceDrafts ?? {}),
          [target.key]: { target, text: experienceTextFromSources(targetSources), origin: "agent" },
        },
        experienceLibraries: upsertExperienceLibrary(current.experienceLibraries ?? {}, target, savedAt),
        updatedAt: savedAt,
      };
    });

    const remoteRecovered = replacements.reduce((sum, source) => sum + source.questions.length, 0) - localRecovered;
    const recovered = Math.max(localRecovered, localRecovered + remoteRecovered);
    const failureCopy = failures.length ? `；${failures.length} 篇原文未能重新读取` : "";
    const rereadCopy = rereadCount ? `，并重新读取 ${rereadCount} 篇原文` : "";
    setResult({
      status: failures.length && recovered === 0 ? "failed" : "done",
      message: `重新识别完成：从摘要恢复 ${localRecovered} 道${rereadCopy}，当前共恢复 ${recovered} 道真题${failureCopy}。`,
    });
  }, [currentSources, isDev, setError, setState, target]);

  return { pendingCount, result, reindex };
}

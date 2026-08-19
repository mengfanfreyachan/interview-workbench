import { useCallback, useState } from "react";
import { composeDeepSeekQuestions } from "./deepseek-client";
import { generateQuestionBanks, parseManualExperience } from "./engine";
import { INTERVIEW_QUESTION_PARSER_VERSION } from "./interview-question-extractor";
import { summarizeCompositionWarnings, type CompositionWarningSummary } from "./question-composition-warning";
import { emptySourceDraft, type SourceDraft } from "./source-draft";
import { createExperienceTarget, deduplicateSources, partitionSourcesByTarget, upsertExperienceLibrary } from "./target-scope";
import type { JdDraft, WorkbenchState } from "./types";

type Params = {
  state: WorkbenchState;
  currentJdDraft: JdDraft;
  deepSeekConfigured: boolean;
  patchState: (patch: Partial<WorkbenchState>) => void;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
};

function prepareQuestionMaterials(state: WorkbenchState, currentJdDraft: JdDraft, sourceDraft: SourceDraft) {
  const target = createExperienceTarget(state.company, state.role);
  const draft = state.experienceDrafts?.[target.key] ?? { target, text: "", origin: "manual" as const };
  let sources = partitionSourcesByTarget(state.experienceSources, target).current;
  if (draft.origin === "manual" && draft.text.trim()) {
    sources = [...sources.filter((source) => source.importMethod !== "manual"), {
      id: `manual-source-${Date.now()}`,
      title: sourceDraft.title.trim() || "用户手动粘贴面经",
      platform: sourceDraft.platform.trim() || "用户手动导入",
      url: sourceDraft.url.trim(),
      capturedAt: sourceDraft.capturedAt,
      excerpt: draft.text.slice(0, 240),
      questions: parseManualExperience(draft.text),
      questionParserVersion: INTERVIEW_QUESTION_PARSER_VERSION,
      importMethod: "manual" as const,
      target,
    }];
  }
  const localCandidates = generateQuestionBanks({
    company: state.company,
    role: state.role,
    jdText: currentJdDraft.text,
    resumeText: state.resumeText,
    experienceText: draft.text,
    experienceOrigin: draft.origin,
    experienceSources: sources,
  });
  return { target, draft, sources, localCandidates };
}

export function useQuestionComposition({ state, currentJdDraft, deepSeekConfigured, patchState, setNotice, setError }: Params) {
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(emptySourceDraft);
  const [composing, setComposing] = useState(false);
  const [compositionError, setCompositionError] = useState("");
  const [compositionWarning, setCompositionWarning] = useState<CompositionWarningSummary | null>(null);

  const resetSourceDraft = useCallback(() => setSourceDraft(emptySourceDraft()), []);

  const generateLocal = useCallback(() => {
    setError("");
    setCompositionWarning(null);
    if (!state.company.trim() || !state.role.trim()) return setError("请先填写目标公司和岗位。");
    if (currentJdDraft.text.trim().length < 20) return setError("请先为当前岗位补充一份完整 JD，再生成来源化题库。");
    if (state.resumeText.trim().length < 80) return setError("简历正文过短，请至少补充一段完整经历。");
    const { target, draft, sources, localCandidates } = prepareQuestionMaterials(state, currentJdDraft, sourceDraft);
    const otherSources = state.experienceSources.filter((source) => source.target?.key !== target.key);
    const savedAt = new Date().toISOString();
    patchState({
      questions: localCandidates,
      questionsTargetKey: target.key,
      experienceSources: deduplicateSources([...otherSources, ...sources]),
      experienceLibraries: (draft.text.trim() || sources.length > 0)
        ? upsertExperienceLibrary(state.experienceLibraries ?? {}, target, savedAt)
        : state.experienceLibraries ?? {},
      selectedQuestionId: localCandidates[0]?.id ?? "",
      answer: "",
      review: null,
      activeSession: null,
      followUpQuestion: undefined,
    });
    setNotice(`已为 ${target.company} · ${target.role} 生成 ${localCandidates.length} 道来源化题目：简历题与专业 / JD 题按主类别归档，面经原题保留来源标签；其他岗位资料未进入本题库。`);
    document.querySelector("#questions")?.scrollIntoView({ behavior: "smooth" });
  }, [currentJdDraft, patchState, setError, setNotice, sourceDraft, state]);

  const composeWithDeepSeek = useCallback(async () => {
    setError("");
    setCompositionError("");
    setCompositionWarning(null);
    if (!state.company.trim() || !state.role.trim()) return setCompositionError("请先填写目标公司和岗位。");
    if (currentJdDraft.text.trim().length < 20) return setCompositionError("请先为当前岗位补充一份完整 JD。");
    if (state.resumeText.trim().length < 80) return setCompositionError("简历正文过短，请至少补充一段完整经历。");
    if (!deepSeekConfigured) return setCompositionError("DeepSeek 尚未配置或本地服务不可用，请先配置 API key。");
    const { target, sources, localCandidates } = prepareQuestionMaterials(state, currentJdDraft, sourceDraft);
    setComposing(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 50_000);
    try {
      const payload = await composeDeepSeekQuestions({
        company: state.company,
        role: state.role,
        targetKey: target.key,
        jdText: currentJdDraft.text,
        resumeText: state.resumeText,
        localCandidates,
        experienceSources: sources.map((source) => ({
          id: source.id,
          targetKey: source.target?.key,
          title: source.title,
          platform: source.platform,
          url: source.url,
          excerpt: source.excerpt,
          questions: source.questions,
        })),
      }, controller.signal);
      if (!payload.questions?.length) throw new Error("DeepSeek 本次没有返回可用题目。");
      const otherSources = state.experienceSources.filter((source) => source.target?.key !== target.key);
      patchState({
        questions: payload.questions,
        questionsTargetKey: target.key,
        experienceSources: deduplicateSources([...otherSources, ...sources]),
        selectedQuestionId: payload.questions[0]?.id ?? "",
        answer: "",
        review: null,
        activeSession: null,
        followUpQuestion: undefined,
      });
      const skippedCount = payload.warnings?.length ?? 0;
      if (skippedCount) {
        setCompositionWarning(summarizeCompositionWarnings(payload.warnings, payload.questions.length));
        setNotice("");
      } else {
        setNotice(`已由 ${payload.model} 完成智能组题，共 ${payload.questions.length} 道；面经原题保持原文，模型衍生题已标记为 DeepSeek 生成。`);
        document.querySelector("#questions")?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (caught) {
      const message = caught instanceof DOMException && caught.name === "AbortError"
        ? "DeepSeek 组题超过等待时间，请重试；现有题库不会丢失。"
        : caught instanceof Error ? caught.message : "DeepSeek 智能组题未完成，请重试。";
      setCompositionError(message);
    } finally {
      window.clearTimeout(timeout);
      setComposing(false);
    }
  }, [currentJdDraft, deepSeekConfigured, patchState, setError, setNotice, sourceDraft, state]);

  return {
    sourceDraft,
    setSourceDraft,
    resetSourceDraft,
    composing,
    error: compositionError,
    warning: compositionWarning,
    generateLocal,
    composeWithDeepSeek,
  };
}

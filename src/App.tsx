import { useMemo, useRef, useState } from "react";
import { MaterialsSection } from "./components/materials-section";
import { PracticeSection } from "./components/practice-section";
import { QuestionBankSection } from "./components/question-bank-section";
import { TrainingHistorySection } from "./components/training-history-section";
import type { QuestionFilter } from "./question-copy";
import { createExperienceTarget, partitionSourcesByTarget } from "./target-scope";
import type { ExperienceLibrary, ExperienceSource, ExperienceTarget, Question } from "./types";
import { useAnswerReview } from "./use-answer-review";
import { useDeepSeekSession } from "./use-deepseek-session";
import { useExperienceCollection } from "./use-experience-collection";
import { useMaterialImportActions } from "./use-material-import-actions";
import { useQuestionComposition } from "./use-question-composition";
import { useSourceQuestionReindex } from "./use-source-question-reindex";
import { useTrainingActions } from "./use-training-actions";
import { useWorkbenchBackupActions } from "./use-workbench-backup-actions";
import { useWorkbenchController } from "./use-workbench-controller";

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: (event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void;
  onerror: () => void;
  onend: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  }
}

const formatLibraryDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
};

export default function App() {
  const {
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
    dismissExternalUpdate,
    currentTarget,
    currentJdDraft,
    currentDraft,
    scopedSources,
    experienceLibraries,
    currentTrainingSessions,
    visibleQuestions,
  } = useWorkbenchController();
  const [questionFilter, setQuestionFilter] = useState<QuestionFilter>("all");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const deepSeek = useDeepSeekSession({ isDev: import.meta.env.DEV, setNotice, setError });
  const imports = useMaterialImportActions({ currentTarget, setState, patchState, patchJdDraft, setNotice, setError });
  const collectionActions = useExperienceCollection({ state, setState, setNotice, setError, isDev: import.meta.env.DEV });
  const sourceReindex = useSourceQuestionReindex({ state, target: currentTarget, setState, setError, isDev: import.meta.env.DEV });
  const composition = useQuestionComposition({ state, currentJdDraft, deepSeekConfigured: deepSeek.status.status === "configured", patchState, setNotice, setError });
  const backupActions = useWorkbenchBackupActions({ state, replaceWorkbenchState, resetWorkbenchState, setNotice, setError });

  const selectedBankQuestion = visibleQuestions.find((question) => question.id === state.selectedQuestionId) ?? visibleQuestions[0];
  const selectedQuestion = state.activeSession?.target.key === currentTarget.key && state.followUpQuestion && (state.activeSession.status === "answering_follow_up" || (state.activeSession.status === "completed" && state.activeSession.turns.length === 2))
    ? state.followUpQuestion
    : selectedBankQuestion;
  const sourceById = useMemo(() => Object.fromEntries(state.experienceSources.map((source) => [source.id, source])), [state.experienceSources]);
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const completion = [state.company && state.role, currentJdDraft.text, currentDraft.text || scopedSources.current.length, state.resumeText, visibleQuestions.length, state.review && state.questionsTargetKey === currentTarget.key].filter(Boolean).length;
  const trainingActions = useTrainingActions({ state, currentTarget, selectedQuestion, patchState, setNotice });
  const reviewActions = useAnswerReview({
    state,
    currentTarget,
    currentJdDraft,
    selectedQuestion,
    sourceById,
    deepSeekConfigured: deepSeek.status.status === "configured",
    setError,
    onReviewed: trainingActions.recordReview,
  });

  const openExperienceLibrary = (target: ExperienceTarget) => {
    setState((current) => ({
      ...current,
      company: target.company,
      role: target.role,
      selectedQuestionId: current.questionsTargetKey === target.key ? current.selectedQuestionId : "",
      answer: current.questionsTargetKey === target.key ? current.answer : "",
      review: current.questionsTargetKey === target.key ? current.review : null,
      activeSession: current.activeSession?.target.key === target.key ? current.activeSession : null,
      followUpQuestion: current.activeSession?.target.key === target.key ? current.followUpQuestion : undefined,
      updatedAt: new Date().toISOString(),
    }));
    collectionActions.resetForTarget(target);
    composition.resetSourceDraft();
    setNotice(`已打开 ${target.company} · ${target.role} 面经库。资料会继续按岗位隔离。`);
    window.requestAnimationFrame(() => document.querySelector("#intake")?.scrollIntoView({ behavior: "smooth" }));
  };

  const chooseQuestion = (question: Question) => {
    patchState({ selectedQuestionId: question.id, answer: "", review: null, activeSession: null, followUpQuestion: undefined });
    document.querySelector("#practice")?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleSpeech = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return setNotice("当前浏览器不支持原生语音识别，请使用文字输入。");
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join("");
      if (transcript) setState((current) => ({ ...current, answer: `${current.answer}${current.answer ? "\n" : ""}${transcript}` }));
    };
    recognition.onerror = () => { setListening(false); setNotice("语音识别未能继续，请检查浏览器麦克风权限或改用文字输入。"); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="面试工作台首页"><span>面</span><div><strong>面试工作台</strong><small>INTERVIEW WORKBENCH</small></div></a>
        <nav className="top-nav" aria-label="页面导航"><a href="#intake">准备材料</a><a href="#libraries">我的面经库</a><a href="#questions">题库</a><a href="#practice">模拟作答</a><a href="#training-history">训练历史</a></nav>
        <div className="top-actions"><span className="local-badge">● 本地优先</span><button className="ghost-button" onClick={backupActions.exportBackup}>导出</button><label className="file-button ghost-button">导入备份<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void backupActions.prepareImport(file); event.currentTarget.value = ""; }} /></label><button className="ghost-button" onClick={backupActions.clearData}>清除</button></div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">本地优先 · 单题训练原型</p><h1>把面试准备，<br /><em>练成一条证据链。</em></h1><p>从目标 JD、简历和面经出发，生成简历题与专业 / JD 题；面经原题保留来源标签，完成一次作答，再看结构化反馈。</p></div>
        <div className="progress-card" aria-label={`准备进度 ${completion}/6`}><span>本次准备</span><strong>{completion}<i>/6</i></strong><div><b style={{ width: `${completion * (100 / 6)}%` }} /></div><small>{state.company} · {state.role}</small></div>
      </section>

      {externalUpdateAvailable && <div className="external-update" role="status"><span><strong>另一个标签页保存了新数据</strong><small>当前页面不会自动覆盖；加载后会切换到最新工作台状态。</small></span><div><button className="primary-button" onClick={refreshExternalState}>加载最新数据</button><button className="ghost-button" onClick={dismissExternalUpdate}>稍后</button></div></div>}
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}
      {error && <div className="error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="关闭错误提示">×</button></div>}

      {backupActions.pendingImport && <div className="backup-dialog-backdrop" role="presentation">
        <section className="backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title">
          <div className="backup-dialog-heading"><div><span>完整备份恢复</span><h2 id="backup-dialog-title">确认替换当前工作台</h2></div><button className="dialog-close" onClick={backupActions.cancelImport} aria-label="取消导入">×</button></div>
          <p>已完成文件校验和数据迁移。确认后，当前浏览器中的工作台数据将被这份备份完整替换；不会自动合并。</p>
          <strong className="backup-file-name">{backupActions.pendingImport.fileName}</strong>
          <dl className="backup-preview-grid">
            <div><dt>公司与岗位</dt><dd>{backupActions.pendingImport.preview.targetCount}</dd></div>
            <div><dt>面经来源</dt><dd>{backupActions.pendingImport.preview.sourceCount}</dd></div>
            <div><dt>当前题库</dt><dd>{backupActions.pendingImport.preview.questionCount}</dd></div>
            <div><dt>训练记录</dt><dd>{backupActions.pendingImport.preview.trainingSessionCount}</dd></div>
            <div><dt>简历正文</dt><dd>{backupActions.pendingImport.preview.resumeCharacterCount} 字</dd></div>
          </dl>
          {(backupActions.pendingImport.migratedFromLegacy || backupActions.pendingImport.upgradedLibraryHistory || backupActions.pendingImport.quarantinedSourceCount > 0 || backupActions.pendingImport.clearedMechanicalQuestionBank || backupActions.pendingImport.reindexedSourceCount > 0) && <div className="backup-migration-notes" role="status">
            <strong>恢复时将执行安全迁移</strong>
            <ul>
              {backupActions.pendingImport.migratedFromLegacy && <li>旧版数据将升级到当前 V6 结构。</li>}
              {backupActions.pendingImport.upgradedLibraryHistory && <li>将根据已有资料重建“我的面经库”索引。</li>}
              {backupActions.pendingImport.quarantinedSourceCount > 0 && <li>{backupActions.pendingImport.quarantinedSourceCount} 条无法确认岗位的旧面经将保留在隔离区。</li>}
              {backupActions.pendingImport.clearedMechanicalQuestionBank && <li>旧版机械模板题库将清空，材料和已完成训练仍会保留。</li>}
              {backupActions.pendingImport.reindexedSourceCount > 0 && <li>将用当前解析器重新检查 {backupActions.pendingImport.reindexedSourceCount} 篇旧来源，并恢复 {backupActions.pendingImport.recoveredQuestionCount} 道可识别真题。</li>}
            </ul>
          </div>}
          <p className="backup-privacy">DeepSeek Key 不属于工作台备份，不会被导入。</p>
          <div className="backup-dialog-actions"><button className="ghost-button" onClick={backupActions.cancelImport}>取消</button><button className="primary-button" onClick={backupActions.confirmImport}>完整替换并恢复</button></div>
        </section>
      </div>}

      <MaterialsSection
        target={{ company: state.company, role: state.role, onCompanyChange: (company) => patchState({ company }), onRoleChange: (role) => patchState({ role }) }}
        jd={{ target: currentTarget, draft: currentJdDraft, onChange: (text) => patchJdDraft({ text, sourceName: currentJdDraft.sourceName || "手动粘贴" }), onImport: (file) => void imports.importJdFile(file) }}
        experience={{
          target: currentTarget,
          draft: currentDraft,
          sources: scopedSources,
          sourceDraft: composition.sourceDraft,
          searchMode: collectionActions.searchMode,
          agentQuery: collectionActions.agentQuery,
          agentQueryEdited: collectionActions.agentQueryEdited,
          collection: collectionActions.collection,
          isDev: import.meta.env.DEV,
          onOriginChange: (origin) => patchExperienceDraft({ origin }),
          onSourceDraftChange: composition.setSourceDraft,
          onDraftTextChange: (text) => patchExperienceDraft({ text, origin: "manual" }),
          onImportFile: (file) => void imports.importExperienceFile(file),
          onSearchModeChange: collectionActions.changeSearchMode,
          onAgentQueryChange: collectionActions.changeAgentQuery,
          onRestoreAgentQuery: collectionActions.restoreAgentQuery,
          onCollect: () => void collectionActions.collect(),
          onImportAgentResult: (file) => void imports.importAgentResult(file),
          reindexPendingCount: sourceReindex.pendingCount,
          reindexState: sourceReindex.result,
          onReindexQuestions: () => void sourceReindex.reindex(),
        }}
        resume={{ text: state.resumeText, parsing: imports.parsingResume, onChange: (resumeText) => patchState({ resumeText }), onImport: (file) => void imports.importResume(file) }}
        generation={{ sourceCount: scopedSources.current.length, deepSeekConfigured: deepSeek.status.status === "configured", composing: composition.composing, warning: composition.warning, error: composition.error, onGenerateLocal: composition.generateLocal, onComposeDeepSeek: () => void composition.composeWithDeepSeek() }}
      />

      <section className="section" id="libraries">
        <div className="section-heading"><div><span>02 · MY LIBRARIES</span><h2>我的面经库</h2><p>每次成功采集、导入资料或生成题库后自动保存；点开历史库即可继续整理。</p></div><span className="prototype-badge">当前浏览器 · {experienceLibraries.length} 个</span></div>
        {experienceLibraries.length > 0 ? <div className="library-grid">
          {experienceLibraries.map((library) => <ExperienceLibraryCard
            key={library.id}
            library={library}
            sources={partitionSourcesByTarget(state.experienceSources, library.target).current}
            hasDraft={Boolean(state.experienceDrafts?.[library.target.key]?.text.trim())}
            hasJd={Boolean(state.jdDrafts?.[library.target.key]?.text.trim())}
            active={library.target.key === currentTarget.key}
            onOpen={() => openExperienceLibrary(library.target)}
          />)}
        </div> : <div className="empty-state library-empty">完成一次采集、导入或面经整理后，这里会自动保存你的第一个面经库。</div>}
      </section>

      <QuestionBankSection visibleQuestions={visibleQuestions} questionFilter={questionFilter} onFilterChange={setQuestionFilter} sourceById={sourceById} onChoose={chooseQuestion} />

      <PracticeSection
        deepSeek={{
          value: deepSeek.status,
          isDev: import.meta.env.DEV,
          showConfig: deepSeek.showConfig,
          apiKey: deepSeek.apiKey,
          savingKey: deepSeek.savingKey,
          analyzing: reviewActions.analyzing,
          reviewError: reviewActions.reviewError,
          onToggleConfig: deepSeek.toggleConfig,
          onApiKeyChange: deepSeek.setApiKey,
          onCancelConfig: deepSeek.cancelConfig,
          onConfigure: () => void deepSeek.configure(),
          onRemoveKey: () => void deepSeek.remove(),
          onEvaluate: () => void reviewActions.evaluate(),
        }}
        practice={{
          selectedQuestion,
          answer: state.answer,
          review: state.review,
          activeSession: state.activeSession,
          followUpQuestion: state.followUpQuestion,
          listening,
          speechSupported,
          onAnswerChange: (answer) => { patchState({ answer, review: null }); reviewActions.clearReviewError(); },
          onToggleSpeech: toggleSpeech,
          onContinueFollowUp: () => { reviewActions.clearReviewError(); trainingActions.continueFollowUp(); },
          onFinishSession: trainingActions.finishCurrentSession,
        }}
        formatDate={formatLibraryDate}
      />

      <TrainingHistorySection sessions={currentTrainingSessions} formatDate={formatLibraryDate} />

      <footer><div><strong>面试工作台 · 本地优先原型</strong><p>小红书采集与 DeepSeek 分析都只在用户主动点击时发生；不包含后台批量任务、后端语音转写或账号同步。</p></div><a href="#top">回到顶部 ↑</a></footer>
    </main>
  );
}

function ExperienceLibraryCard({ library, sources, hasDraft, hasJd, active, onOpen }: { library: ExperienceLibrary; sources: ExperienceSource[]; hasDraft: boolean; hasJd: boolean; active: boolean; onOpen: () => void }) {
  const questionCount = sources.reduce((sum, source) => sum + source.questions.length, 0);
  return <article className={`library-card${active ? " active" : ""}`}>
    <div className="library-card-top"><span>{active ? "当前打开" : "历史面经库"}</span><small>更新于 {formatLibraryDate(library.updatedAt)}</small></div>
    <h3>{library.target.company}</h3>
    <p>{library.target.role}</p>
    <div className="library-stats"><span><strong>{sources.length}</strong> 篇来源</span><span><strong>{questionCount}</strong> 道原题</span>{hasJd && <span>含 JD</span>}{hasDraft && <span>含整理正文</span>}</div>
    <button className={active ? "ghost-button" : "primary-button"} onClick={onOpen}>{active ? "查看当前资料" : "打开面经库"} →</button>
  </article>;
}

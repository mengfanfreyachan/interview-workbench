import type { EvidenceReviewV1, ReviewObservation, ReviewSourceRef } from "../interview-review-protocol";
import { QUESTION_CATEGORY_COPY } from "../question-copy";
import type { Question, TrainingSession } from "../types";
import type { DeepSeekUiStatus } from "../use-deepseek-session";

type Props = {
  deepSeek: {
    value: DeepSeekUiStatus;
    isDev: boolean;
    showConfig: boolean;
    apiKey: string;
    savingKey: boolean;
    analyzing: boolean;
    reviewError: string;
    onToggleConfig: () => void;
    onApiKeyChange: (value: string) => void;
    onCancelConfig: () => void;
    onConfigure: () => void;
    onRemoveKey: () => void;
    onEvaluate: () => void;
  };
  practice: {
    selectedQuestion?: Question;
    answer: string;
    review: EvidenceReviewV1 | null;
    activeSession: TrainingSession | null;
    followUpQuestion?: Question;
    listening: boolean;
    speechSupported: boolean;
    onAnswerChange: (value: string) => void;
    onToggleSpeech: () => void;
    onContinueFollowUp: () => void;
    onFinishSession: () => void;
  };
  formatDate: (value: string) => string;
};

export function PracticeSection({ deepSeek, practice, formatDate }: Props) {
  const status = deepSeek.value;
  const selectedQuestion = practice.selectedQuestion;
  return <section className="section practice-section" id="practice">
    <div className="section-heading"><div><span>04 · PRACTICE</span><h2>单题模拟作答</h2><p>浏览器支持时可用原生语音识别；DeepSeek 会结合题目类别、JD、简历与来源片段进行无分数证据审阅。</p></div><span className={`prototype-badge${status.status === "configured" ? " ai-ready" : ""}`}>{status.status === "configured" ? "DeepSeek 已接入" : "等待配置 Key"}</span></div>
    <div className={`deepseek-settings ${status.status}`}>
      <div className="deepseek-settings-summary"><span>AI</span><div><strong>{status.status === "configured"
        ? status.keySource === "session" ? "正在使用你本次填写的 Key" : "正在使用项目环境 Key"
        : status.status === "checking" ? "正在检查 DeepSeek 配置" : status.status === "missing" ? "尚未配置 DeepSeek" : "当前版本无法配置 DeepSeek"}</strong><p>{status.status === "configured"
          ? `${status.model || "DeepSeek"} · ${status.keySource === "session" ? "Key 仅在本机服务内存中，重启后失效。" : "你可以为本次运行临时改用自己的 Key。"}`
          : status.status === "missing" ? "填写自己的 API Key 后即可使用深度分析；Key 不写入浏览器存储、备份或项目文件。" : status.status === "unavailable" ? "会话 Key 入口只在带本机服务的开源运行方式中可用。" : "请稍候。"}</p></div></div>
      {deepSeek.isDev && <div className="deepseek-settings-actions"><button className="ghost-button" aria-expanded={deepSeek.showConfig} onClick={deepSeek.onToggleConfig}>{status.keySource === "session" ? "更换自己的 Key" : status.keySource === "environment" ? "改用自己的 Key" : "配置自己的 Key"}</button>{status.keySource === "session" && <button className="text-button danger" disabled={deepSeek.savingKey} onClick={deepSeek.onRemoveKey}>移除本次 Key</button>}</div>}
      {deepSeek.showConfig && deepSeek.isDev && <form className="deepseek-key-form" onSubmit={(event) => { event.preventDefault(); deepSeek.onConfigure(); }}>
        <label><span>DeepSeek API Key</span><input type="password" value={deepSeek.apiKey} minLength={16} maxLength={256} autoComplete="new-password" spellCheck={false} onChange={(event) => deepSeek.onApiKeyChange(event.target.value)} placeholder="粘贴你的 API Key" autoFocus /></label>
        <div><button type="button" className="ghost-button" onClick={deepSeek.onCancelConfig}>取消</button><button type="submit" className="primary-button" disabled={deepSeek.savingKey || !deepSeek.apiKey.trim()}>{deepSeek.savingKey ? "正在启用…" : "仅为本次运行启用"}</button></div>
        <small>提交后输入框立即清空。Key 只交给本机服务内存，页面刷新不丢失；首次深度分析时验证，停止或重启服务后自动失效。</small>
      </form>}
    </div>
    {selectedQuestion ? <div className="practice-grid"><article className="card answer-card"><div className="question-kicker"><span>{selectedQuestion.category ? QUESTION_CATEGORY_COPY[selectedQuestion.category].kicker : selectedQuestion.kind === "resume" ? "简历题" : "专业 / JD"}</span><b>{selectedQuestion.provenance === "source_question" ? "面经原题" : selectedQuestion.provenance === "coach_generated" ? "DeepSeek 生成" : selectedQuestion.provenance === "source_derived" ? "本地规则生成" : selectedQuestion.origin}</b></div><h3>{selectedQuestion.title}</h3><p className="intent">面试意图：{selectedQuestion.intent}</p>{selectedQuestion.sourceRefs && <div className="practice-source-refs">{selectedQuestion.sourceRefs.map((ref) => <span key={`${ref.sourceId}-${ref.locator ?? ""}`}><b>{ref.label}</b>{ref.locator && ` · ${ref.locator}`}</span>)}</div>}<ul>{selectedQuestion.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul><label className="textarea-label"><span>你的回答</span><textarea value={practice.answer} onChange={(event) => practice.onAnswerChange(event.target.value)} placeholder="建议先说结论，再说明具体行动、证据和复盘…" /></label><div className={`ai-readiness ${status.status}`} role="status"><div><span>DeepSeek</span><strong>{status.status === "configured" ? `已配置 · ${status.model}` : status.status === "checking" ? "正在检查配置" : status.status === "missing" ? "尚未配置 API key" : "当前环境不可用"}</strong></div><p>{status.status === "configured" ? "点击后会发送当前题目类别、题目来源片段、JD、简历与本次回答；输出不含分数，并逐条标注材料来源。" : "请先在上方配置自己的 DeepSeek Key，再进行证据审阅。"}</p></div><div className="answer-actions"><button className={`speech-button${practice.listening ? " active" : ""}`} onClick={practice.onToggleSpeech} aria-pressed={practice.listening}>{practice.listening ? "■ 停止识别" : "◉ 语音回答"}</button><small>{practice.speechSupported ? "使用浏览器原生语音识别，文字会进入当前输入框。" : "当前浏览器不支持语音识别，请使用文字输入。"}</small><div className="evaluation-actions"><button className="primary-button" disabled={status.status !== "configured" || deepSeek.analyzing} onClick={deepSeek.onEvaluate}>{deepSeek.analyzing ? "证据审阅中…" : "DeepSeek 证据审阅"}</button></div></div>{deepSeek.analyzing && <div className="review-action-status pending" role="status">正在结合 JD、简历与材料来源生成证据审阅，通常需要十几秒。</div>}{deepSeek.reviewError && <div className="review-action-status failed" role="alert"><strong>本次审阅未完成</strong><span>{deepSeek.reviewError}</span><button onClick={deepSeek.onEvaluate}>重新审阅</button></div>}</article>
      <div className="review-column"><EvidenceReviewPanel review={practice.review} model={status.model} />{practice.activeSession?.status === "awaiting_follow_up" && practice.followUpQuestion && <div className="follow-up-decision"><span>首轮审阅已完成</span><strong>{practice.followUpQuestion.title}</strong><p>只继续这一条追问；你也可以结束并保存当前一轮。</p><div><button className="primary-button" onClick={practice.onContinueFollowUp}>继续这条追问 →</button><button className="ghost-button" onClick={practice.onFinishSession}>结束并保存</button></div></div>}{practice.activeSession?.status === "completed" && <div className="session-saved"><strong>本轮训练已保存</strong><span>{practice.activeSession.turns.length} 轮问答 · {practice.activeSession.completedAt ? formatDate(practice.activeSession.completedAt) : "刚刚"}</span></div>}</div></div> : <div className="empty-state">请先生成并选择一道题。</div>}
  </section>;
}

function EvidenceReviewPanel({ review, model }: { review: EvidenceReviewV1 | null; model: string }) {
  if (!review) return <aside className="card feedback-card" aria-live="polite"><div className="feedback-empty"><span>◎</span><strong>等待一次完整回答</strong><p>DeepSeek 将结合当前 JD、简历、题目类别和来源片段，按照证据协议给出不含分数的审阅。</p></div></aside>;
  const sourceById = Object.fromEntries(review.sourceLedger.map((source) => [source.id, source]));
  const refs = (items: ReviewSourceRef[]) => <div className="review-refs">{items.map((ref, index) => <span key={`${ref.sourceId}-${index}`}><b>{sourceById[ref.sourceId]?.title || ref.sourceId}</b>{ref.locator && ` · ${ref.locator}`}{ref.quote && <q>{ref.quote}</q>}</span>)}</div>;
  const observations = (items: ReviewObservation[], empty: string) => items.length ? items.map((item) => <article className="review-observation" key={item.id}><p>{item.observation}</p><small>{item.impact}</small>{refs(item.sourceRefs)}<em>下一步：{item.nextAction}</em></article>) : <p className="review-empty-line">{empty}</p>;
  return <aside className="card feedback-card" aria-live="polite">
    <div className="review-head"><div><span>DeepSeek · {model}</span><strong>证据化回答审阅</strong></div><small>{review.schemaVersion}</small></div>
    <section className="review-section positive"><h4>已呈现的证据</h4>{observations(review.presentedEvidence, "本次回答尚未形成足够具体、可核对的能力证据。")}</section>
    <section className="review-section evidence-gap"><h4>尚未说明的事实</h4>{observations(review.missingFacts, "没有识别到影响判断的关键事实缺口。")}</section>
    <section className="review-section communication"><h4>表达问题</h4>{observations(review.communicationIssues, "本次没有识别到明显表达问题。")}</section>
    <section className="review-section risk"><h4>判断与策略风险</h4>{observations(review.strategyRisks, "本次没有识别到明确的判断或策略风险。")}</section>
    <section className="review-section jd"><h4>岗位关联与经历佐证</h4>{review.jdConnections.length ? review.jdConnections.map((item) => <article className="review-observation" key={item.id}><div className="review-status"><span>{item.status}</span><b>{item.jdRequirement}</b><i className={`evidence-status evidence-${item.experienceEvidence}`}>{item.experienceEvidence === "demonstrated" ? "经历已主动佐证" : item.experienceEvidence === "partial" ? "经历部分佐证" : item.experienceEvidence === "not_applicable" ? "无需简历佐证" : "尚未主动佐证"}</i></div><p>{item.observation}</p><small>{item.impact}</small>{refs(item.sourceRefs)}<em>下一步：{item.nextAction}</em></article>) : <p className="review-empty-line">当前材料无法建立可靠的岗位关联。</p>}</section>
    <section className="priority-review"><span>优先改进项</span><strong>{review.priorityImprovement.observation}</strong><p>{review.priorityImprovement.action}</p><small>{review.priorityImprovement.retryConstraint} · 成功信号：{review.priorityImprovement.successSignal}</small>{refs(review.priorityImprovement.sourceRefs)}</section>
    <div className="follow-up"><span>下一条追问 · {review.nextFollowUp.testsSignal}</span><p>{review.nextFollowUp.question}</p>{refs(review.nextFollowUp.sourceRefs)}</div>
    {review.limitations.length > 0 && <div className="review-limitations"><strong>审阅边界</strong>{review.limitations.map((item) => <p key={item}>{item}</p>)}</div>}
    <small className="disclaimer">AI 审阅只用于训练；它区分材料事实、本轮回答与尚未说明内容，不代表真实面试官结论或录用判断。</small>
  </aside>;
}

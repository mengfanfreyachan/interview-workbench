import type { CollectionState } from "../collection-state";
import { SEARCH_MODE_COPY, type SearchMode } from "../search-strategy";
import type { SourceDraft } from "../source-draft";
import type { CompositionWarningSummary } from "../question-composition-warning";
import type { ExperienceDraft, ExperienceSource, ExperienceTarget, JdDraft } from "../types";
import type { SourceQuestionReindexState } from "../use-source-question-reindex";

const STOP_REASON_COPY = {
  source_limit: "已达到本轮 20 篇新来源上限",
  saturated: "连续两轮没有发现新来源，已达到搜索饱和",
  time_limit: "已达到本轮最长运行时间",
  query_plan_exhausted: "已执行完全部搜索词",
  no_results: "全部搜索词均未发现可读取来源",
} as const;

type Props = {
  target: {
    company: string;
    role: string;
    onCompanyChange: (value: string) => void;
    onRoleChange: (value: string) => void;
  };
  jd: {
    target: ExperienceTarget;
    draft: JdDraft;
    onChange: (value: string) => void;
    onImport: (file: File) => void;
  };
  experience: {
    target: ExperienceTarget;
    draft: ExperienceDraft;
    sources: { current: ExperienceSource[]; other: ExperienceSource[]; unassigned: ExperienceSource[] };
    sourceDraft: SourceDraft;
    searchMode: SearchMode;
    agentQuery: string;
    agentQueryEdited: boolean;
    collection: CollectionState;
    isDev: boolean;
    onOriginChange: (origin: "manual" | "agent") => void;
    onSourceDraftChange: (draft: SourceDraft) => void;
    onDraftTextChange: (value: string) => void;
    onImportFile: (file: File) => void;
    onSearchModeChange: (mode: SearchMode) => void;
    onAgentQueryChange: (value: string) => void;
    onRestoreAgentQuery: () => void;
    onCollect: () => void;
    onImportAgentResult: (file: File) => void;
    reindexPendingCount: number;
    reindexState: SourceQuestionReindexState;
    onReindexQuestions: () => void;
  };
  resume: {
    text: string;
    parsing: boolean;
    onChange: (value: string) => void;
    onImport: (file: File) => void;
  };
  generation: {
    sourceCount: number;
    deepSeekConfigured: boolean;
    composing: boolean;
    warning: CompositionWarningSummary | null;
    error: string;
    onGenerateLocal: () => void;
    onComposeDeepSeek: () => void;
  };
};

export function MaterialsSection({ target, jd, experience, resume, generation }: Props) {
  return <section className="section" id="intake">
    <div className="section-heading"><div><span>01 · PREPARE</span><h2>准备岗位与材料</h2><p>资料默认保存在当前浏览器；只有你主动点击采集或 DeepSeek 分析时才会发送必要内容。</p></div><span className="prototype-badge">本地优先</span></div>
    <div className="intake-grid">
      <article className="card target-card"><div className="card-title"><span>目标</span><div><h3>岗位目标</h3><p>生成题库时始终保留公司和岗位语境。</p></div></div><label><span>公司</span><input value={target.company} onChange={(event) => target.onCompanyChange(event.target.value)} placeholder="例如：字节跳动" /></label><label><span>岗位</span><input value={target.role} onChange={(event) => target.onRoleChange(event.target.value)} placeholder="例如：产品运营实习生" /></label></article>

      <article className="card jd-card"><div className="card-title"><span>岗</span><div><h3>岗位 JD</h3><p>JD 与当前公司和岗位单独绑定，用于后续来源化组题与回答审阅。</p></div></div><div className={`material-binding${jd.draft.text.trim() ? " ready" : ""}`}><span>{jd.draft.text.trim() ? "已绑定当前岗位" : "当前岗位尚未绑定 JD"}</span><strong>{jd.target.company || "未填写公司"} · {jd.target.role || "未填写岗位"}</strong></div><label className="textarea-label"><span>JD 原文 · 可编辑</span><textarea disabled={!jd.target.company || !jd.target.role} value={jd.draft.text} onChange={(event) => jd.onChange(event.target.value)} placeholder={jd.target.company && jd.target.role ? "粘贴完整岗位职责和岗位要求…" : "请先填写公司和岗位"} /></label><div className="card-actions"><label className={`file-button ghost-button${!jd.target.company || !jd.target.role ? " disabled" : ""}`}>导入 JD 文件<input disabled={!jd.target.company || !jd.target.role} type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) jd.onImport(file); event.currentTarget.value = ""; }} /></label><span>{jd.draft.text.trim().length} 字{jd.draft.sourceName ? ` · ${jd.draft.sourceName}` : ""}</span></div><p className="material-privacy">JD 保存在当前浏览器，并按公司＋岗位隔离；当前阶段不会自动发送给 DeepSeek。</p></article>

      <article className="card experience-card"><div className="card-title"><span>经</span><div><h3>面经库</h3><p>外部题保留来源；规则生成题不会伪装成真题。</p></div></div>
        <div className="target-scope-banner"><div><span>当前岗位资料</span><strong>{experience.target.company || "未填写公司"} · {experience.target.role || "未填写岗位"}</strong></div><p>仅当前岗位的面经会显示并进入题库。</p></div>
        {(experience.sources.other.length > 0 || experience.sources.unassigned.length > 0) && <div className="source-isolation" role="status"><strong>已隔离其他资料</strong><p>{experience.sources.other.length > 0 ? `其他岗位 ${experience.sources.other.length} 篇` : ""}{experience.sources.other.length > 0 && experience.sources.unassigned.length > 0 ? "，" : ""}{experience.sources.unassigned.length > 0 ? `旧版未归类 ${experience.sources.unassigned.length} 篇` : ""}，均不会进入当前题库。</p></div>}
        <div className="mode-tabs" role="tablist" aria-label="面经导入方式"><button role="tab" aria-selected={experience.draft.origin === "manual"} className={experience.draft.origin === "manual" ? "active" : ""} onClick={() => experience.onOriginChange("manual")}>手动粘贴 / 导入</button><button role="tab" aria-selected={experience.draft.origin === "agent"} className={experience.draft.origin === "agent" ? "active" : ""} onClick={() => experience.onOriginChange("agent")}>Agent Reach 结果</button></div>
        {experience.draft.origin === "manual" ? <>
          <div className="source-fields"><label><span>来源标题</span><input value={experience.sourceDraft.title} onChange={(event) => experience.onSourceDraftChange({ ...experience.sourceDraft, title: event.target.value })} placeholder="例如：2025 春招一面复盘" /></label><label><span>平台</span><input value={experience.sourceDraft.platform} onChange={(event) => experience.onSourceDraftChange({ ...experience.sourceDraft, platform: event.target.value })} placeholder="牛客 / 校友访谈 / 其他" /></label><label className="wide"><span>来源 URL（可选）</span><input type="url" value={experience.sourceDraft.url} onChange={(event) => experience.onSourceDraftChange({ ...experience.sourceDraft, url: event.target.value })} placeholder="https://…" /></label></div>
          <label className="textarea-label"><span>面经正文</span><textarea value={experience.draft.text} onChange={(event) => experience.onDraftTextChange(event.target.value)} placeholder="粘贴面经、问题清单或访谈整理…" /></label>
          <label className="file-button ghost-button">导入 .txt / .md<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) experience.onImportFile(file); event.currentTarget.value = ""; }} /></label>
        </> : <div className="agent-channel">
          <div className={`integration-status${experience.isDev ? " available" : ""}`}><span>{experience.isDev ? "本地可用" : "静态版不可用"}</span><strong>深度采集小红书面经</strong><p>一次执行最多 6 组递进搜索，跨轮和跨批次去重，最多读取 20 篇新来源；连续两轮没有新增时自动停止。OpenCLI 只使用你当前已有的 Chrome 会话，本页面不会读取 Cookie 或替你登录。</p></div>
          <div className="search-mode-control" role="group" aria-label="面经搜索范围">{(Object.keys(SEARCH_MODE_COPY) as SearchMode[]).map((mode) => <button key={mode} className={experience.searchMode === mode ? "active" : ""} aria-pressed={experience.searchMode === mode} onClick={() => experience.onSearchModeChange(mode)}><strong>{SEARCH_MODE_COPY[mode].label}</strong><span>{SEARCH_MODE_COPY[mode].summary}</span></button>)}</div>
          <label className="agent-query"><span>起始搜索词</span><div><input value={experience.agentQuery} maxLength={120} onChange={(event) => experience.onAgentQueryChange(event.target.value)} placeholder="公司 岗位 面经" /><button className="ghost-button" onClick={experience.onRestoreAgentQuery}>恢复推荐词</button></div><small>{experience.agentQuery.length}/120 · {experience.agentQueryEdited ? "以你修改的词为第一轮" : SEARCH_MODE_COPY[experience.searchMode].summary} 系统随后自动扩展搜索，不需要逐轮点击。</small></label>
          <button className="primary-button collect-button" disabled={!experience.isDev || experience.collection.status === "collecting"} onClick={experience.onCollect}>{experience.collection.status === "collecting" ? "正在深度采集…" : "开始深度采集"}</button>
          {!experience.isDev && <p className="static-adapter-warning" role="status">深度采集仅在本地 <code>npm run dev</code> 可用；静态部署需服务端 adapter。你仍可导入已有 JSON。</p>}
          {experience.collection.status === "collecting" && <div className="collection-progress" role="status"><strong>深度采集中</strong><p>正在依次扩展搜索、去重并串行读取正文，最慢约 6 分钟。请保持 Chrome 与 OpenCLI 扩展可用。</p><small>已有来源会自动跳过；达到 20 篇新来源、搜索饱和或时间上限后停止。</small></div>}
          {experience.collection.status === "done" && <div className="collection-result" role="status"><div className="collection-result-heading"><div><strong>本次覆盖报告</strong><p>{experience.collection.coverage ? STOP_REASON_COPY[experience.collection.coverage.stopReason] : "本轮采集已完成"}</p></div><span>{experience.collection.stats.queryExecutedCount ?? 1}/{experience.collection.stats.queryPlannedCount ?? 1} 组搜索</span></div><div className="collection-stats deep"><span><b>{experience.collection.stats.searchHitCount}</b>累计命中</span><span><b>{experience.collection.stats.uniqueHitCount ?? experience.collection.stats.searchHitCount}</b>唯一来源</span><span><b>{experience.collection.stats.existingSkippedCount ?? 0}</b>已有跳过</span><span><b>{experience.collection.stats.bodyReadCount}</b>新增读取</span><span><b>{experience.collection.stats.questionSourceCount ?? 0}</b>含真题来源</span><span><b>{experience.collection.stats.questionCount}</b>真题提取</span><span><b>{experience.collection.stats.failureCount}</b>读取失败</span></div>{experience.collection.stats.bodyReadCount > 0 && experience.collection.stats.questionCount === 0 && <p>已读取正文并保存摘要，但自动提取为 0 道；正文中仍可能有面试信息，可查看来源或手动整理。</p>}{experience.collection.coverage?.queries.length ? <details className="coverage-details"><summary>查看每轮搜索覆盖</summary><ol>{experience.collection.coverage.queries.map((item, index) => <li key={`${item.query}-${index}`}><span>{item.query}</span><small>{item.status === "failed" ? `搜索失败：${item.error ?? "未知原因"}` : `命中 ${item.hitCount} 篇 · 新增唯一来源 ${item.newUniqueCount} 篇`}</small></li>)}</ol></details> : null}{experience.collection.failures.length > 0 && <details className="coverage-details failures"><summary>查看 {experience.collection.failures.length} 篇读取失败</summary><ul>{experience.collection.failures.map((failure, index) => <li key={`${failure.title}-${index}`}>{failure.title}：{failure.reason}</li>)}</ul></details>}</div>}
          {experience.collection.status === "failed" && <div className="collection-result failed" role="alert"><strong>采集未完成</strong><p>{experience.collection.error}</p></div>}
          <div className="agent-json-import"><code>agent-reach.interview-experience.v1</code><label className="file-button ghost-button">导入结果 JSON<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) experience.onImportAgentResult(file); event.currentTarget.value = ""; }} /></label></div>
        </div>}
        {experience.sources.current.length > 0 ? <>
          <div className="source-reindex-bar"><div><strong>来源真题识别</strong><small>{experience.reindexPendingCount > 0 ? `${experience.reindexPendingCount} 篇尚未识别到真题` : "当前来源均已有识别结果"}</small></div>{experience.reindexPendingCount > 0 && <button className="ghost-button" disabled={experience.reindexState.status === "running"} onClick={experience.onReindexQuestions}>{experience.reindexState.status === "running" ? "重新识别中…" : "重新识别真题"}</button>}</div>
          {experience.reindexState.message && <p className={`source-reindex-result ${experience.reindexState.status}`} role={experience.reindexState.status === "failed" ? "alert" : "status"}>{experience.reindexState.message}</p>}
          <div className="source-list" aria-label="当前岗位面经来源">{experience.sources.current.map((source) => <article key={source.id}><div><strong>{source.title}</strong><small>{source.platform} · {source.capturedAt.slice(0, 10)} · {source.importMethod === "agent-reach" ? "Agent Reach 导入" : "用户导入"}</small><small className={source.questions.length ? "question-extraction-status ready" : "question-extraction-status"}>{source.questions.length ? `已提取 ${source.questions.length} 道真题` : "已保存正文摘要，尚未识别到真题"}</small></div>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">查看来源 ↗</a> : <span>无 URL</span>}</article>)}</div>
        </> : <p className="current-source-empty">当前岗位还没有已归类的面经来源。</p>}
      </article>

      <article className="card resume-card"><div className="card-title"><span>历</span><div><h3>简历材料</h3><p>上传后转为可编辑底稿，用于组题与回答分析。</p></div></div><label className="textarea-label"><span>解析后的简历正文 · 可编辑</span><textarea value={resume.text} onChange={(event) => resume.onChange(event.target.value)} placeholder="上传简历，或粘贴教育、经历、项目与技能…" /></label><div className="card-actions"><label className={`file-button ghost-button${resume.parsing ? " disabled" : ""}`}>{resume.parsing ? "正在本地解析…" : "上传简历文件"}<input type="file" disabled={resume.parsing} accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) resume.onImport(file); event.currentTarget.value = ""; }} /></label><span>{resume.text.trim().length} 字</span></div><p className="resume-privacy">你可以直接核对和修改这里的文字。原文件不上传；扫描版 PDF 和旧版 .doc 暂不支持。</p></article>
    </div>
    <div className="generate-bar"><div className="generate-copy"><strong>为当前岗位生成来源化题库</strong><p>先用本地规则快速筛选；也可主动让 DeepSeek 基于相同候选材料深度组题。面经原题保留原文和来源，AI 衍生题不会标成真题。</p>{generation.composing && <small role="status">正在基于当前 JD、简历、本地候选题和 {generation.sourceCount} 篇面经深度组题…</small>}{generation.error && <small className="generate-error" role="alert">{generation.error}</small>}</div><div className="generate-actions"><button className="ghost-button" onClick={generation.onGenerateLocal}>本地规则组题</button><button className="primary-button" disabled={!generation.deepSeekConfigured || generation.composing} onClick={generation.onComposeDeepSeek}>{generation.composing ? "DeepSeek 组题中…" : "DeepSeek 智能组题 →"}</button></div>{generation.warning && <div className="generation-result" role="status" aria-label="智能组题部分成功"><div className="generation-result-summary"><span>部分成功</span><strong>已保留 {generation.warning.acceptedCount} 道有效题</strong><small>另有 {generation.warning.skippedCount} 道未通过质量检查，已安全跳过。</small></div><ul>{generation.warning.items.map((item) => <li key={item.category}><span>{item.label}</span><b>{item.count} 道</b></li>)}</ul><div className="generation-result-next"><span>有效题库已经保存，可以继续练习。</span><a href="#questions">查看有效题目 →</a></div></div>}</div>
  </section>;
}

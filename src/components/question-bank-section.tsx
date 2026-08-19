import { QUESTION_CATEGORY_COPY, QUESTION_FILTER_COPY, type QuestionFilter } from "../question-copy";
import type { ExperienceSource, Question, QuestionCategory } from "../types";

type Props = {
  visibleQuestions: Question[];
  questionFilter: QuestionFilter;
  onFilterChange: (filter: QuestionFilter) => void;
  sourceById: Record<string, ExperienceSource>;
  onChoose: (question: Question) => void;
};

export function QuestionBankSection({ visibleQuestions, questionFilter, onFilterChange, sourceById, onChoose }: Props) {
  const questionsByCategory = {
    resume_deep_dive: visibleQuestions.filter((question) => question.category === "resume_deep_dive" || (!question.category && question.kind === "resume")),
    role_capability: visibleQuestions.filter((question) => question.category === "role_capability" || (!question.category && question.kind === "role")),
  };
  const filteredQuestions = visibleQuestions.filter((question) => questionFilter === "all"
    || (questionFilter === "resume" && question.category === "resume_deep_dive")
    || (questionFilter === "role" && question.category === "role_capability")
    || (questionFilter === "source" && question.provenance === "source_question"));

  return <section className="section" id="questions">
    <div className="section-heading"><div><span>03 · QUESTION BANK</span><h2>两类主题库 · 来源标签</h2><p>简历题与专业 / JD 题作为主类别；面经原题通过来源标签保留原文、平台和链接。</p></div><span className="prototype-badge">来源可追溯</span></div>
    <div className="question-filters" role="group" aria-label="题库筛选">{(Object.keys(QUESTION_FILTER_COPY) as QuestionFilter[]).map((filter) => <button key={filter} className={questionFilter === filter ? "active" : ""} aria-pressed={questionFilter === filter} onClick={() => onFilterChange(filter)}>{QUESTION_FILTER_COPY[filter]}<small>{filter === "all" ? visibleQuestions.length : filter === "resume" ? questionsByCategory.resume_deep_dive.length : filter === "role" ? questionsByCategory.role_capability.length : visibleQuestions.filter((question) => question.provenance === "source_question").length}</small></button>)}</div>
    {questionFilter === "all"
      ? <div className="question-columns">{(Object.keys(QUESTION_CATEGORY_COPY) as QuestionCategory[]).map((category) => <QuestionBank key={category} title={QUESTION_CATEGORY_COPY[category].title} subtitle={QUESTION_CATEGORY_COPY[category].subtitle} questions={questionsByCategory[category]} sourceById={sourceById} onChoose={onChoose} />)}</div>
      : <div className="question-columns filtered"><QuestionBank title={QUESTION_FILTER_COPY[questionFilter]} subtitle={questionFilter === "source" ? "仅显示可追溯到当前岗位面经来源的原题；它不是第三种能力类别。" : questionFilter === "resume" ? QUESTION_CATEGORY_COPY.resume_deep_dive.subtitle : QUESTION_CATEGORY_COPY.role_capability.subtitle} questions={filteredQuestions} sourceById={sourceById} onChoose={onChoose} /></div>}
  </section>;
}

function QuestionBank({ title, subtitle, questions, sourceById, onChoose }: { title: string; subtitle: string; questions: Question[]; sourceById: Record<string, ExperienceSource>; onChoose: (question: Question) => void }) {
  return <article className="question-bank"><div className="bank-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><strong>{questions.length}</strong></div>{questions.length ? <div className="question-list">{questions.map((question, index) => { const source = question.sourceId ? sourceById[question.sourceId] : undefined; const provenanceLabel = question.provenance === "source_question" ? "面经原题" : question.provenance === "coach_generated" ? "DeepSeek 生成" : question.provenance === "source_derived" ? "本地规则生成" : question.origin; return <article key={question.id}><div className="question-number">{String(index + 1).padStart(2, "0")}</div><div><div className="origin-line"><span className={`origin origin-${question.provenance === "source_question" ? "external" : "local"}`}>{provenanceLabel}</span>{source && <small>{source.platform} · {source.title}</small>}</div><h4>{question.title}</h4><p>{question.intent}</p>{question.sourceRefs && <div className="question-source-refs">{question.sourceRefs.map((ref) => <span key={`${ref.sourceId}-${ref.locator ?? ""}`}><b>{ref.label}</b>{ref.locator && ` · ${ref.locator}`}{ref.excerpt && <small>“{ref.excerpt}”</small>}</span>)}</div>}</div><button onClick={() => onChoose(question)} aria-label={`练习：${question.title}`}>开始作答 →</button></article>; })}</div> : <div className="bank-empty">当前材料不足，暂未生成这一类题目。</div>}</article>;
}

import type { TrainingSession } from "../types";

type Props = {
  sessions: TrainingSession[];
  formatDate: (value: string) => string;
};

export function TrainingHistorySection({ sessions, formatDate }: Props) {
  return <section className="section" id="training-history">
    <div className="section-heading"><div><span>05 · TRAINING HISTORY</span><h2>训练历史</h2><p>只展示当前公司与岗位的完整问答记录；切换面经库后会自动切换历史。</p></div><span className="prototype-badge">当前岗位 · {sessions.length} 轮</span></div>
    {sessions.length ? <div className="training-history-list">{sessions.map((session) => <article className="training-history-card" key={session.id}><div><span>{session.turns.length} 轮 · 已完成</span><small>{formatDate(session.completedAt || session.startedAt)}</small></div><h3>{session.target.company} · {session.target.role}</h3><p>{session.turns[0]?.question.title}</p><ol>{session.turns.map((turn, index) => <li key={turn.id}><strong>{index === 0 ? "主问题" : "唯一追问"}</strong><span>{turn.question.title}</span><small>{turn.review.priorityImprovement.observation}</small></li>)}</ol></article>)}</div> : <div className="empty-state library-empty">当前岗位还没有完成的训练记录。</div>}
  </section>;
}

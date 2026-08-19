import type { Question } from "./types";

const MULTI_FOCUS_SIGNAL = /(?:并|同时|以及|并且|还要)(?:说明|解释|分析|回答|描述|举例|判断|提出)|(?:是什么|有哪些|哪些).{0,36}(?:如何|为什么|怎么)|(?:如何|为什么|怎么).{0,48}(?:如何|为什么|怎么)/u;
const GENERIC_JD_OPENING = /^JD(?:中)?(?:提到|要求|强调|写到)/u;
const GENERIC_JD_REQUEST = /(?:请)?(?:说明|谈谈|介绍).*(?:如何)?(?:在实际工作中)?(?:做到|完成|落实)(?:这一点|这些要求)?/u;
const LEGAL_ROLE = /法务|法律|合规|律师|风控/u;
const SITUATIONAL_OPENING = /^(?:如果|假如|当|遇到|面对|你发现|某(?:项|个|业务|合同|项目|部门)|业务(?:方|团队|部门)|对方|合作方)/u;

const compact = (value: string) => value.normalize("NFKC").replace(/\s+/gu, "");

export const normalizeQuestionTitle = (value: string) => compact(value).replace(/[，。；：、！？,.!?;:'"“”‘’（）()\[\]【】《》〈〉—–-]/gu, "");

/** Generated questions must end in exactly one question mark and ask one primary task. */
export function hasSingleQuestionFocus(title: string) {
  const normalized = compact(title);
  const questionMarks = normalized.match(/[？?]/gu) ?? [];
  return questionMarks.length === 1 && /[？?]$/u.test(normalized) && !MULTI_FOCUS_SIGNAL.test(normalized);
}

/** Detects generic JD restatements that do not introduce a decision, conflict, constraint, or evidence check. */
export function isGenericJdRestatement(question: Pick<Question, "title" | "sourceRefs">) {
  const refs = question.sourceRefs ?? [];
  if (!refs.some((ref) => ref.sourceKind === "jd") || refs.some((ref) => ref.sourceKind !== "jd")) return false;
  const title = compact(question.title).replace(/[“”"。.]/gu, "");
  return GENERIC_JD_OPENING.test(title) && GENERIC_JD_REQUEST.test(title);
}

export const isLegalRole = (role: string) => LEGAL_ROLE.test(compact(role));

export const isSituationalQuestion = (title: string) => SITUATIONAL_OPENING.test(compact(title));

export function questionCategoryCounts(questions: Array<Pick<Question, "category" | "kind">>) {
  return questions.reduce((counts, question) => {
    const category = question.category ?? (question.kind === "resume" ? "resume_deep_dive" : "role_capability");
    counts[category] += 1;
    return counts;
  }, { resume_deep_dive: 0, role_capability: 0 });
}

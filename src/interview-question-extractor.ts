const KEYCAP_MARKER = String.raw`[0-9](?:\u20E3\uFE0F?|\uFE0F\u20E3)`;
const CIRCLED_MARKER = String.raw`[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]`;
const STANDARD_MARKER = String.raw`(?:\d{1,2}|[一二三四五六七八九十]{1,3})[.、)）]`;
const ANY_MARKER_AT_START = new RegExp(`^(?:${KEYCAP_MARKER}|${CIRCLED_MARKER}|${STANDARD_MARKER})\\s*`, "u");
const STRONG_MARKER = new RegExp(`(${KEYCAP_MARKER}|${CIRCLED_MARKER})`, "gu");
const BOUNDED_STANDARD_MARKER = new RegExp(`(^|[\\s：:；;🌟⭐✨])(${STANDARD_MARKER})`, "gmu");

const QUESTION_START = /^(?:请|你(?:会|是|有|能|如何|怎么|为什么|认为|觉得)|如何|怎样|怎么|为什么|什么|是否|能否|有没有|谈谈|说说|介绍|讲(?:一|下|讲)|如果|假如|遇到|对.+(?:理解|看法))/;
const TERSE_PROMPT = /^(?:自我介绍|反问|职业规划|优缺点|离职原因|期望薪资|到岗时间|谈|讲|说|介绍|项目|实习|经历|失败|困难|挑战|冲突|压力|复盘|岗位理解|业务理解)/;
const QUESTION_END = /(?:[？?]|吗|呢|么)$/;
const NUMBERED_LABEL_PROMPT = /(?:原因|地址|情况|时间|日期|薪资|意向|看法|理解|规划|经历|介绍|反问|课程|论文|案件|事件|工作|职责|挑战|困难|项目|实习|优势|劣势|优点|缺点|爱好|兴趣|专业|成绩)$/;
const NUMBERED_QUESTION_SIGNAL = /(?:如何|怎么|为什么|什么|哪|是否|能否|有何|多少|几|原因|挑战|困难)/;
const NON_QUESTION_ITEM = /^(?:(?:面试)?(?:时间|地点|时长|轮次|结果|感受|流程|形式|平台|部门|岗位)\s*[:：]|建议|注意|提前|准备|复习|了解简历)/;
const ADVICE_SIGNAL = /(?:建议|提醒|同学|补课|提前准备|复习|仅供参考)/;
const TRAILING_COMMENTARY = /\s*[（(](?=[^）)]*(?:这个部分|面试官|考虑|经典|建议|要求|分钟|经验))[^）)]*[）)](?:\s*(?:经验|建议)\s*[:：]?)?\s*$/u;

/** Persisted with each source so stale zero-question records can be safely re-indexed. */
export const INTERVIEW_QUESTION_PARSER_VERSION = 2;

type Candidate = { text: string; numbered: boolean };

const splitCandidates = (content: string): Candidate[] => {
  const marked = content
    .replace(/[🌟⭐✨]/gu, "\n")
    .replace(STRONG_MARKER, "\n$1")
    .replace(BOUNDED_STANDARD_MARKER, "$1\n$2");

  return marked
    .split(/\r?\n|(?<=[？?])\s*/u)
    .map((raw) => {
      const line = raw.trim();
      const numbered = ANY_MARKER_AT_START.test(line);
      const text = line
        .replace(ANY_MARKER_AT_START, "")
        .replace(/^\s*[-*•·]\s*/, "")
        .replace(/^\s*[:：]\s*/, "")
        .replace(/\s*[🌟⭐✨]\s*$/u, "")
        .replace(TRAILING_COMMENTARY, "")
        .trim();
      return { text, numbered };
    })
    .filter((candidate) => Boolean(candidate.text));
};

const isQuestionLike = (text: string) => QUESTION_END.test(text) || QUESTION_START.test(text) || TERSE_PROMPT.test(text);

/** Extract conservative, source-verbatim interview prompts without inventing punctuation. */
export function extractInterviewQuestions(content: string) {
  const normalized = content.replace(/\u00a0/g, " ").trim();
  if (!normalized) return [];

  const candidates = splitCandidates(normalized);

  const questions = candidates
    .filter(({ text, numbered }) => {
      if (text.length < 2 || text.length > 140 || NON_QUESTION_ITEM.test(text)) return false;
      if (isQuestionLike(text)) return true;
      if (ADVICE_SIGNAL.test(text)) return false;
      return numbered && (NUMBERED_LABEL_PROMPT.test(text) || NUMBERED_QUESTION_SIGNAL.test(text));
    })
    .map(({ text }) => text);

  return [...new Set(questions)].slice(0, 12);
}

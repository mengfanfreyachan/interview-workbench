import type { AgentReachPayload, ExperienceSource, Question, QuestionSourceRef, QuestionJdRelevance, ResumeProbe } from "./types";
import { createExperienceTarget, sourceMatchesTarget } from "./target-scope";

const unique = (items: string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];

const questionFromImportedLine = (line: string) => {
  const cleaned = line.replace(/^\s*(?:[-*•]|\d+[.、)]?)\s*/, "").trim();
  return /[？?]$/.test(cleaned) || /^(?:请|你|如何|为什么|如果|讲|说说|介绍)/.test(cleaned)
    ? cleaned.replace(/[?]$/, "？")
    : "";
};

export function parseManualExperience(text: string) {
  return unique(text.split(/\r?\n/).map(questionFromImportedLine));
}

export function parseAgentReachPayload(raw: string) {
  let payload: AgentReachPayload;
  try {
    payload = JSON.parse(raw) as AgentReachPayload;
  } catch {
    throw new Error("不是有效 JSON。请导入 Agent Reach 的标准结果文件。");
  }
  if (!Array.isArray(payload.sources)) throw new Error("缺少 sources 数组，无法读取面经来源。");
  const questions = unique(payload.sources.flatMap((source) => source.questions ?? []));
  if (!questions.length) throw new Error("sources 中没有 questions，暂未生成可用题目。");
  const sourceCount = payload.sources.length;
  return { payload, questions, sourceCount };
}

export function sanitizePublicSourceUrl(rawUrl: string) {
  if (!rawUrl.trim()) return "";
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

const normalizeMaterialLine = (value: string) => value
  .replace(/^\s*(?:[-*•·◦▪]|\d+[.、)]?)\s*/, "")
  .replace(/\s+/g, " ")
  .trim();

const splitMaterialText = (text: string) => text
  .split(/\r?\n|(?<=[。；;])\s*/)
  .flatMap((line) => line.length <= 220
    ? [line]
    : line.split(/(?=(?:教育背景|实习经历|项目经历|工作经历|技能|语言能力|[^\s：:]{2,24}(?:公司|项目)\s*[·|｜]))/))
  .flatMap((line) => line.length <= 220 ? [line] : line.match(/.{1,200}(?:\s|$)/g) ?? [line]);

const materialStatements = (text: string, limit: number, kind: "jd" | "resume") => unique(splitMaterialText(text)
  .map(normalizeMaterialLine)
  .filter((line) => line.length >= 12 && line.length <= 220)
  .filter((line) => !/^(?:岗位职责|职位描述|岗位要求|任职要求|工作职责|教育背景|实习经历|项目经历|技能|语言与技能)[:：]?$/.test(line)))
  .filter((line) => kind !== "resume" || !/(?:项目负责人|负责人|实习生|经理|工程师|产品经理)\s*(?:20\d{2}[./年-]\d{1,2}[^\n]{0,12}|至今)$/.test(line) || /(?:负责(?:搭建|推动|设计|分析|建立|制定|审查|管理|协调)|参与(?:设计|审查|分析)|推动(?:项目|产品|方案)|完成(?:两|三|多|\d)|搭建(?:了|并)|提升(?:了|至))/ .test(line))
  .filter((line) => kind !== "resume" || !/(?:邮箱|手机|微信|@|电话|姓名)/.test(line))
  .filter((line) => kind !== "resume" || /(负责|参与|设计|推动|建立|分析|识别|优化|完成|协调|协同|落地|制定|搭建|验证|审查|研究|管理|支持|提升|降低|增长|减少|覆盖|实现|产出|上线|交付|节省|转化|留存|风险|\d+(?:\.\d+)?\s*(?:%|％|个|人|次|万|周|天|小时|百分点|元|美元|\$))/.test(line))
  .map((line, index) => {
    const actionSignals = line.match(/(负责|参与|设计|推动|建立|分析|识别|优化|完成|协调|协同|落地|制定|搭建|验证|审查|研究|管理|支持)/g)?.length ?? 0;
    const outcomeSignals = line.match(/(提升|降低|增长|减少|覆盖|实现|产出|结果|上线|交付|节省|转化|留存|风险)/g)?.length ?? 0;
    const metricSignals = line.match(/\d+(?:\.\d+)?\s*(?:%|％|个|人|次|万|周|天|小时|百分点|元|美元|\$)/g)?.length ?? 0;
    const requirementSignals = line.match(/(能力|经验|优先|要求|具备|熟悉|能够|职责|协作|沟通|分析|研究|推动|负责)/g)?.length ?? 0;
    const score = kind === "resume"
      ? actionSignals * 4 + outcomeSignals * 3 + metricSignals * 3
      : actionSignals * 3 + requirementSignals * 2 + outcomeSignals;
    return { line, index, score };
  })
  .sort((left, right) => right.score - left.score || left.index - right.index)
  .slice(0, limit)
  .sort((left, right) => left.index - right.index)
  .map((item) => item.line);

const compactExcerpt = (value: string, maximum = 82) => value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;

const sourceRef = (sourceId: string, sourceKind: QuestionSourceRef["sourceKind"], label: string, excerpt: string, locator?: string): QuestionSourceRef => ({
  sourceId,
  sourceKind,
  label,
  locator,
  excerpt: excerpt.trim(),
});

const RESUME_PROBE_COPY: Record<ResumeProbe, { intent: string; cues: string[] }> = {
  metric_validity: { intent: "核对结果的指标定义、基线与个人归因。", cues: ["指标如何定义", "基线与样本范围", "你的动作如何影响结果"] },
  personal_contribution: { intent: "厘清你亲自负责的动作、协作边界和可验证产出。", cues: ["你亲自做了什么", "与协作方的边界", "产出如何被核对"] },
  decision_reasoning: { intent: "追溯你为何采用这套方法，以及当时放弃了什么替代方案。", cues: ["当时依据是什么", "考虑过哪些替代方案", "如何验证选择"] },
  constraint_execution: { intent: "了解资源、时间或流程约束下，你如何把方案推进到可交付。", cues: ["最关键的约束", "你如何调整执行", "最终交付如何确认"] },
  tradeoff_or_failure: { intent: "检验经历中的风险、取舍或未达预期部分，以及你如何复盘。", cues: ["遇到的风险或不如预期之处", "当时做的取舍", "复盘后会怎么改"] },
  counterfactual: { intent: "通过改变一个关键条件，确认你对结果因果链的理解。", cues: ["哪个条件最关键", "如果取消该动作会怎样", "如何用证据验证因果"] },
};

const OUTCOME_METRIC_PATTERN = /(?:(?:提升|降低|增长|减少|下降|达到|由|至|提高|节省|覆盖).{0,18}\d+(?:\.\d+)?\s*(?:%|％|百分点|元|美元|\$)|\d+(?:\.\d+)?\s*(?:%|％|个百分点)\s*(?:提升|增长|下降|降低))/;
const EXPERIENCED_RISK_PATTERN = /(?:(?:遇到|面临|出现|发生|暴露|未能|未达|导致|造成).{0,12}(?:风险|问题|困难|冲突|分歧|失败)|(?:失败|未达预期|结果不及预期|流失|冲突|分歧|困难|挑战)|(?:复盘发现|仍然|不过|但是).{0,16}(?:繁琐|不足|问题|限制))/;

const resumeProbeFor = (claim: string, index: number): ResumeProbe => {
  if (OUTCOME_METRIC_PATTERN.test(claim)) return "metric_validity";
  if (EXPERIENCED_RISK_PATTERN.test(claim)) return "tradeoff_or_failure";
  if (/(?:方法|规则|策略|机制|流程|框架|模型|实验|A\/B|方案|通过)/.test(claim)) return "decision_reasoning";
  if (/(?:时间|周期|两周|一周|资源|预算|人手|限制|约束|从零)/.test(claim)) return "constraint_execution";
  if (/(?:负责|主导|推动|协作|协调|搭建|建立|落地|交付)/.test(claim)) return "personal_contribution";
  return index % 2 === 0 ? "personal_contribution" : "decision_reasoning";
};

const JD_ANCHORS = [
  "用户研究", "商业研究", "知识产权", "合同", "合规", "产品", "运营", "数据分析", "跨团队", "跨部门",
  "内容治理", "生成式AI", "生成式 AI", "人工智能", "A/B 测试", "A/B测试", "实验", "留存", "增长", "风险", "法律",
];

export const extractCapabilityAnchors = (text: string) => JD_ANCHORS.filter((anchor) => text.includes(anchor));

const relevanceScoreFor = (claim: string, jdText: string) => {
  if (!jdText.trim()) return 0;
  const shared = extractCapabilityAnchors(claim).filter((anchor) => jdText.includes(anchor));
  return shared.length * 12;
};

const relevanceFor = (claim: string, jdText: string): QuestionJdRelevance => relevanceScoreFor(claim, jdText) > 0 ? "jd_aligned" : "general_signal";

const resumeSignalScore = (claim: string) => {
  const actionSignals = claim.match(/(负责|参与|设计|推动|建立|分析|识别|优化|完成|协调|协同|落地|制定|搭建|验证|审查|研究|管理|支持)/g)?.length ?? 0;
  const outcomeSignals = claim.match(/(提升|降低|增长|减少|覆盖|实现|产出|结果|上线|交付|节省|转化|留存|风险)/g)?.length ?? 0;
  const metricSignals = claim.match(new RegExp(OUTCOME_METRIC_PATTERN.source, "g"))?.length ?? 0;
  return actionSignals * 4 + outcomeSignals * 3 + metricSignals * 3;
};

const nextProbe = (claim: string, index: number, used: Set<ResumeProbe>): ResumeProbe => {
  const preferred = resumeProbeFor(claim, index);
  // Outcome metrics and explicit risks retain priority; only less determinate claims
  // are redirected to a nearby cut when a previous card already used the probe.
  if ((preferred === "metric_validity" || preferred === "tradeoff_or_failure") && !used.has(preferred)) return preferred;
  const candidates: ResumeProbe[] = preferred === "personal_contribution"
    ? ["personal_contribution", "decision_reasoning", "constraint_execution", "counterfactual"]
    : preferred === "decision_reasoning"
      ? ["decision_reasoning", "personal_contribution", "constraint_execution", "counterfactual"]
      : preferred === "constraint_execution"
        ? ["constraint_execution", "personal_contribution", "decision_reasoning", "counterfactual"]
        : preferred === "counterfactual"
          ? ["counterfactual", "decision_reasoning", "personal_contribution"]
          : [preferred, "personal_contribution", "decision_reasoning", "constraint_execution", "counterfactual"];
  return candidates.find((probe) => !used.has(probe)) ?? preferred;
};

const questionAnchor = (claim: string, probe: ResumeProbe) => {
  const clauses = claim.split(/[。；;，]/).map((item) => item.trim()).filter((item) => item.length >= 4);
  const signal = probe === "metric_validity"
    ? OUTCOME_METRIC_PATTERN
    : probe === "personal_contribution"
      ? /(?:负责|主导|推动|协调|搭建|建立|落地|交付|参与)/
      : probe === "decision_reasoning"
        ? /(?:方法|规则|策略|机制|流程|框架|模型|实验|A\/B|方案|通过)/
        : probe === "constraint_execution"
          ? /(?:时间|周期|资源|预算|人手|限制|约束|从零)/
          : probe === "tradeoff_or_failure"
            ? EXPERIENCED_RISK_PATTERN
            : /(?:负责|主导|推动|设计|建立|分析|优化|完成|搭建)/;
  return compactExcerpt(clauses.find((item) => signal.test(item)) ?? clauses[0] ?? claim, 40);
};

const titleForProbe = (probe: ResumeProbe, excerpt: string) => probe === "metric_validity"
  ? `你在简历中写到“${excerpt}”，这个结果指标具体是怎么定义的？`
  : probe === "personal_contribution"
    ? `围绕“${excerpt}”，其中哪一步是你亲自决定并完成的？`
    : probe === "decision_reasoning"
      ? `“${excerpt}”中，你选择这套方法的关键依据是什么？`
      : probe === "constraint_execution"
        ? `“${excerpt}”中，最大的执行约束是什么？`
        : probe === "tradeoff_or_failure"
          ? `“${excerpt}”中，最关键的取舍是什么？`
          : `如果“${excerpt}”中的一个关键条件改变，结果会怎样？`;

export function buildResumeQuestions(input: { resumeText: string; jdText?: string }): Question[] {
  const jdText = input.jdText ?? "";
  const claims = materialStatements(input.resumeText, 20, "resume")
    .map((claim, index) => ({ claim, index, score: resumeSignalScore(claim) + relevanceScoreFor(claim, jdText) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 3);
  const used = new Set<ResumeProbe>();
  return claims.map(({ claim, index }) => {
    const primaryProbe = nextProbe(claim, index, used);
    used.add(primaryProbe);
    const copy = RESUME_PROBE_COPY[primaryProbe];
    return {
      id: `resume-${index + 1}`,
      kind: "resume" as const,
      category: "resume_deep_dive" as const,
      title: titleForProbe(primaryProbe, questionAnchor(claim, primaryProbe)),
      intent: copy.intent,
      cues: copy.cues,
      origin: "简历事实生成" as const,
      provenance: "source_derived" as const,
      sourceRefs: [sourceRef("CV-01", "resume", "当前简历", claim, `主张 ${index + 1}`)],
      primaryProbe,
      jdRelevance: relevanceFor(claim, jdText),
    };
  });
}

function importedQuestions(text: string, origin: Question["origin"], sources: ExperienceSource[]): Question[] {
  if (sources.length) {
    return sources.flatMap((source) => source.questions.map((title, index) => ({
      id: `imported-${source.id}-${index + 1}`,
      kind: "role" as const,
      category: "role_capability" as const,
      title,
      intent: "验证该岗位真实面试语境中的判断与表达。",
      cues: ["先给结论", "说明判断依据", "补充一个具体例子"],
      origin,
      provenance: "source_question" as const,
      sourceRefs: [sourceRef(source.id, "interview_experience", `${source.platform} · ${source.title}`, title, `问题 ${index + 1}`)],
      sourceId: source.id,
    }))).slice(0, 6);
  }
  return parseManualExperience(text).slice(0, 6).map((title, index) => ({
    id: `imported-${index + 1}`,
    kind: "role" as const,
    category: "role_capability" as const,
    title,
    intent: "验证该岗位真实面试语境中的判断与表达。",
    cues: ["先给结论", "说明判断依据", "补充一个具体例子"],
    origin,
    provenance: "source_question" as const,
    sourceRefs: [sourceRef("EXP-MANUAL", "interview_experience", "用户手动粘贴面经", title, `问题 ${index + 1}`)],
  }));
}

export function generateQuestionBanks(input: {
  company: string;
  role: string;
  jdText?: string;
  resumeText: string;
  experienceText: string;
  experienceOrigin: "manual" | "agent";
  experienceSources?: ExperienceSource[];
}): Question[] {
  const company = input.company.trim() || "目标公司";
  const role = input.role.trim() || "目标岗位";
  const jdRequirements = materialStatements(input.jdText ?? "", 4, "jd");
  const jdQuestions: Question[] = jdRequirements.slice(0, 3).map((requirement, index) => ({
    id: `jd-${index + 1}`,
    kind: "role",
    category: "role_capability",
    title: `JD 提到“${compactExcerpt(requirement)}”。请说明你会如何在实际工作中做到这一点？`,
    intent: "验证候选人是否理解该岗位要求背后的工作目标、方法和约束。",
    cues: ["先解释目标", "说明方法与取舍", "给出验证方式"],
    origin: "岗位推演",
    provenance: "source_derived",
    sourceRefs: [sourceRef("JD-01", "jd", "当前岗位 JD", requirement, `要求 ${index + 1}`)],
  }));

  const resumeQuestions = buildResumeQuestions({ resumeText: input.resumeText, jdText: input.jdText });

  const imported = importedQuestions(
    input.experienceText,
    input.experienceOrigin === "agent" ? "Agent Reach 导入" : "用户导入面经",
    (input.experienceSources ?? []).filter((source) => sourceMatchesTarget(source, createExperienceTarget(company, role))),
  );
  return [...jdQuestions, ...resumeQuestions, ...imported];
}

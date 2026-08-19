import type { DeepSeekQuestionComposition } from "../deepseek-interview-bridge";
import { hasSingleQuestionFocus, isGenericJdRestatement, isLegalRole, isSituationalQuestion, questionCategoryCounts } from "./question-composition-quality";
import type { QuestionCompositionGoldenCase } from "./test/fixtures/question-composition-golden";

export type RubricStatus = "pass" | "warn" | "fail";

export type RubricResult = {
  id: string;
  label: string;
  status: RubricStatus;
  detail: string;
};

export type SanitizedObservedQuestion = {
  index: number;
  title: string;
  category: string;
  provenance: string;
  sourceKinds: string[];
  sourceIds: string[];
  quotedSourceCount: number;
};

export type ManualReview = {
  status: "pending" | "pass" | "warn" | "fail";
  roleRelevance: string;
  questionDepth: string;
  coverageBalance: string;
  notes: string;
};

export type CompositionCaseObservation = {
  caseId: string;
  label: string;
  targetRole: string;
  inputFingerprint: string;
  attemptedAt: string;
  callStatus: "completed" | "failed";
  model: string;
  questionCount: number;
  warningCodes: string[];
  machineStatus: RubricStatus;
  rubric: RubricResult[];
  questions: SanitizedObservedQuestion[];
  manualReview: ManualReview;
  error?: { code: string; message: string };
};

export type CompositionObservationReport = {
  schemaVersion: "interview.question-composition-observation.v1";
  generatedAt: string;
  runPolicy: {
    liveCalls: true;
    attemptsPerCase: 1;
    retries: false;
    storesRawMaterials: false;
    storesRawModelResponse: false;
  };
  cases: CompositionCaseObservation[];
};

export type CompositionQualitySummary = {
  questionCount: number;
  genericJdCount: number;
  singleFocusIssueCount: number;
  resumeQuestionCount: number;
  roleQuestionCount: number;
  categoryDifference: number;
  legalGeneratedScenarioCount: number;
};

export const COMPOSITION_OBSERVATION_RUBRIC = [
  { id: "bounded_output", label: "题目数量保持在 1–12 道" },
  { id: "source_integrity", label: "来源 ID、类型与引文可核验" },
  { id: "provenance_integrity", label: "真题与模型衍生题来源标记正确" },
  { id: "source_question_fidelity", label: "保留的面经原题逐字一致" },
  { id: "target_isolation", label: "只引用当前岗位材料" },
  { id: "deduplication", label: "题目不重复" },
  { id: "single_focus", label: "每道题保持单一问题" },
  { id: "non_template_jd", label: "不使用模板式 JD 复述题" },
  { id: "category_coverage", label: "简历题和专业／JD 题均有覆盖" },
  { id: "category_balance", label: "两类题数量差不超过 2 道" },
  { id: "legal_scenario_coverage", label: "法务岗位包含至少 2 道模型情境题" },
  { id: "partial_success", label: "单题失败不清空有效结果" },
] as const;

const normalizeEvidenceText = (value: string) => value
  .normalize("NFKC")
  .replace(/\s+/gu, "")
  .replace(/[，。；：、！？,.!?;:'"“”‘’（）()\[\]【】《》〈〉—–-]/gu, "");

const worstStatus = (items: RubricResult[]): RubricStatus => items.some((item) => item.status === "fail")
  ? "fail"
  : items.some((item) => item.status === "warn") ? "warn" : "pass";

export function summarizeCompositionQuality(item: Pick<CompositionCaseObservation, "targetRole" | "questions">): CompositionQualitySummary {
  const questions = item.questions.map((question) => ({
    title: question.title,
    category: question.category === "resume_deep_dive" ? "resume_deep_dive" as const : "role_capability" as const,
    kind: question.category === "resume_deep_dive" ? "resume" as const : "role" as const,
    provenance: question.provenance,
    sourceRefs: question.sourceKinds.map((sourceKind, index) => ({
      sourceKind: sourceKind as "jd" | "resume" | "interview_experience",
      sourceId: question.sourceIds[index] ?? question.sourceIds[0] ?? "unknown",
      label: "脱敏来源",
    })),
  }));
  const counts = questionCategoryCounts(questions);
  return {
    questionCount: questions.length,
    genericJdCount: questions.filter(isGenericJdRestatement).length,
    singleFocusIssueCount: questions.filter((question) => question.provenance !== "source_question" && !hasSingleQuestionFocus(question.title)).length,
    resumeQuestionCount: counts.resume_deep_dive,
    roleQuestionCount: counts.role_capability,
    categoryDifference: Math.abs(counts.resume_deep_dive - counts.role_capability),
    legalGeneratedScenarioCount: isLegalRole(item.targetRole)
      ? questions.filter((question) => question.provenance === "coach_generated" && question.category === "role_capability" && isSituationalQuestion(question.title)).length
      : 0,
  };
}

const delta = (before: number, after: number) => after === before ? "0" : after > before ? `+${after - before}` : `${after - before}`;

export function renderCompositionObservationComparisonMarkdown(
  baseline: CompositionObservationReport,
  current: CompositionObservationReport,
) {
  const baselineCases = new Map(baseline.cases.map((item) => [item.caseId, item]));
  const lines = [
    "---",
    `date: ${current.generatedAt.slice(0, 10)}`,
    "status: comparison",
    "schema: interview.question-composition-observation-comparison.v1",
    "---",
    "",
    "# DeepSeek 组题 Golden Cases 观察对比",
    "",
    `- 基线生成时间：${baseline.generatedAt}`,
    `- 本轮生成时间：${current.generatedAt}`,
    "- 口径：每类每轮只调用一次；负数表示问题数量下降，不代表对模型输出择优。",
    "",
    "| 案例 | 有效题 V1→V2 | 模板 JD V1→V2 | 多焦点 V1→V2 | 类别差 V1→V2 | 法务模型情境题 V1→V2 |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const item of current.cases) {
    const previous = baselineCases.get(item.caseId);
    if (!previous) continue;
    const before = summarizeCompositionQuality(previous);
    const after = summarizeCompositionQuality(item);
    lines.push(`| ${item.label} | ${before.questionCount}→${after.questionCount} (${delta(before.questionCount, after.questionCount)}) | ${before.genericJdCount}→${after.genericJdCount} (${delta(before.genericJdCount, after.genericJdCount)}) | ${before.singleFocusIssueCount}→${after.singleFocusIssueCount} (${delta(before.singleFocusIssueCount, after.singleFocusIssueCount)}) | ${before.categoryDifference}→${after.categoryDifference} (${delta(before.categoryDifference, after.categoryDifference)}) | ${before.legalGeneratedScenarioCount}→${after.legalGeneratedScenarioCount} (${delta(before.legalGeneratedScenarioCount, after.legalGeneratedScenarioCount)}) |`);
  }
  lines.push(
    "",
    "> 对比文件只读取两轮脱敏 JSON 中的题目标题、类别、来源类型和 provenance；不包含 API Key、完整材料或原始模型响应。",
  );
  return `${lines.join("\n")}\n`;
}

export function evaluateCompositionObservation(
  golden: QuestionCompositionGoldenCase,
  result: DeepSeekQuestionComposition,
): Pick<CompositionCaseObservation, "machineStatus" | "rubric" | "questions" | "warningCodes" | "questionCount"> {
  const validSources = new Map<string, { kind: string; text: string }>([
    ["JD-01", { kind: "jd", text: golden.jdText }],
    ["CV-01", { kind: "resume", text: golden.resumeText }],
    [golden.source.id, { kind: "interview_experience", text: [...golden.source.questions, golden.source.excerpt].join("\n") }],
  ]);
  const sourceQuestionSet = new Set(golden.source.questions);
  const normalizedTitles = result.questions.map((question) => normalizeEvidenceText(question.title));
  const sourceIntegrity = result.questions.every((question) => question.sourceRefs?.length && question.sourceRefs.every((ref) => {
    const source = validSources.get(ref.sourceId);
    if (!source || source.kind !== ref.sourceKind) return false;
    return !ref.excerpt || normalizeEvidenceText(source.text).includes(normalizeEvidenceText(ref.excerpt));
  }));
  const sourceQuestions = result.questions.filter((question) => question.provenance === "source_question");
  const sourceQuestionFidelity = sourceQuestions.every((question) => sourceQuestionSet.has(question.title)
    && question.sourceRefs?.some((ref) => ref.sourceId === golden.source.id && ref.sourceKind === "interview_experience"));
  const provenanceIntegrity = result.questions.every((question) => question.provenance === "source_question"
    ? sourceQuestionSet.has(question.title)
    : question.provenance === "source_derived" || question.provenance === "coach_generated");
  const singleFocusFailures = result.questions.filter((question) => question.provenance !== "source_question" && !hasSingleQuestionFocus(question.title)).length;
  const genericJdQuestions = result.questions.filter(isGenericJdRestatement).length;
  const categories = new Set(result.questions.map((question) => question.category));
  const categoryCounts = questionCategoryCounts(result.questions);
  const categoryDifference = Math.abs(categoryCounts.resume_deep_dive - categoryCounts.role_capability);
  const legalScenarioCount = result.questions.filter((question) => question.provenance === "coach_generated"
    && question.category === "role_capability" && isSituationalQuestion(question.title)).length;
  const warningCodes = result.warnings.map((warning) => warning.code);
  const rubric: RubricResult[] = [
    { id: "bounded_output", label: "题目数量保持在 1–12 道", status: result.questions.length >= 1 && result.questions.length <= 12 ? "pass" : "fail", detail: `有效题目 ${result.questions.length} 道。` },
    { id: "source_integrity", label: "来源 ID、类型与引文可核验", status: sourceIntegrity ? "pass" : "fail", detail: sourceIntegrity ? "全部题目来源通过脱敏报告复核。" : "至少一道题存在无效来源或无法核验的引文。" },
    { id: "provenance_integrity", label: "真题与模型衍生题来源标记正确", status: provenanceIntegrity ? "pass" : "fail", detail: provenanceIntegrity ? "来源标记符合协议。" : "存在真题伪装或未知 provenance。" },
    { id: "source_question_fidelity", label: "保留的面经原题逐字一致", status: sourceQuestionFidelity ? (sourceQuestions.length ? "pass" : "warn") : "fail", detail: sourceQuestions.length ? `逐字保留 ${sourceQuestions.length} 道面经原题。` : "本次未精选面经原题，但没有改写或伪装。" },
    { id: "target_isolation", label: "只引用当前岗位材料", status: result.questions.every((question) => question.sourceRefs?.every((ref) => validSources.has(ref.sourceId))) ? "pass" : "fail", detail: "仅允许 JD-01、CV-01 和当前岗位面经来源 ID。" },
    { id: "deduplication", label: "题目不重复", status: new Set(normalizedTitles).size === normalizedTitles.length ? "pass" : "fail", detail: `发现 ${normalizedTitles.length - new Set(normalizedTitles).size} 道归一化重复题。` },
    { id: "single_focus", label: "每道题保持单一问题", status: singleFocusFailures ? "warn" : "pass", detail: singleFocusFailures ? `${singleFocusFailures} 道题需要人工检查是否包含多重追问。` : "未发现多问句或明显并列追问。" },
    { id: "non_template_jd", label: "不使用模板式 JD 复述题", status: genericJdQuestions ? "warn" : "pass", detail: genericJdQuestions ? `发现 ${genericJdQuestions} 道模板式 JD 复述题。` : "未发现通用“JD 提到……如何做到”题。" },
    { id: "category_coverage", label: "简历题和专业／JD 题均有覆盖", status: categories.has("resume_deep_dive") && categories.has("role_capability") ? "pass" : "warn", detail: `本次覆盖：${[...categories].join("、") || "无"}。` },
    { id: "category_balance", label: "两类题数量差不超过 2 道", status: categories.size >= 2 && categoryDifference <= 2 ? "pass" : "warn", detail: `简历题 ${categoryCounts.resume_deep_dive} 道，岗位能力题 ${categoryCounts.role_capability} 道，数量差 ${categoryDifference} 道。` },
    { id: "legal_scenario_coverage", label: "法务岗位包含至少 2 道模型情境题", status: !isLegalRole(golden.target.role) || legalScenarioCount >= 2 ? "pass" : "warn", detail: isLegalRole(golden.target.role) ? `模型生成的法务情境题 ${legalScenarioCount} 道。` : "非法律岗位，不适用。" },
    { id: "partial_success", label: "单题失败不清空有效结果", status: result.questions.length ? "pass" : "fail", detail: warningCodes.length ? `保留有效题，并记录 ${warningCodes.length} 条 warning。` : "本次没有服务端跳过项。" },
  ];
  const questions: SanitizedObservedQuestion[] = result.questions.map((question, index) => ({
    index: index + 1,
    title: question.title,
    category: question.category ?? question.kind,
    provenance: question.provenance ?? "unknown",
    sourceKinds: [...new Set(question.sourceRefs?.map((ref) => ref.sourceKind) ?? [])],
    sourceIds: [...new Set(question.sourceRefs?.map((ref) => ref.sourceId) ?? [])],
    quotedSourceCount: question.sourceRefs?.filter((ref) => Boolean(ref.excerpt)).length ?? 0,
  }));
  return { machineStatus: worstStatus(rubric), rubric, questions, warningCodes, questionCount: result.questions.length };
}

const statusLabel = (status: RubricStatus | ManualReview["status"]) => status === "pass" ? "通过" : status === "warn" ? "需关注" : status === "fail" ? "失败" : "待人工审阅";

export function renderCompositionObservationMarkdown(report: CompositionObservationReport) {
  const lines = [
    "---",
    `date: ${report.generatedAt.slice(0, 10)}`,
    "status: observation",
    "schema: interview.question-composition-observation.v1",
    "---",
    "",
    "# DeepSeek 三类组题 Golden Case 受控观察",
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "> 本报告仅包含虚构岗位、题目标题、来源 ID／类型、计数与 Rubric 结论；不包含 API Key、完整 JD、完整简历、完整面经正文或原始模型响应。每类只调用一次，不重试、不择优。",
    "",
    "## 汇总",
    "",
    "| 案例 | 调用 | 模型 | 有效题 | warnings | 机器门禁 | 人工审阅 |",
    "|---|---|---|---:|---:|---|---|",
    ...report.cases.map((item) => `| ${item.label} | ${item.callStatus === "completed" ? "完成" : "失败"} | ${item.model || "未获得"} | ${item.questionCount} | ${item.warningCodes.length} | ${statusLabel(item.machineStatus)} | ${statusLabel(item.manualReview.status)} |`),
    "",
    "## 统一 Rubric",
    "",
    "| ID | 检查项 |",
    "|---|---|",
    ...COMPOSITION_OBSERVATION_RUBRIC.map((item) => `| ${item.id} | ${item.label} |`),
  ];
  for (const item of report.cases) {
    lines.push(
      "",
      `## ${item.label}`,
      "",
      `- 岗位：${item.targetRole}`,
      `- 输入指纹：\`${item.inputFingerprint}\``,
      `- 调用状态：${item.callStatus}`,
      `- 模型：${item.model || "未获得"}`,
    );
    if (item.error) {
      lines.push(`- 安全错误：${item.error.code} · ${item.error.message}`);
      continue;
    }
    lines.push("", "### 机器检查", "", "| 检查项 | 状态 | 结果 |", "|---|---|---|", ...item.rubric.map((rubric) => `| ${rubric.label} | ${statusLabel(rubric.status)} | ${rubric.detail} |`));
    lines.push("", "### 脱敏题目清单", "", "| # | 类别 | 来源 | 来源 ID | 引文数 | 题目 |", "|---:|---|---|---|---:|---|");
    for (const question of item.questions) {
      lines.push(`| ${question.index} | ${question.category} | ${question.provenance} | ${question.sourceIds.join("、")} | ${question.quotedSourceCount} | ${question.title.replace(/\|/g, "／")} |`);
    }
    lines.push(
      "",
      "### 人工审阅",
      "",
      `- 状态：${statusLabel(item.manualReview.status)}`,
      `- 岗位相关性：${item.manualReview.roleRelevance}`,
      `- 深挖价值：${item.manualReview.questionDepth}`,
      `- 覆盖平衡：${item.manualReview.coverageBalance}`,
      `- 备注：${item.manualReview.notes}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

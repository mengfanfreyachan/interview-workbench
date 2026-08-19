import type { DeepSeekQuestionCompositionResponse } from "./types";

type CompositionWarning = NonNullable<DeepSeekQuestionCompositionResponse["warnings"]>[number];

export type CompositionWarningCategory = "template" | "duplicate" | "multi_focus" | "source" | "balance" | "other";

export type CompositionWarningSummary = {
  acceptedCount: number;
  skippedCount: number;
  items: Array<{ category: CompositionWarningCategory; label: string; count: number }>;
};

const WARNING_CATEGORY_BY_CODE: Record<string, CompositionWarningCategory> = {
  GENERIC_JD_RESTATEMENT: "template",
  DUPLICATE_CANDIDATE_ID: "duplicate",
  DUPLICATE_QUESTION_TITLE: "duplicate",
  MULTI_FOCUS_QUESTION: "multi_focus",
  INVALID_SOURCE_ID: "source",
  UNVERIFIABLE_QUOTE: "source",
  SOURCE_QUOTE_MISMATCH: "source",
  MISSING_SOURCE: "source",
  RESUME_SOURCE_REQUIRED: "source",
  SOURCE_QUESTION_IMPERSONATION: "source",
  CATEGORY_BALANCE_LIMIT: "balance",
};

const WARNING_COPY: Record<CompositionWarningCategory, string> = {
  template: "模板式 JD 题",
  duplicate: "重复题",
  multi_focus: "包含多个问题的题",
  source: "来源或引文无法核验的题",
  balance: "为保持两类题配比而移除的题",
  other: "其他未通过质量检查的题",
};

const CATEGORY_ORDER: CompositionWarningCategory[] = ["template", "duplicate", "multi_focus", "source", "balance", "other"];

export const classifyCompositionWarning = (warning: CompositionWarning): CompositionWarningCategory => WARNING_CATEGORY_BY_CODE[warning.code] ?? "other";

export function summarizeCompositionWarnings(warnings: CompositionWarning[] | undefined, acceptedCount: number): CompositionWarningSummary | null {
  if (!warnings?.length) return null;
  const counts = warnings.reduce<Record<CompositionWarningCategory, number>>((result, warning) => {
    result[classifyCompositionWarning(warning)] += 1;
    return result;
  }, { template: 0, duplicate: 0, multi_focus: 0, source: 0, balance: 0, other: 0 });
  const items = CATEGORY_ORDER
    .filter((category) => counts[category] > 0)
    .map((category) => ({ category, label: WARNING_COPY[category], count: counts[category] }));
  return { acceptedCount, skippedCount: warnings.length, items };
}

export function formatCompositionWarnings(warnings: CompositionWarning[] | undefined) {
  const summary = summarizeCompositionWarnings(warnings, 0);
  if (!summary) return "";
  const details = summary.items.map((item) => `${item.label} ${item.count} 道`).join("、");
  return `已安全跳过 ${summary.skippedCount} 道：${details}。现有有效题目不受影响。`;
}

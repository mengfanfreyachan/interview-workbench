import { describe, expect, it } from "vitest";
import { classifyCompositionWarning, formatCompositionWarnings, summarizeCompositionWarnings } from "./question-composition-warning";

const warning = (code: string, itemIndex = 1) => ({ scope: "generated_question" as const, itemIndex, code, message: "安全测试消息" });

describe("question composition warning copy", () => {
  it("把模板、重复、多焦点和来源问题按固定顺序聚合", () => {
    const message = formatCompositionWarnings([
      warning("SOURCE_QUOTE_MISMATCH", 1),
      warning("DUPLICATE_QUESTION_TITLE", 2),
      warning("GENERIC_JD_RESTATEMENT", 3),
      warning("MULTI_FOCUS_QUESTION", 4),
      warning("UNVERIFIABLE_QUOTE", 5),
    ]);
    expect(message).toBe("已安全跳过 5 道：模板式 JD 题 1 道、重复题 1 道、包含多个问题的题 1 道、来源或引文无法核验的题 2 道。现有有效题目不受影响。");
  });

  it("把配比和未知 code 保守归入独立类别", () => {
    expect(classifyCompositionWarning(warning("CATEGORY_BALANCE_LIMIT"))).toBe("balance");
    expect(classifyCompositionWarning(warning("FUTURE_SAFE_CODE"))).toBe("other");
    expect(formatCompositionWarnings([])).toBe("");
  });

  it("为页面生成有效题数、跳过总数和可扫读分类", () => {
    expect(summarizeCompositionWarnings([
      warning("GENERIC_JD_RESTATEMENT"),
      warning("DUPLICATE_QUESTION_TITLE", 2),
    ], 7)).toEqual({
      acceptedCount: 7,
      skippedCount: 2,
      items: [
        { category: "template", label: "模板式 JD 题", count: 1 },
        { category: "duplicate", label: "重复题", count: 1 },
      ],
    });
  });
});

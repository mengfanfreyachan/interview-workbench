import { describe, expect, it } from "vitest";
import { buildAgentSearchQuery, buildDeepCollectionQueries } from "./search-strategy";

describe("buildAgentSearchQuery", () => {
  it("保留完整岗位名进行精确搜索", () => {
    expect(buildAgentSearchQuery(" 字节跳动 ", "豆包大模型产品经理（商业化方向）", "exact"))
      .toBe("字节跳动 豆包大模型产品经理（商业化方向） 面经");
  });

  it("把大模型产品岗放宽为 AI 产品经理，但不移除公司", () => {
    expect(buildAgentSearchQuery("字节跳动", "豆包大模型产品经理（商业化方向）", "fuzzy"))
      .toBe("字节跳动 AI 产品经理 面经");
  });

  it("移除招聘批次和职级噪声后归入岗位族", () => {
    expect(buildAgentSearchQuery("美团", "2026 届暑期产品运营实习生", "fuzzy"))
      .toBe("美团 产品运营 面经");
  });

  it("法务相关岗位统一到法务岗位族", () => {
    expect(buildAgentSearchQuery("字节跳动", "国际化商业产品法律顾问", "fuzzy"))
      .toBe("字节跳动 法务 面经");
  });

  it("无法归类时仍保留清理后的岗位文字", () => {
    expect(buildAgentSearchQuery("某公司", "高级战略分析实习生（北京）", "fuzzy"))
      .toBe("某公司 战略分析 面经");
  });
});

describe("buildDeepCollectionQueries", () => {
  it("keeps the edited seed first and expands to exact, fuzzy, interview, and round terms without duplicates", () => {
    const queries = buildDeepCollectionQueries("字节 豆包 PM 面经", "字节跳动", "豆包大模型产品经理（商业化方向）");
    expect(queries[0]).toBe("字节 豆包 PM 面经");
    expect(queries).toContain("字节跳动 豆包大模型产品经理（商业化方向） 面经");
    expect(queries).toContain("字节跳动 AI 产品经理 面经");
    expect(queries.some((query) => query.includes("面试题"))).toBe(true);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries.length).toBeLessThanOrEqual(6);
  });
});

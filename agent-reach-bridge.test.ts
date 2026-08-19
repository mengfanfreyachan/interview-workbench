import { describe, expect, it, vi } from "vitest";
import {
  createXiaohongshuCollector,
  createXiaohongshuSourceReindexer,
  parseNoteFields,
  parseSearchResults,
  redactTransientSecrets,
  sanitizeSourceUrl,
  validateCollectionInput,
  validateSourceReindexInput,
} from "./agent-reach-bridge";

describe("local Agent Reach bridge", () => {
  it("validates the bounded request", () => {
    expect(validateCollectionInput({ query: "字节 产品经理 面经", limit: 3 })).toMatchObject({ query: "字节 产品经理 面经", limit: 3 });
    expect(() => validateCollectionInput({ query: "x", limit: 3 })).toThrow("至少需要 2 个字符");
    expect(() => validateCollectionInput({ query: "正常搜索", limit: 21 })).toThrow("1 到 20");
  });

  it("parses confirmed OpenCLI formats and strips all URL parameters", () => {
    const url = "https://www.xiaohongshu.com/explore/abc?xsec_token=secret&source=web#part";
    expect(parseSearchResults(JSON.stringify([{ rank: 1, title: "一面复盘", url }]))).toEqual([{ title: "一面复盘", url }]);
    expect(parseNoteFields(JSON.stringify([{ field: "title", value: "一面复盘" }, { field: "content", value: "你会如何分析留存下降？" }]))).toMatchObject({ title: "一面复盘", content: "你会如何分析留存下降？" });
    expect(sanitizeSourceUrl(url)).toBe("https://www.xiaohongshu.com/explore/abc");
    expect(redactTransientSecrets(`failed: ${url}`)).not.toContain("secret");
  });

  it("validates and rereads only bounded trusted Xiaohongshu sources", async () => {
    expect(() => validateSourceReindexInput({ sources: [{ title: "外站", url: "https://example.com/note" }] })).toThrow("可信的小红书链接");
    const run = vi.fn(async () => JSON.stringify([
      { field: "title", value: "字节法务面经" },
      { field: "content", value: "面试问题：1⃣️如何看待和应对法务实习中的基础性工作 2⃣️谈仅退款规则的理解" },
    ]));
    const reindex = createXiaohongshuSourceReindexer({ run, wait: async () => undefined, now: () => new Date("2026-08-18T12:00:00.000Z") });
    const payload = await reindex({ sources: [{ title: "旧标题", url: "https://www.xiaohongshu.com/search_result/note-id?xsec_token=secret" }] });
    expect(run).toHaveBeenCalledWith(["xiaohongshu", "note", "https://www.xiaohongshu.com/search_result/note-id", "-f", "json"], 30_000);
    expect(payload.sources[0]).toMatchObject({ title: "字节法务面经", questionParserVersion: 2 });
    expect(payload.sources[0].questions).toHaveLength(2);
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("runs a multi-query plan, deduplicates across rounds, and returns explainable coverage", async () => {
    const tokenized = "https://www.xiaohongshu.com/explore/abc?xsec_token=top-secret";
    const calls: readonly string[][] = [];
    const run = vi.fn(async (args: readonly string[]) => {
      (calls as string[][]).push([...args]);
      if (args[1] === "search") return JSON.stringify([{ title: "复盘 A", url: tokenized }, { title: "复盘 B", url: tokenized.replace("abc", "def") }]);
      return JSON.stringify([{ field: "content", value: "面试问题\n你如何判断功能价值？\n现场氛围友好" }]);
    });
    const wait = vi.fn(async () => undefined);
    const collect = createXiaohongshuCollector({ run, wait, now: () => new Date("2026-08-10T12:00:00.000Z") });
    const payload = await collect({ query: "某公司 产品经理 面经", limit: 20, company: "某公司", role: "产品经理" });

    expect(calls[0]).toEqual(["xiaohongshu", "search", "某公司 产品经理 面经", "-f", "json"]);
    expect(calls.filter((args) => args[1] === "search")).toHaveLength(4);
    expect(calls.find((args) => args[1] === "note")).toEqual(["xiaohongshu", "note", tokenized, "-f", "json"]);
    expect(wait).toHaveBeenCalledWith(2000);
    expect(payload.sources).toHaveLength(2);
    expect(JSON.stringify(payload)).not.toContain("top-secret");
    expect(payload.sources[0].questions).toEqual(["你如何判断功能价值？"]);
    expect(payload.coverage.stopReason).toBe("saturated");
    expect(payload.coverage.queries.map((item) => item.newUniqueCount)).toEqual([2, 0, 0, 0]);
    expect(payload.stats).toMatchObject({ queryExecutedCount: 4, searchHitCount: 8, uniqueHitCount: 2, duplicateHitCount: 6, bodyReadCount: 2, questionSourceCount: 2, questionCount: 2, failureCount: 0 });
  });

  it("skips existing sources and keeps successful new sources when one note fails", async () => {
    let note = 0;
    const collect = createXiaohongshuCollector({
      run: async (args) => {
        if (args[1] === "search") return JSON.stringify([
          { title: "已有来源", url: "https://www.xiaohongshu.com/explore/a?xsec_token=one" },
          { title: "可读", url: "https://www.xiaohongshu.com/explore/b?xsec_token=two" },
          { title: "不可读", url: "https://www.xiaohongshu.com/explore/c?xsec_token=three" },
        ]);
        note += 1;
        if (note === 2) throw new Error("当前账号无权读取");
        return JSON.stringify([{ field: "content", value: "这篇只有短摘录，没有明确问题。" }]);
      },
      wait: async () => undefined,
    });
    const payload = await collect({
      query: "运营 面经",
      limit: 20,
      company: "某公司",
      role: "用户运营实习生",
      existingUrls: ["https://www.xiaohongshu.com/explore/a"],
    });
    expect(payload.sources).toHaveLength(1);
    expect(payload.stats.existingSkippedCount).toBe(1);
    expect(payload.failures).toEqual([{ title: "不可读", reason: "当前账号无权读取" }]);
  });

  it("keeps a readable source with zero extracted questions without calling it a question-bearing source", async () => {
    const collect = createXiaohongshuCollector({
      run: async (args) => args[1] === "search"
        ? JSON.stringify([{ title: "可读", url: "https://www.xiaohongshu.com/explore/readable?xsec_token=one" }])
        : JSON.stringify([{ field: "content", value: "这篇只有短摘录，没有明确问题。" }]),
      wait: async () => undefined,
    });
    const payload = await collect({ query: "运营 面经", limit: 20 });
    expect(payload.sources).toHaveLength(1);
    expect(payload.sources[0].questions).toEqual([]);
    expect(payload.sources[0].excerpts[0]).toContain("只有短摘录");
    expect(payload.stats).toMatchObject({ bodyReadCount: 1, questionSourceCount: 0, questionCount: 0, failureCount: 0 });
  });
});

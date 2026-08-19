import { describe, expect, it } from "vitest";
import { createExperienceTarget, createTargetKey, deduplicateSources, deriveExperienceLibraries, partitionSourcesByTarget, upsertExperienceLibrary } from "./target-scope";
import type { ExperienceDraft, ExperienceSource } from "./types";

const source = (id: string, title: string, company?: string, role?: string): ExperienceSource => ({
  id,
  title,
  platform: "小红书",
  url: `https://www.xiaohongshu.com/explore/${id}`,
  capturedAt: "2026-08-11",
  excerpt: "",
  questions: [`${title}问题？`],
  importMethod: "agent-reach",
  target: company && role ? createExperienceTarget(company, role) : undefined,
});

describe("target scoping", () => {
  it("normalizes harmless whitespace when building a target key", () => {
    expect(createTargetKey(" 字节跳动 ", "法务  实习生")).toBe(createTargetKey("字节跳动", "法务 实习生"));
  });

  it("partitions current, other and legacy-unassigned sources", () => {
    const target = createExperienceTarget("字节跳动", "法务");
    const result = partitionSourcesByTarget([
      source("legal", "法务", "字节跳动", "法务"),
      source("ops", "运营", "字节跳动", "产品运营"),
      source("legacy", "旧数据"),
    ], target);
    expect(result.current.map((item) => item.id)).toEqual(["legal"]);
    expect(result.other.map((item) => item.id)).toEqual(["ops"]);
    expect(result.unassigned.map((item) => item.id)).toEqual(["legacy"]);
  });

  it("deduplicates only within the same target", () => {
    const legal = source("legal-1", "同名", "字节跳动", "法务");
    const legalDuplicate = { ...legal, id: "legal-2" };
    const ops = source("ops", "同名", "字节跳动", "产品运营");
    expect(deduplicateSources([legal, legalDuplicate, ops])).toHaveLength(2);
  });

  it("merges duplicate URLs with different titles and keeps the richer question record", () => {
    const target = createExperienceTarget("字节跳动", "法务");
    const older = { ...source("same-note", "旧标题", target.company, target.role), id: "stable-id", questions: [], excerpt: "短摘要" };
    const richer = { ...source("same-note", "更新标题", target.company, target.role), id: "new-id", questions: ["如何看待基础性工作？", "谈仅退款规则的理解"], excerpt: "更完整的摘要", questionParserVersion: 2 };
    const merged = deduplicateSources([older, richer]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "stable-id", title: "更新标题", questionParserVersion: 2 });
    expect(merged[0].questions).toHaveLength(2);
  });

  it("keeps a library's creation time while updating its latest activity", () => {
    const target = createExperienceTarget("字节跳动", "法务");
    const created = upsertExperienceLibrary({}, target, "2026-08-10T10:00:00.000Z");
    const updated = upsertExperienceLibrary(created, target, "2026-08-11T10:00:00.000Z");
    expect(updated[target.key]?.createdAt).toBe("2026-08-10T10:00:00.000Z");
    expect(updated[target.key]?.updatedAt).toBe("2026-08-11T10:00:00.000Z");
  });

  it("derives one history entry per scoped target and ignores unassigned sources", () => {
    const legal = createExperienceTarget("字节跳动", "法务");
    const ops = createExperienceTarget("字节跳动", "产品运营");
    const drafts: Record<string, ExperienceDraft> = {
      [ops.key]: { target: ops, text: "运营面经", origin: "manual" },
    };
    const libraries = deriveExperienceLibraries([
      source("legal-1", "法务一", legal.company, legal.role),
      source("legal-2", "法务二", legal.company, legal.role),
      source("legacy", "未归类"),
    ], drafts, "2026-08-11T10:00:00.000Z");
    expect(Object.keys(libraries)).toEqual([legal.key, ops.key]);
  });
});

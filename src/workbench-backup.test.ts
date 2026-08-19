import { describe, expect, it } from "vitest";
import { createExperienceTarget } from "./target-scope";
import type { ExperienceSource, WorkbenchState } from "./types";
import { createWorkbenchBackup, parseWorkbenchBackupText, serializeWorkbenchBackup, summarizeWorkbenchBackup } from "./workbench-backup";

const legal = createExperienceTarget("字节跳动", "法务");
const operations = createExperienceTarget("字节跳动", "产品运营");
const source: ExperienceSource = {
  id: "source-1",
  title: "法务面经",
  platform: "小红书",
  url: "https://www.xiaohongshu.com/explore/source-1",
  capturedAt: "2026-08-13",
  excerpt: "合同审查与业务合规",
  questions: ["请介绍一次合同审查经历。"],
  questionParserVersion: 0,
  importMethod: "agent-reach",
  target: legal,
};

const state: WorkbenchState = {
  company: legal.company,
  role: legal.role,
  jdDrafts: { [legal.key]: { target: legal, text: "负责合同审查与业务合规支持。", updatedAt: "2026-08-13" } },
  experienceDrafts: { [legal.key]: { target: legal, text: "一面问题整理", origin: "manual" } },
  experienceLibraries: {
    [legal.key]: { id: legal.key, target: legal, createdAt: "2026-08-13", updatedAt: "2026-08-13" },
    [operations.key]: { id: operations.key, target: operations, createdAt: "2026-08-12", updatedAt: "2026-08-12" },
  },
  experienceSources: [source],
  resumeText: "负责搭建合同审查流程，并支持多个业务团队。",
  questions: [{ id: "Q-1", kind: "role", category: "role_capability", title: "请介绍一次合同审查经历。", intent: "核对实务经验", cues: [], origin: "用户导入面经", provenance: "source_question" }],
  questionsTargetKey: legal.key,
  selectedQuestionId: "Q-1",
  answer: "我的回答",
  review: null,
  activeSession: null,
  trainingSessions: [{ id: "SESSION-1", target: legal, rootQuestionId: "Q-1", status: "completed", turns: [{ id: "TURN-1" }], startedAt: "2026-08-13", completedAt: "2026-08-13" } as unknown as WorkbenchState["trainingSessions"][number]],
  updatedAt: "2026-08-13T10:00:00.000Z",
};

describe("workbench backup", () => {
  it("round-trips the complete V6 durable state", () => {
    const parsed = parseWorkbenchBackupText(serializeWorkbenchBackup(state), state);
    expect(parsed.state).toEqual(state);
    expect(parsed.preview).toEqual({ targetCount: 2, sourceCount: 1, questionCount: 1, trainingSessionCount: 1, resumeCharacterCount: state.resumeText.length });
  });

  it("uses an explicit allowlist and excludes unexpected credential fields", () => {
    const unsafe = { ...state, deepSeekApiKey: "sk-secret-value", collectionStatus: "running" } as WorkbenchState;
    const backup = createWorkbenchBackup(unsafe) as Record<string, unknown>;
    const serialized = serializeWorkbenchBackup(unsafe);
    expect(backup.deepSeekApiKey).toBeUndefined();
    expect(backup.collectionStatus).toBeUndefined();
    expect(serialized).not.toContain("sk-secret-value");
  });

  it("migrates a legacy manual backup before presenting it", () => {
    const parsed = parseWorkbenchBackupText(JSON.stringify({
      ...state,
      schemaVersion: 1,
      experienceDrafts: undefined,
      experienceLibraries: undefined,
      experienceSources: [],
      experienceText: "旧版手动面经",
      experienceOrigin: "manual",
    }), state);
    expect(parsed.migratedFromLegacy).toBe(true);
    expect(parsed.state.experienceDrafts[legal.key]?.text).toBe("旧版手动面经");
  });

  it("rejects empty, damaged and structurally invalid files", () => {
    expect(() => parseWorkbenchBackupText("", state)).toThrow("备份文件为空");
    expect(() => parseWorkbenchBackupText("{broken", state)).toThrow("不是有效的 JSON");
    expect(() => parseWorkbenchBackupText(JSON.stringify({ schemaVersion: 6 }), state)).toThrow("缺少必要字段");
  });

  it("counts unique scoped targets without counting unassigned sources", () => {
    expect(summarizeWorkbenchBackup({ ...state, experienceSources: [{ ...source, target: undefined }] }).targetCount).toBe(2);
  });
});

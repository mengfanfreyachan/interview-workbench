import { describe, expect, it } from "vitest";
import { createExperienceTarget } from "./target-scope";
import type { WorkbenchState } from "./types";
import { clearWorkbenchState, LEGACY_WORKBENCH_STORAGE_KEYS, loadWorkbenchState, saveWorkbenchState, WORKBENCH_STORAGE_KEY, type WorkbenchStorage } from "./workbench-repository";

const target = createExperienceTarget("字节跳动", "法务");
const state: WorkbenchState = {
  company: target.company,
  role: target.role,
  jdDrafts: {},
  experienceDrafts: {},
  experienceLibraries: {},
  experienceSources: [],
  resumeText: "脱敏简历正文",
  questions: [],
  selectedQuestionId: "",
  answer: "",
  review: null,
  activeSession: null,
  trainingSessions: [],
  updatedAt: "2026-08-14",
};

class MemoryStorage implements WorkbenchStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException("quota", "QuotaExceededError");
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

describe("workbench repository", () => {
  it("saves and restores the current storage version", () => {
    const storage = new MemoryStorage();
    saveWorkbenchState(storage, state);
    const loaded = loadWorkbenchState(storage, state);
    expect(loaded?.storageKey).toBe(WORKBENCH_STORAGE_KEY);
    expect(loaded?.state).toEqual(state);
  });

  it("finds a legacy storage key when the current key is absent", () => {
    const storage = new MemoryStorage();
    storage.values.set(LEGACY_WORKBENCH_STORAGE_KEYS[0], JSON.stringify({ ...state, schemaVersion: 5 }));
    expect(loadWorkbenchState(storage, state)?.storageKey).toBe(LEGACY_WORKBENCH_STORAGE_KEYS[0]);
  });

  it("reports a write failure without replacing the previous value", () => {
    const storage = new MemoryStorage();
    storage.values.set(WORKBENCH_STORAGE_KEY, "previous-backup");
    storage.failWrites = true;
    expect(() => saveWorkbenchState(storage, state)).toThrow("浏览器本地数据保存失败");
    expect(storage.values.get(WORKBENCH_STORAGE_KEY)).toBe("previous-backup");
  });

  it("clears current and legacy workbench keys only", () => {
    const storage = new MemoryStorage();
    storage.values.set(WORKBENCH_STORAGE_KEY, "current");
    LEGACY_WORKBENCH_STORAGE_KEYS.forEach((key) => storage.values.set(key, "legacy"));
    storage.values.set("unrelated", "keep");
    clearWorkbenchState(storage);
    expect(storage.values.get(WORKBENCH_STORAGE_KEY)).toBeUndefined();
    expect(LEGACY_WORKBENCH_STORAGE_KEYS.every((key) => !storage.values.has(key))).toBe(true);
    expect(storage.values.get("unrelated")).toBe("keep");
  });
});

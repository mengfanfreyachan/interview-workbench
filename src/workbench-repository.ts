import type { WorkbenchState } from "./types";
import { parseWorkbenchBackupText, serializeWorkbenchBackup } from "./workbench-backup";
import type { RestoreResult } from "./workbench-storage";

export const WORKBENCH_STORAGE_KEY = "xiangqian.interview-workbench.v6";
export const LEGACY_WORKBENCH_STORAGE_KEYS = [
  "xiangqian.interview-workbench.v5",
  "xiangqian.interview-workbench.v4",
  "xiangqian.interview-workbench.v3",
  "xiangqian.interview-workbench.v2",
  "xiangqian.interview-workbench.v1",
] as const;

export type WorkbenchStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LoadedWorkbenchState = RestoreResult & {
  storageKey: string;
};

const storageError = (action: "读取" | "保存" | "清除") => new Error(`浏览器本地数据${action}失败。请检查隐私模式、存储权限或可用空间。`);

export function loadWorkbenchState(storage: WorkbenchStorage, initialState: WorkbenchState): LoadedWorkbenchState | null {
  try {
    for (const key of [WORKBENCH_STORAGE_KEY, ...LEGACY_WORKBENCH_STORAGE_KEYS]) {
      const text = storage.getItem(key);
      if (!text) continue;
      const parsed = parseWorkbenchBackupText(text, initialState);
      return { ...parsed, storageKey: key };
    }
    return null;
  } catch (error) {
    if (error instanceof SyntaxError) throw storageError("读取");
    throw error;
  }
}

export function saveWorkbenchState(storage: WorkbenchStorage, state: WorkbenchState) {
  try {
    storage.setItem(WORKBENCH_STORAGE_KEY, serializeWorkbenchBackup(state));
  } catch {
    throw storageError("保存");
  }
}

export function clearWorkbenchState(storage: WorkbenchStorage) {
  try {
    storage.removeItem(WORKBENCH_STORAGE_KEY);
    LEGACY_WORKBENCH_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
  } catch {
    throw storageError("清除");
  }
}

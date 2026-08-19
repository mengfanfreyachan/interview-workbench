import { useCallback, useState } from "react";
import type { WorkbenchState } from "./types";
import {
  MAX_WORKBENCH_BACKUP_BYTES,
  parseWorkbenchBackupText,
  serializeWorkbenchBackup,
  WORKBENCH_BACKUP_FILENAME,
  type ParsedWorkbenchBackup,
} from "./workbench-backup";
import { initialWorkbenchState } from "./workbench-initial-state";

type Params = {
  state: WorkbenchState;
  replaceWorkbenchState: (state: WorkbenchState) => void;
  resetWorkbenchState: () => void;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
};

function downloadBackup(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useWorkbenchBackupActions({ state, replaceWorkbenchState, resetWorkbenchState, setNotice, setError }: Params) {
  const [pendingImport, setPendingImport] = useState<(ParsedWorkbenchBackup & { fileName: string }) | null>(null);

  const prepareImport = useCallback(async (file: File) => {
    setError("");
    setPendingImport(null);
    try {
      if (file.size > MAX_WORKBENCH_BACKUP_BYTES) throw new Error("备份文件超过 10 MB，已停止读取。");
      const parsed = parseWorkbenchBackupText(await file.text(), initialWorkbenchState);
      setPendingImport({ ...parsed, fileName: file.name });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "工作台备份读取失败。");
    }
  }, [setError]);

  const cancelImport = useCallback(() => setPendingImport(null), []);

  const confirmImport = useCallback(() => {
    if (!pendingImport) return;
    try {
      // Persist first: a failed write must never replace the in-memory workspace.
      replaceWorkbenchState(pendingImport.state);
      setPendingImport(null);
      setError("");
      const migration = pendingImport.migratedFromLegacy ? "，旧版数据已安全迁移" : "";
      setNotice(`已从 ${pendingImport.fileName} 完整恢复工作台${migration}。DeepSeek Key 未从备份读取，请在需要时重新配置。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "工作台备份恢复失败，当前数据未改变。");
    }
  }, [pendingImport, replaceWorkbenchState, setError, setNotice]);

  const exportBackup = useCallback(() => {
    try {
      downloadBackup(serializeWorkbenchBackup(state), WORKBENCH_BACKUP_FILENAME);
      setNotice("工作台 JSON 备份已导出。文件包含 JD、简历、面经、题库和训练历史，不包含 DeepSeek Key。");
    } catch {
      setError("工作台备份生成失败，请重试。");
    }
  }, [setError, setNotice, state]);

  const clearData = useCallback(() => {
    if (!window.confirm("确定清除当前浏览器中的面试工作台数据并恢复脱敏样例吗？")) return;
    try {
      resetWorkbenchState();
      setNotice("本地练习数据已清除，已恢复脱敏样例。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "本地练习数据清除失败。");
    }
  }, [resetWorkbenchState, setError, setNotice]);

  return { pendingImport, prepareImport, cancelImport, confirmImport, exportBackup, clearData };
}

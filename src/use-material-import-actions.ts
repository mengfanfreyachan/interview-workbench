import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { parseAgentReachPayload } from "./engine";
import { agentSourcesToExperienceSources, experienceTextFromSources, readExperienceTextFile } from "./experience-source-utils";
import { readResumeFile } from "./resume-parser";
import { createExperienceTarget, deduplicateSources, partitionSourcesByTarget, upsertExperienceLibrary } from "./target-scope";
import type { ExperienceTarget, WorkbenchState } from "./types";

type Params = {
  currentTarget: ExperienceTarget;
  setState: Dispatch<SetStateAction<WorkbenchState>>;
  patchState: (patch: Partial<WorkbenchState>) => void;
  patchJdDraft: (patch: Partial<{ text: string; sourceName: string }>) => void;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
};

export function useMaterialImportActions({ currentTarget, setState, patchState, patchJdDraft, setNotice, setError }: Params) {
  const [parsingResume, setParsingResume] = useState(false);

  const importExperienceFile = useCallback(async (file: File) => {
    setError("");
    try {
      const text = await readExperienceTextFile(file);
      const savedAt = new Date().toISOString();
      setState((current) => ({
        ...current,
        experienceDrafts: {
          ...(current.experienceDrafts ?? {}),
          [currentTarget.key]: { target: currentTarget, text, origin: "manual" },
        },
        experienceLibraries: upsertExperienceLibrary(current.experienceLibraries ?? {}, currentTarget, savedAt),
        updatedAt: savedAt,
      }));
      setNotice(`已为 ${currentTarget.company} · ${currentTarget.role} 读取 ${file.name}，并自动保存到“我的面经库”。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文件读取失败。");
    }
  }, [currentTarget, setError, setNotice, setState]);

  const importJdFile = useCallback(async (file: File) => {
    setError("");
    try {
      if (!currentTarget.company || !currentTarget.role) throw new Error("请先填写目标公司和岗位，再导入 JD。");
      if (!/\.(txt|md)$/i.test(file.name)) throw new Error("JD 文件当前支持 .txt 或 .md；也可以直接粘贴正文。");
      const text = await file.text();
      if (text.trim().length < 20) throw new Error("JD 正文过短，请检查文件内容是否完整。");
      patchJdDraft({ text, sourceName: file.name });
      setNotice(`已把 ${file.name} 绑定到 ${currentTarget.company} · ${currentTarget.role}；切换岗位时会自动隔离。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "JD 文件读取失败。");
    }
  }, [currentTarget, patchJdDraft, setError, setNotice]);

  const importAgentResult = useCallback(async (file: File) => {
    setError("");
    try {
      const raw = await readExperienceTextFile(file);
      const parsed = parseAgentReachPayload(raw);
      const importedCompany = parsed.payload.target?.company?.trim() || currentTarget.company;
      const importedRole = parsed.payload.target?.role?.trim() || currentTarget.role;
      const importedTarget = createExperienceTarget(importedCompany, importedRole);
      const sources = agentSourcesToExperienceSources(parsed.payload.sources ?? [], `agent-source-${Date.now()}`, importedTarget);
      setState((current) => {
        const savedAt = new Date().toISOString();
        const mergedSources = deduplicateSources([...current.experienceSources, ...sources]);
        const importedSources = partitionSourcesByTarget(mergedSources, importedTarget).current;
        return {
          ...current,
          experienceSources: mergedSources,
          experienceDrafts: {
            ...(current.experienceDrafts ?? {}),
            [importedTarget.key]: { target: importedTarget, text: experienceTextFromSources(importedSources), origin: "agent" },
          },
          experienceLibraries: upsertExperienceLibrary(current.experienceLibraries ?? {}, importedTarget, savedAt),
          updatedAt: savedAt,
        };
      });
      setNotice(importedTarget.key === currentTarget.key
        ? `已为当前岗位导入 ${parsed.sourceCount} 个来源、${parsed.questions.length} 道题，并自动保存到“我的面经库”。`
        : `已导入 ${parsed.sourceCount} 个来源，并按文件中的目标保存到 ${importedTarget.company} · ${importedTarget.role} 面经库；它们不会进入当前岗位题库。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agent Reach 结果导入失败。");
    }
  }, [currentTarget, setError, setNotice, setState]);

  const importResume = useCallback(async (file: File) => {
    setError("");
    setParsingResume(true);
    try {
      const result = await readResumeFile(file);
      patchState({ resumeText: result.text });
      const format = result.format === "docx" ? "Word" : result.format === "pdf" ? "PDF" : result.format === "markdown" ? "Markdown" : "文本";
      const pages = result.pageCount ? `，共 ${result.pageCount} 页` : "";
      setNotice(`已在当前浏览器中把 ${file.name}（${format}）解析为可编辑文本${pages}，共 ${result.text.length} 字。${result.warning ?? "请核对姓名、日期和项目符号是否完整。"}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "简历读取失败。");
    } finally {
      setParsingResume(false);
    }
  }, [patchState, setError, setNotice]);

  return { parsingResume, importExperienceFile, importJdFile, importAgentResult, importResume };
}

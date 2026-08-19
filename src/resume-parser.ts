import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type ResumeFormat = "text" | "markdown" | "docx" | "pdf";

export type ResumeParseResult = {
  text: string;
  format: ResumeFormat;
  pageCount?: number;
  warning?: string;
};

export type ResumeParserDependencies = {
  parseDocx?: (data: ArrayBuffer) => Promise<{ text: string; warning?: string }>;
  parsePdf?: (data: ArrayBuffer) => Promise<{ text: string; pageCount: number }>;
};

export const MAX_RESUME_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_RESUME_TEXT_LENGTH = 30_000;

export const normalizeResumeText = (value: string) => value
  .replace(/\u00a0/g, " ")
  .replace(/\r\n?/g, "\n")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n[ \t]+/g, "\n")
  .replace(/[ \t]{2,}/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const getExtension = (name: string) => name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";

const assertUsableText = (text: string, source: string) => {
  const normalized = normalizeResumeText(text);
  if (normalized.replace(/\s/g, "").length < 30) {
    if (source === "PDF") throw new Error("PDF 中没有提取到足够文字，可能是扫描件。当前版本暂不做 OCR，请先导出文字版 PDF，或复制粘贴简历正文。");
    throw new Error(`${source} 中没有提取到足够的简历文字，请检查文件内容。`);
  }
  if (normalized.length > MAX_RESUME_TEXT_LENGTH) throw new Error(`解析后的简历超过 ${MAX_RESUME_TEXT_LENGTH.toLocaleString()} 字，请删除无关附件页后重试。`);
  return normalized;
};

const defaultDocxParser = async (data: ArrayBuffer) => {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return {
    text: result.value,
    warning: result.messages.length ? "Word 中有少量内容未能完整还原，请核对解析结果。" : undefined,
  };
};

const needsAsciiSpace = (left: string, right: string) => /[A-Za-z0-9)]$/.test(left) && /^[A-Za-z0-9(]/.test(right);

export const textItemsToPageText = (items: unknown[]) => {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const textItem = item as { str?: unknown; hasEOL?: unknown };
    if (typeof textItem.str !== "string") continue;
    const part = textItem.str.replace(/\s+/g, " ").trim();
    if (part) line += `${line && needsAsciiSpace(line, part) ? " " : ""}${part}`;
    if (textItem.hasEOL && line) {
      lines.push(line);
      line = "";
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
};

const defaultPdfParser = async (data: ArrayBuffer) => {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(textItemsToPageText(content.items));
      page.cleanup();
    }
    return { text: pages.join("\n\n"), pageCount: document.numPages };
  } finally {
    await loadingTask.destroy();
  }
};

export const readResumeFile = async (file: File, dependencies: ResumeParserDependencies = {}): Promise<ResumeParseResult> => {
  if (file.size > MAX_RESUME_FILE_BYTES) throw new Error("简历文件超过 15 MB，请压缩或删除无关附件页后重试。");
  const extension = getExtension(file.name);

  try {
    if (extension === ".txt" || extension === ".md") {
      return {
        text: assertUsableText(await file.text(), extension === ".md" ? "Markdown 文件" : "文本文件"),
        format: extension === ".md" ? "markdown" : "text",
      };
    }
    if (extension === ".doc") throw new Error("暂不支持旧版 .doc，请在 Word 中另存为 .docx 后上传。");
    if (extension === ".docx") {
      const result = await (dependencies.parseDocx ?? defaultDocxParser)(await file.arrayBuffer());
      return { text: assertUsableText(result.text, "Word 文件"), format: "docx", warning: result.warning };
    }
    if (extension === ".pdf") {
      const result = await (dependencies.parsePdf ?? defaultPdfParser)(await file.arrayBuffer());
      return { text: assertUsableText(result.text, "PDF"), format: "pdf", pageCount: result.pageCount };
    }
    throw new Error("当前支持 .txt、.md、.docx 和文字型 .pdf 简历。");
  } catch (error) {
    if (error instanceof Error && /^(暂不支持|当前支持|简历文件|解析后的|PDF 中|Word 文件|Markdown 文件|文本文件)/.test(error.message)) throw error;
    if (extension === ".pdf") throw new Error("PDF 解析失败。请确认文件未加密且包含可复制文字，或直接粘贴简历正文。");
    if (extension === ".docx") throw new Error("Word 解析失败。请确认文件是有效的 .docx，或直接粘贴简历正文。");
    throw error;
  }
};

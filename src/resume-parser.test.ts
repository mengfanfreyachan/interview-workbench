import { describe, expect, it, vi } from "vitest";
import { normalizeResumeText, readResumeFile, textItemsToPageText } from "./resume-parser";

const fakeFile = (name: string, text: string) => ({
  name,
  size: text.length,
  text: vi.fn(async () => text),
  arrayBuffer: vi.fn(async () => new TextEncoder().encode(text).buffer),
}) as unknown as File;

const enoughText = "张三 产品经理，负责用户研究、需求分析、跨团队协作与上线复盘，并通过数据验证方案效果。";

describe("readResumeFile", () => {
  it("读取并清理文本简历", async () => {
    const result = await readResumeFile(fakeFile("resume.txt", `${enoughText}\n\n\n项目经历`));
    expect(result.format).toBe("text");
    expect(result.text).toContain("项目经历");
    expect(result.text).not.toContain("\n\n\n");
  });

  it("通过浏览器解析器读取 DOCX", async () => {
    const parseDocx = vi.fn(async () => ({ text: enoughText, warning: "请核对" }));
    const result = await readResumeFile(fakeFile("resume.docx", "binary"), { parseDocx });
    expect(parseDocx).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ format: "docx", warning: "请核对" });
  });

  it("读取文字型 PDF 并保留页数", async () => {
    const parsePdf = vi.fn(async () => ({ text: enoughText, pageCount: 2 }));
    const result = await readResumeFile(fakeFile("resume.pdf", "binary"), { parsePdf });
    expect(result).toMatchObject({ format: "pdf", pageCount: 2 });
  });

  it("对扫描型 PDF 给出 OCR 边界提示", async () => {
    await expect(readResumeFile(fakeFile("scan.pdf", "binary"), {
      parsePdf: async () => ({ text: "图", pageCount: 1 }),
    })).rejects.toThrow("扫描件");
  });

  it("拒绝旧版 DOC", async () => {
    await expect(readResumeFile(fakeFile("resume.doc", "binary"))).rejects.toThrow("另存为 .docx");
  });
});

describe("text normalization", () => {
  it("把 PDF 文字项拼成稳定的逐行文本", () => {
    expect(textItemsToPageText([
      { str: "Product", hasEOL: false },
      { str: "Manager", hasEOL: true },
      { str: "项目", hasEOL: false },
      { str: "经历", hasEOL: true },
    ])).toBe("Product Manager\n项目经历");
  });

  it("清理不间断空格和多余空行", () => {
    expect(normalizeResumeText("教育\u00a0经历\n\n\n项目  经历")).toBe("教育 经历\n\n项目 经历");
  });
});

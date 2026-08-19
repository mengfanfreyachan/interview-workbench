import { sanitizePublicSourceUrl } from "./engine";
import { extractInterviewQuestions, INTERVIEW_QUESTION_PARSER_VERSION } from "./interview-question-extractor";
import type { AgentReachCollectionResponse, ExperienceSource, ExperienceTarget } from "./types";

export async function readExperienceTextFile(file: File) {
  if (!/\.(txt|md|json)$/i.test(file.name)) {
    throw new Error("当前原型只读取 .txt、.md 或 .json 文本文件；Word / PDF 请粘贴正文。");
  }
  return file.text();
}

export function agentSourcesToExperienceSources(
  sources: AgentReachCollectionResponse["sources"],
  idPrefix: string,
  target: ExperienceTarget,
): ExperienceSource[] {
  return sources.map((source, index) => reindexSourceQuestionsFromExcerpt({
    id: `${idPrefix}-${index}`,
    title: source.title?.trim() || `Agent Reach 来源 ${index + 1}`,
    platform: source.platform?.trim() || "小红书",
    url: sanitizePublicSourceUrl(source.url?.trim() || ""),
    capturedAt: source.capturedAt?.trim() || new Date().toISOString(),
    excerpt: (source.excerpts ?? []).join("\n").trim(),
    questions: (source.questions ?? []).map((question) => question.trim()).filter(Boolean),
    questionParserVersion: Number.isInteger(source.questionParserVersion) ? source.questionParserVersion : 0,
    importMethod: "agent-reach",
    target,
  }));
}

export function reindexSourceQuestionsFromExcerpt(source: ExperienceSource, force = false): ExperienceSource {
  if (source.questions.length > 0) return source;
  if (!force && source.questionParserVersion === INTERVIEW_QUESTION_PARSER_VERSION) return source;
  const questions = extractInterviewQuestions(source.excerpt);
  return { ...source, questions, questionParserVersion: INTERVIEW_QUESTION_PARSER_VERSION };
}

export function experienceTextFromSources(sources: ExperienceSource[]) {
  return sources.map((source) => {
    const questions = source.questions.map((question, index) => `${index + 1}. ${question}`).join("\n");
    return `【${source.platform}】${source.title}\n${questions || source.excerpt}`.trim();
  }).join("\n\n");
}

import type { QuestionCategory } from "./types";

export const QUESTION_CATEGORY_COPY: Record<QuestionCategory, { title: string; subtitle: string; kicker: string }> = {
  resume_deep_dive: { title: "简历题", subtitle: "从高价值经历中选择不同切口；每题只追一个主要意图。", kicker: "简历题" },
  role_capability: { title: "专业 / JD 题", subtitle: "从岗位要求、专业语境与面经原题提炼能力验证。", kicker: "专业 / JD" },
};

export type QuestionFilter = "all" | "resume" | "role" | "source";
export const QUESTION_FILTER_COPY: Record<QuestionFilter, string> = { all: "全部", resume: "简历题", role: "专业 / JD 题", source: "面经真题" };

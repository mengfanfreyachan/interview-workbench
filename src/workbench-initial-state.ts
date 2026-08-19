import { generateQuestionBanks } from "./engine";
import { INTERVIEW_QUESTION_PARSER_VERSION } from "./interview-question-extractor";
import { SAMPLE_COMPANY, SAMPLE_EXPERIENCE, SAMPLE_JD, SAMPLE_RESUME, SAMPLE_ROLE } from "./sample-data";
import { createExperienceTarget } from "./target-scope";
import type { ExperienceSource, WorkbenchState } from "./types";

const sampleTarget = createExperienceTarget(SAMPLE_COMPANY, SAMPLE_ROLE);
const sampleSavedAt = "2026-08-10T12:00:00.000Z";

const sampleSource: ExperienceSource = {
  id: "sample-manual",
  title: "用户粘贴的脱敏样例",
  platform: "某内容社区 / 校友访谈",
  url: "",
  capturedAt: "2026-08-10",
  excerpt: "原型演示材料，未联网核验，不作为真实外部真题背书。",
  questions: [
    "请讲一次你从用户反馈中发现产品问题，并推动落地的经历。",
    "如果新功能上线后使用率低，你会怎样定位原因？",
    "如何平衡商家体验、用户体验和平台收入？",
  ],
  questionParserVersion: INTERVIEW_QUESTION_PARSER_VERSION,
  importMethod: "manual",
  target: sampleTarget,
};

const initialQuestions = generateQuestionBanks({
  company: SAMPLE_COMPANY,
  role: SAMPLE_ROLE,
  jdText: SAMPLE_JD,
  resumeText: SAMPLE_RESUME,
  experienceText: SAMPLE_EXPERIENCE,
  experienceOrigin: "manual",
  experienceSources: [sampleSource],
});

export const initialWorkbenchState: WorkbenchState = {
  company: SAMPLE_COMPANY,
  role: SAMPLE_ROLE,
  jdDrafts: {
    [sampleTarget.key]: { target: sampleTarget, text: SAMPLE_JD, sourceName: "脱敏示例 JD", updatedAt: sampleSavedAt },
  },
  experienceDrafts: {
    [sampleTarget.key]: { target: sampleTarget, text: SAMPLE_EXPERIENCE, origin: "manual" },
  },
  experienceLibraries: {
    [sampleTarget.key]: { id: sampleTarget.key, target: sampleTarget, createdAt: sampleSavedAt, updatedAt: sampleSavedAt },
  },
  experienceSources: [sampleSource],
  resumeText: SAMPLE_RESUME,
  questions: initialQuestions,
  questionsTargetKey: sampleTarget.key,
  selectedQuestionId: initialQuestions[0]?.id ?? "",
  answer: "",
  review: null,
  activeSession: null,
  trainingSessions: [],
  updatedAt: new Date().toISOString(),
};

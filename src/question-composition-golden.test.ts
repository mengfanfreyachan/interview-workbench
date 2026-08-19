import { describe, expect, it } from "vitest";
import { generateQuestionBanks } from "./engine";
import { QUESTION_COMPOSITION_GOLDEN_CASES } from "./test/fixtures/question-composition-golden";

describe.each(QUESTION_COMPOSITION_GOLDEN_CASES)("$label", (golden) => {
  const questions = generateQuestionBanks({
    company: golden.target.company,
    role: golden.target.role,
    jdText: golden.jdText,
    resumeText: golden.resumeText,
    experienceText: "",
    experienceOrigin: "agent",
    experienceSources: [golden.source, golden.foreignSource],
  });

  it("生成两类题库并保持数量、去重和单一问题边界", () => {
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(questions.length).toBeLessThanOrEqual(12);
    expect(new Set(questions.map((question) => question.category))).toEqual(new Set(["resume_deep_dive", "role_capability"]));
    expect(new Set(questions.map((question) => question.title)).size).toBe(questions.length);
    expect(questions.every((question) => (question.title.match(/[？?]/g) ?? []).length === 1)).toBe(true);
    expect(questions.some((question) => question.provenance === "coach_generated")).toBe(false);
  });

  it("简历题只引用逐字简历证据并命中岗位相关高价值经历", () => {
    const resumeQuestions = questions.filter((question) => question.category === "resume_deep_dive");
    expect(resumeQuestions).toHaveLength(3);
    expect(resumeQuestions.some((question) => question.sourceRefs?.[0]?.excerpt?.includes(golden.expectedResumeEvidence))).toBe(true);
    expect(resumeQuestions.every((question) => question.provenance === "source_derived" && question.sourceRefs?.[0]?.sourceKind === "resume")).toBe(true);
    expect(resumeQuestions.every((question) => golden.resumeText.includes(question.sourceRefs?.[0]?.excerpt ?? "不存在的引文"))).toBe(true);
    expect(resumeQuestions.some((question) => question.jdRelevance === "jd_aligned")).toBe(true);
    expect(new Set(resumeQuestions.map((question) => question.primaryProbe)).size).toBeGreaterThanOrEqual(2);
  });

  it("JD 推演题只引用 JD，面经原题逐字保留且隔离其他岗位", () => {
    const jdQuestions = questions.filter((question) => question.sourceRefs?.some((ref) => ref.sourceKind === "jd"));
    expect(jdQuestions.length).toBeGreaterThanOrEqual(1);
    expect(jdQuestions.every((question) => question.provenance === "source_derived")).toBe(true);
    expect(jdQuestions.every((question) => golden.jdText.includes(question.sourceRefs?.[0]?.excerpt ?? "不存在的引文"))).toBe(true);

    const sourceQuestions = questions.filter((question) => question.provenance === "source_question");
    expect(sourceQuestions).toHaveLength(1);
    expect(sourceQuestions[0]).toMatchObject({
      title: golden.source.questions[0],
      category: "role_capability",
      sourceId: golden.source.id,
      sourceRefs: [{ sourceId: golden.source.id, sourceKind: "interview_experience", excerpt: golden.source.questions[0] }],
    });
    expect(questions.some((question) => question.title === golden.foreignSource.questions[0])).toBe(false);
    expect(questions.every((question) => (question.sourceRefs?.length ?? 0) > 0)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { buildResumeQuestions, generateQuestionBanks, parseAgentReachPayload, sanitizePublicSourceUrl } from "./engine";
import { createExperienceTarget } from "./target-scope";
import type { ExperienceSource } from "./types";

describe("interview workbench engine", () => {
  it("generates two main categories and keeps interview originals as a source badge", () => {
    const target = createExperienceTarget("某公司", "产品运营");
    const source: ExperienceSource = {
      id: "exp-1",
      title: "运营面经",
      platform: "小红书",
      url: "https://www.xiaohongshu.com/explore/exp-1",
      capturedAt: "2026-08-12",
      excerpt: "",
      questions: ["你如何判断一个运营策略是否有效？"],
      importMethod: "agent-reach",
      target,
    };
    const questions = generateQuestionBanks({
      company: target.company,
      role: target.role,
      jdText: "负责用户增长策略，并协同产品团队推动重点项目落地。",
      resumeText: "某内容平台增长运营实习：通过用户访谈与漏斗分析定位新用户流失问题，推动新手任务实验。",
      experienceText: "",
      experienceOrigin: "agent",
      experienceSources: [source],
    });
    expect(new Set(questions.map((item) => item.category))).toEqual(new Set(["role_capability", "resume_deep_dive"]));
    expect(questions.find((item) => item.provenance === "source_question")?.category).toBe("role_capability");
  });

  it("never fabricates JD or connection questions without JD material", () => {
    const questions = generateQuestionBanks({ company: "某公司", role: "产品运营", resumeText: "负责用户访谈与数据分析，推动新功能上线并完成复盘。", experienceText: "", experienceOrigin: "manual", experienceSources: [] });
    expect(questions.some((item) => item.category === "role_capability")).toBe(false);
    expect(questions.some((item) => item.category === "resume_deep_dive")).toBe(true);
  });

  it("keeps professional/JD questions anchored to JD without a combined category", () => {
    const questions = generateQuestionBanks({
      company: "某公司",
      role: "法务",
      jdText: "负责业务合同审查并识别数据合规与知识产权风险。",
      resumeText: "某互联网公司法务实习：参与合同审查，整理风险清单并与业务团队沟通修改方案。",
      experienceText: "",
      experienceOrigin: "manual",
      experienceSources: [],
    });
    const professional = questions.find((item) => item.category === "role_capability");
    expect(professional?.sourceRefs?.map((ref) => ref.sourceKind)).toEqual(["jd"]);
    expect(professional?.provenance).toBe("source_derived");
  });

  it("imports Agent Reach questions without pretending to fetch", () => {
    const parsed = parseAgentReachPayload(JSON.stringify({ sources: [{ title: "样例", questions: ["如何定位留存下降？"] }] }));
    expect(parsed.questions).toEqual(["如何定位留存下降？"]);
  });

  it("removes transient query tokens before a source URL can be stored", () => {
    expect(sanitizePublicSourceUrl("https://www.xiaohongshu.com/explore/abc?xsec_token=secret#comment"))
      .toBe("https://www.xiaohongshu.com/explore/abc");
  });

  it("prefers experience claims over contact details when selecting resume anchors", () => {
    const questions = generateQuestionBanks({
      company: "某公司",
      role: "产品经理",
      jdText: "负责用户研究和产品方案设计，推动跨团队项目落地。",
      resumeText: "姓名：某候选人 邮箱：candidate@example.com 手机：13800000000\n教育背景：某大学法学本科\n负责搭建法律资讯监测 Agent，通过规则设计和工作流优化将每周人工筛选时间降低约 90%。",
      experienceText: "",
      experienceOrigin: "manual",
      experienceSources: [],
    });
    const firstResumeQuestion = questions.find((item) => item.category === "resume_deep_dive");
    expect(firstResumeQuestion?.title).toContain("人工筛选时间降低约 90%");
    expect(firstResumeQuestion?.title.length).toBeLessThan(80);
    expect(firstResumeQuestion?.sourceRefs?.[0].excerpt).toContain("法律资讯监测 Agent");
    expect(firstResumeQuestion?.title).not.toContain("candidate@example.com");
  });

  it("extracts a resume anchor from a long single-line parsed document", () => {
    const longPrefix = "教育背景 某大学法学本科 ".repeat(20);
    const questions = generateQuestionBanks({
      company: "某公司",
      role: "法务",
      jdText: "负责合同审查并为业务团队提供合规支持。",
      resumeText: `${longPrefix} 实习经历 某互联网公司 · 法务实习生 负责审查业务合同，建立风险清单并推动业务团队完成修改，累计支持 30 份合同。`,
      experienceText: "",
      experienceOrigin: "manual",
      experienceSources: [],
    });
    expect(questions.some((item) => item.category === "resume_deep_dive")).toBe(true);
    expect(questions.some((item) => item.category === "role_capability")).toBe(true);
  });

  it("never imports questions that belong to another target", () => {
    const makeSource = (id: string, role: string, question: string): ExperienceSource => ({
      id,
      title: `${role}面经`,
      platform: "小红书",
      url: `https://www.xiaohongshu.com/explore/${id}`,
      capturedAt: "2026-08-11",
      excerpt: "",
      questions: [question],
      importMethod: "agent-reach",
      target: createExperienceTarget("字节跳动", role),
    });
    const questions = generateQuestionBanks({
      company: "字节跳动",
      role: "法务",
      resumeText: "",
      experienceText: "",
      experienceOrigin: "agent",
      experienceSources: [
        makeSource("ops", "产品运营", "如何提升产品活跃度？"),
        makeSource("legal", "法务", "如何审查一份高风险合同？"),
      ],
    });
    expect(questions.some((item) => item.title === "如何审查一份高风险合同？")).toBe(true);
    expect(questions.some((item) => item.title === "如何提升产品活跃度？")).toBe(false);
    expect(questions.find((item) => item.title === "如何审查一份高风险合同？")?.provenance).toBe("source_question");
  });

  it("quarantines legacy sources without a target", () => {
    const legacy: ExperienceSource = {
      id: "legacy",
      title: "旧来源",
      platform: "小红书",
      url: "",
      capturedAt: "2026-08-10",
      excerpt: "",
      questions: ["这道题归属不明？"],
      importMethod: "agent-reach",
    };
    const questions = generateQuestionBanks({ company: "字节跳动", role: "法务", resumeText: "", experienceText: "", experienceOrigin: "agent", experienceSources: [legacy] });
    expect(questions.some((item) => item.title === "这道题归属不明？")).toBe(false);
  });

  it("selects high-signal claims and gives each a distinct primary probe", () => {
    const questions = generateQuestionBanks({
      company: "某公司", role: "产品经理", jdText: "负责用户研究、数据分析与方案设计。",
      resumeText: "多平台用户研究与商业研究工作台 AI 研究产品负责人 2026.08–至今\n负责搭建研究流程，推动跨团队落地。\n通过 18 份访谈与漏斗分析定位流失，首周发布率由 21% 提升至 28%。\n制定 A/B 测试策略并完成复盘。",
      experienceText: "", experienceOrigin: "manual", experienceSources: [],
    }).filter((item) => item.category === "resume_deep_dive");
    expect(questions).toHaveLength(3);
    expect(new Set(questions.map((item) => item.primaryProbe)).size).toBeGreaterThanOrEqual(2);
    expect(questions.every((item) => item.sourceRefs?.[0]?.excerpt && item.sourceRefs?.[0]?.excerpt?.length > 0)).toBe(true);
    expect(questions.every((item) => !item.title.includes("目标、你的具体责任和结果依据分别"))).toBe(true);
    expect(questions.some((item) => item.primaryProbe === "metric_validity")).toBe(true);
    expect(questions.some((item) => item.title.includes("指标具体是怎么定义"))).toBe(true);
  });

  it("marks resume claims as general when no JD is provided", () => {
    const question = generateQuestionBanks({ company: "某公司", role: "产品", resumeText: "负责搭建用户研究流程并完成交付。", experienceText: "", experienceOrigin: "manual", experienceSources: [] }).find((item) => item.kind === "resume");
    expect(question?.jdRelevance).toBe("general_signal");
  });

  it("orders Chinese JD anchors before unrelated high-signal claims and keeps every title single-focus", () => {
    const questions = buildResumeQuestions({
      jdText: "负责用户研究、数据分析与跨团队产品运营。",
      resumeText: "多平台用户研究与商业研究工作台 AI 研究产品负责人 2026.08–至今\n负责内容治理流程，完成 5 轮追问。\n负责用户研究与数据分析，推动产品方案上线，转化率提升 12%。\n参与合同审查，整理法律风险清单并交付。",
    });
    expect(questions).toHaveLength(3);
    expect(questions[0].jdRelevance).toBe("jd_aligned");
    expect(questions[0].sourceRefs?.[0].excerpt).toContain("用户研究");
    expect(questions[0].title).not.toContain("2026.08");
    expect(new Set(questions.map((question) => question.primaryProbe)).size).toBeGreaterThanOrEqual(2);
    for (const question of questions) {
      expect((question.title.match(/[？?]/g) ?? []).length).toBe(1);
      expect(question.title).not.toMatch(/以及|分别|并且|和你的|为什么.*替代/);
    }
    expect(questions.some((question) => question.primaryProbe === "metric_validity")).toBe(true);
    expect(questions.some((question) => question.primaryProbe !== "metric_validity" && question.title.includes("关键依据") || question.title.includes("亲自决定"))).toBe(true);
  });

  it("does not treat a legal risk list as an experienced failure and keeps the title anchor short", () => {
    const [question] = buildResumeQuestions({
      jdText: "负责合同审查与法律风险识别。",
      resumeText: "参与合同审查，整理法律风险清单并交付；与业务团队核对关键条款并形成修改建议。",
    });
    expect(question.primaryProbe).not.toBe("tradeoff_or_failure");
    expect(question.title).not.toContain("与业务团队核对关键条款");
    expect(question.title.length).toBeLessThan(70);
  });
});

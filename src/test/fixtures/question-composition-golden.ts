import { createExperienceTarget } from "../../target-scope";
import type { ExperienceSource, ExperienceTarget } from "../../types";

export type QuestionCompositionGoldenCase = {
  id: "product" | "operations" | "legal";
  label: string;
  target: ExperienceTarget;
  jdText: string;
  resumeText: string;
  source: ExperienceSource;
  foreignSource: ExperienceSource;
  expectedResumeEvidence: string;
};

const sourceFor = (id: string, title: string, target: ExperienceTarget, question: string): ExperienceSource => ({
  id,
  title,
  platform: "脱敏 Golden 面经",
  url: `https://example.com/${id}`,
  capturedAt: "2026-08-14T08:00:00.000Z",
  excerpt: `${target.role} 的脱敏面试记录，仅用于自动化质量回归。`,
  questions: [question],
  importMethod: "agent-reach",
  target,
});

const productTarget = createExperienceTarget("远山科技", "AI 产品经理");
const operationsTarget = createExperienceTarget("青禾内容", "产品运营");
const legalTarget = createExperienceTarget("星桥服务", "法务专员");

export const QUESTION_COMPOSITION_GOLDEN_CASES: QuestionCompositionGoldenCase[] = [
  {
    id: "product",
    label: "产品 Golden Case",
    target: productTarget,
    jdText: [
      "负责用户研究与需求分析，设计生成式 AI 产品方案并推动跨团队项目落地。",
      "能够结合数据分析和实验结果判断需求优先级，持续验证产品效果。",
      "建立产品迭代机制，与设计、研发和运营协作完成方案交付。",
    ].join("\n"),
    resumeText: [
      "通过 18 次用户研究访谈与漏斗分析识别新用户激活障碍，推动引导流程上线后激活率由 31% 提升至 44%。",
      "负责设计 AI 研究助手的需求优先级规则，结合任务频率、失败成本和实现周期制定版本方案。",
      "在两周时间约束下协调设计与研发完成原型验证，建立每周复盘机制并交付可测试版本。",
    ].join("\n"),
    source: sourceFor("golden-product-source", "AI 产品岗位面经", productTarget, "你如何判断一个 AI 功能是真需求而不是技术展示？"),
    foreignSource: sourceFor("golden-product-foreign", "运营岗位隔离面经", operationsTarget, "你会如何安排一次内容活动的发布节奏？"),
    expectedResumeEvidence: "激活率由 31% 提升至 44%",
  },
  {
    id: "operations",
    label: "运营 Golden Case",
    target: operationsTarget,
    jdText: [
      "负责用户分层、内容运营和活动策略，推动核心用户增长与留存。",
      "通过数据分析定位转化问题，设计实验并持续优化运营流程。",
      "协同产品和渠道团队完成项目落地，能够复盘效果与资源投入。",
    ].join("\n"),
    resumeText: [
      "分析注册到首发内容的转化漏斗，识别创作门槛并推动新手任务实验，次日留存由 24% 提升至 31%。",
      "负责建立创作者分层运营规则，根据活跃度和内容质量设计差异化触达策略并完成复盘。",
      "在预算受限情况下协调产品与渠道资源上线主题活动，覆盖 1200 名目标用户并验证参与路径。",
    ].join("\n"),
    source: sourceFor("golden-operations-source", "产品运营岗位面经", operationsTarget, "当活动曝光增长但转化下降时，你会先检查什么？"),
    foreignSource: sourceFor("golden-operations-foreign", "法务岗位隔离面经", legalTarget, "如何判断一项业务安排是否涉及数据合规风险？"),
    expectedResumeEvidence: "次日留存由 24% 提升至 31%",
  },
  {
    id: "legal",
    label: "法务 Golden Case",
    target: legalTarget,
    jdText: [
      "负责业务合同审查、法律风险识别和修改建议，支持业务团队完成谈判。",
      "开展数据合规与知识产权研究，形成可执行的合规方案和内部指引。",
      "能够跨部门沟通复杂法律问题，跟踪项目整改与风险闭环。",
    ].join("\n"),
    resumeText: [
      "参与审查 36 份采购与服务合同，建立合同审查清单并识别责任限制、知识产权和数据使用风险。",
      "负责研究个人信息处理场景，设计数据合规核对流程并向业务团队交付修改建议。",
      "协调产品与安全团队完成高风险条款整改，在一周内整理证据并形成可追踪的风险闭环。",
    ].join("\n"),
    source: sourceFor("golden-legal-source", "法务岗位面经", legalTarget, "业务坚持使用高风险合同条款时，你会如何沟通并推进决策？"),
    foreignSource: sourceFor("golden-legal-foreign", "产品岗位隔离面经", productTarget, "你如何判断一个需求应当进入路线图？"),
    expectedResumeEvidence: "建立合同审查清单",
  },
];

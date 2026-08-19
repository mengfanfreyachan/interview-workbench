# 面试证据审阅网页协议 V1

协议版本：`interview.evidence-review.v1`

## 目标

把 `interview-deep-dive-coach` 的审阅方法固定成网页、模型接口和本地存储都能使用的结构化协议。它描述一次回答中已经呈现和仍需验证的内容，不给总分，不预测面试结果。

TypeScript 事实来源：`src/interview-review-protocol.ts`。

## 页面结构

| 页面区块 | 字段 | 是否必填 | 说明 |
|---|---|---:|---|
| 已呈现的证据 | `presentedEvidence[]` | 是，可空 | 只记录本次回答实际说出的证据；状态为 `demonstrated` 或 `emerging`。 |
| 尚未说明的事实 | `missingFacts[]` | 是，可空 | 固定状态 `unresolved`；文案使用“本次回答尚未说明”或“当前材料未提供”。 |
| 表达问题 | `communicationIssues[]` | 是，可空 | 只描述相关性、顺序、密度、清晰度、术语等表达问题。 |
| 判断与策略风险 | `strategyRisks[]` | 是，可空 | 描述判断、优先级、取舍、协作、保密、无依据确定性或目标错位。 |
| 岗位关联与经历佐证 | `jdConnections[]` | 是，可空 | 每项必须同时引用 JD 与候选人材料／回答；并条件性检查回答是否主动用简历经历或本轮事实证明 JD 能力。纯知识、法规解释、计算或假设情景题可标记 `not_applicable`（无需简历佐证）。没有 JD 时保持空数组并在 `limitations` 说明。 |
| 优先改进项 | `priorityImprovement` | 是 | 一次只给一个优先改进，必须关联前述观察 ID。 |
| 下一条追问 | `nextFollowUp` | 是 | 一次只给一道题，并声明追问意图、验证信号、来源与题目来源类型。 |
| 材料来源 | `sourceLedger[]` 与各项 `sourceRefs[]` | 是 | 每条事实判断必须可追溯；不能引用其他 target key 的材料。 |

## 来源账本

每次审阅先冻结一个 `target.key`，格式由产品统一生成，例如 `字节跳动::产品经理::校招`。所有来源必须属于同一 target key。

来源类型：

- `jd`：目标岗位 JD；
- `resume`：简历；
- `interview_experience`：面经或真题来源；
- `user_answer`：当前或历史回答；
- `project`：用户补充的项目材料；
- `transcript`：录音转写或面试记录。

事实属性：

- `material_fact`：材料原文；
- `user_confirmed`：用户明确确认；
- `user_claim_unverified`：练习中出现、仍需核验的主张；
- `coach_inference`：教练推断；
- `unknown`：当前无法确定。

每个 `sourceRef` 包含 `sourceId`，并可包含定位 `locator` 和短引用 `quote`。`sourceId` 必须存在于 `sourceLedger`。

## 通用观察字段

五类观察共用：

- `id`：本次审阅内唯一；
- `observation`：可核对的观察，不写录用结论；
- `impact`：为什么影响本题的信号判断；
- `confidence`：`high | medium | low`；
- `sourceRefs`：至少一条来源；
- `nextAction`：用户下一轮能执行的动作。

## JD 关联约束

`jdConnections[]` 不是泛化的岗位匹配分。每项必须包含：

- `jdRequirement`：JD 原始要求或忠实短述；
- `status`：`direct | partial | unresolved | contradicted`；
- `experienceEvidence`：`demonstrated | partial | not_shown | not_applicable`。只有题目要求证明经历、能力或判断时，`not_shown` 才表示需要补齐个人证据；纯知识、法规、计算或假设情景题使用 `not_applicable`，不得机械要求简历引用；
- 至少一条 `jd` 来源；
- 至少一条非 `jd` 来源，用来说明候选人的回答或材料如何回应该要求。

只有两份互相冲突的引用存在时才能使用 `contradicted`。没有候选人证据时使用 `unresolved`，不得写成候选人没有能力。

## 优先改进与下一条追问

`priorityImprovement` 只允许一个，包含：观察、具体动作、重答约束、成功信号、来源和关联观察 ID。这样页面可以直接提供“一次重答”入口。

`nextFollowUp` 也只允许一个。`intent` 取值为：

- `why`
- `alternatives`
- `metric_validity`
- `personal_contribution`
- `tradeoff`
- `counterfactual`
- `failure_learning`
- `stakeholder_tension`

题目来源 `origin` 取值为 `source_question | source_derived | coach_generated | user_requested`。网页必须展示来源类型，不能把 AI 生成题伪装成公司真题。

## 空值与限制

五类观察数组可以为空，但字段不能缺失。模型不能为了填满页面而制造问题。

以下情况写入 `limitations[]`：

- 没有完整 JD；
- 简历未提供或内容不足；
- 回答过短，无法作出某类观察；
- 面经目标未分类；
- 数字、职责、结果尚未由用户确认；
- 转写文本存在说话人或词语不确定性。

## 兼容策略

- V5 本地状态只保存 `review: EvidenceReviewV1 | null`，不再读取、展示或导出旧 `ScoreResult`。
- 从 V4 及更早版本恢复时保留岗位、JD、简历、题库与回答，但丢弃旧 `score`，避免把分数结果伪装成证据审阅。
- DeepSeek 返回必须先通过 `parseEvidenceReview`，再核对每条直接引文是否逐字存在于对应材料，全部通过后才返回网页。

## 禁止项

- 总分、维度分、通过率、Offer 概率或候选人排名；
- 把“没有说”改写成“没有经历／没有能力”；
- 无来源的事实性评价；
- 跨公司、跨岗位、跨方向混用材料；
- 同时给出多道“下一条追问”；
- 用表达润色掩盖事实缺口。

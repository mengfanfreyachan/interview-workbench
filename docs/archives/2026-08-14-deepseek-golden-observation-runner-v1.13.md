---
date: 2026-08-14
status: confirmed
tags:
  - interview-workbench
  - deepseek
  - golden-case
  - observation
  - privacy
---

# DeepSeek 三类 Golden Cases 观察 Runner V1.13

## 目标

在 V1.12 确定性 Golden Cases 之外，建立一条可审计但不进入自动回归的真实 DeepSeek 观察路径，用统一口径判断产品、运营、法务三类智能组题质量，并完成第一轮单次观察。

## 已实现

- `scripts/run-question-composition-observation.ts`：开发期 runner，要求显式传入 `--confirm-live`，默认拒绝 CI。
- `src/question-composition-observation.ts`：统一 Rubric、脱敏观察结构和 Markdown 渲染。
- `src/question-composition-observation.test.ts`：验证正常部分成功、跨岗位／未知来源失败和报告不泄露完整材料。
- `npm run observe:composition -- --confirm-live --output <path>`：产品、运营、法务三案串行各调用一次真实智能组题桥接。

runner 直接复用生产组题桥接及其来源校验，不另造一套模型协议。每案最多一次调用，失败即记录，不重试、不并发、不择优。

## 统一 Rubric

机器门禁包含：

1. 输出保持 1–12 道；
2. 来源 ID、类型和归一化引文可核验；
3. `source_question`、`source_derived`、`coach_generated` 标记符合协议；
4. 精选面经原题逐字一致；
5. 仅引用当前岗位材料；
6. 标题归一化后不重复；
7. 单题保持单一焦点；
8. 简历题与岗位能力题都有覆盖；
9. 个别题失败时保留有效结果和 warning。

人工审阅统一记录岗位相关性、深挖价值和覆盖平衡。机器门禁负责证据与结构安全，人工审阅负责题目是否真正有面试价值，两者不能互相替代。

## 脱敏与运行边界

- 输入只使用 V1.12 的虚构、组合式 Golden fixtures。
- 报告保留输入 SHA-256 短指纹、模型名、题目标题、来源类型／ID、引文计数、warning code 和 Rubric 结论。
- 不保存或打印 API Key、完整 JD、完整简历、完整面经正文和原始模型响应。
- 观察命令不属于 `npm test` 或 `npm run test:ui`，不会因日常开发和 CI 意外产生费用。
- 每轮产生新的报告文件；不得覆盖旧轮次并通过重跑挑选更好输出。

## 第一轮真实观察

观察时间为 2026-08-14，模型为 `deepseek-v4-pro`。三类案例各调用一次，共 3 次；三案均成功，各保留 12 道有效题，服务端 warning 均为 0。

共同通过项：题量、来源完整性、provenance、面经原题逐字保留、岗位隔离、去重、两类题覆盖和有效结果保留。共同需要关注：少数题目包含双重追问，且每案前部都有 3 道近似“JD 提到……如何做到”的模板式派生题。

人工观察结论：

- 产品：岗位相关性和 5／7 的岗位能力／简历深挖配比可用，有 1 道 JD 与简历联合追问；需拆分职责与协作边界的双重追问。
- 运营：6／6 配比最均衡，指标、分层、预算约束和实验过程具有深挖价值；缺少 JD 与简历联合追问。
- 法务：合同、数据合规、风险沟通方向准确，但 4／8 配比偏向简历深挖，专业题缺少更多情境化法律判断，且有 2 道明显双重追问。

正式脱敏报告：`docs/observations/2026-08-14-deepseek-question-composition-golden-observation-v1.md`；同名 JSON 用于后续比较。

## 下一步

先调整组题提示和可确定性检查：减少模板式 JD 复述、强化单一焦点、增加法务情境题和类别配比约束。完成后生成第二轮独立报告，用同一 Rubric 比较，不修改或替换本轮结果。只有多轮稳定出现的问题才沉淀为新的 Golden fixture 或生产门禁。

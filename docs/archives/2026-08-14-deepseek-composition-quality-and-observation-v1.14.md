---
date: 2026-08-14
status: confirmed
tags:
  - interview-workbench
  - deepseek
  - question-composition
  - golden-case
  - observation
---

# DeepSeek 组题质量门禁与第二轮观察 V1.14

## 目标

根据 V1.13 首轮真实观察，减少模板式 JD 复述题，限制单题单一焦点，增强法务情境题和两类题配比，并使用同一批脱敏 Golden Cases 完成一次独立、不重试的第二轮观察。

## 实现

新增 `src/question-composition-quality.ts` 作为提示、服务端校验和观察 Rubric 共用的确定性质量规则：

- 识别只引用 JD 且使用“JD 提到……如何在实际工作中做到”模板的题目；
- 要求模型衍生题只有一个结尾问号和一个主要任务；
- 使用 NFKC、空白和有限标点归一化识别重复标题；
- 识别法务／法律／合规岗位及情境题；
- 统计简历深挖和岗位能力题数量。

组题桥接会在单题层跳过模板 JD、重复题和多焦点模型题。两类题都存在时，最终数量差不超过 2；裁剪从末尾非面经原题开始，保留逐字来源题。法务岗位提示至少生成 2 道带具体业务冲突或约束的 `role_capability` 情境题。

观察 Rubric 新增 `non_template_jd`、`category_balance` 和 `legal_scenario_coverage`。runner 支持读取上一轮脱敏 JSON，并生成独立 V1→V2 对比 Markdown；对比不读取 Key、完整材料或原始模型响应。

## 第二轮真实观察

2026-08-14 使用 `deepseek-v4-pro` 对产品、运营、法务各调用一次，没有重试：

| 案例 | 有效题 | 模板 JD | 多焦点 | 类别配比 | 法务模型情境题 |
|---|---:|---:|---:|---:|---:|
| 产品 | 8 | 0 | 0 | 简历 5／岗位 3 | 不适用 |
| 运营 | 8 | 0 | 0 | 简历 5／岗位 3 | 不适用 |
| 法务 | 6 | 0 | 0 | 简历 3／岗位 3 | 2 |

与首轮相比，三类模板 JD 题均从 3 降至 0，多焦点题均降至 0；法务配比从简历 8／岗位 4 改为 3／3，并新增 2 道模型情境题。

第二轮同时暴露了新问题：产品和运营各有 1 道 `coach_generated` 题逐字复制已精选面经原题，导致两案去重门禁失败。该结果保留在 V2 报告中，没有重跑。完成观察后新增 `DUPLICATE_QUESTION_TITLE` 服务端跳过规则及自动回归，因此后续相同输出会保留其他有效题并产生安全 warning。

法务情境题最初被统计为 0，根因是识别器没有覆盖“业务团队……”和“你发现……”开头；两道题本身均是具体情境。修正分类器并补测试后，报告按题面事实记为 2，不涉及模型重跑。

## 报告

- V1：`docs/observations/2026-08-14-deepseek-question-composition-golden-observation-v1.md`
- V2：`docs/observations/2026-08-14-deepseek-question-composition-golden-observation-v2.md`
- 对比：`docs/observations/2026-08-14-deepseek-question-composition-golden-v1-v2-comparison.md`

## 后续

不立即进行第三轮真实调用。先补页面级 warning 分类回归，确保用户能理解模板、重复、多焦点和来源校验跳过；之后再用新的独立报告验证包含重复题门禁的最终链路。

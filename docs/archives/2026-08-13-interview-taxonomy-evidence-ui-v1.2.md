---
date: 2026-08-13
status: completed
tags:
  - interview-workbench
  - question-taxonomy
  - evidence-review
  - visual-design
version: v1.2
---

# 面试题型收敛与经历佐证审阅 V1.2

## 已确认决策

- 主类别只保留 `resume_deep_dive`（简历题）与 `role_capability`（专业 / JD 题）。
- 面经原题不再是第三个能力类别，统一使用 `source_question` 来源标签并归入专业 / JD 题；旧 `experience_original`、`jd_capability`、`jd_resume_connection` 缓存按确定性规则迁移，不丢失题目或来源片段。
- DeepSeek 证据审阅增加“岗位关联与经历佐证”条件性检查：题目要求证明经历、能力或判断时，核对回答是否主动使用简历或本轮事实；纯知识、法规解释、计算或假设情景题可标记无需简历佐证。
- 审阅主要区块使用低饱和但差异明显的纸张绿体系色块，区分证据、事实缺口、风险和岗位关联。

## 数据与协议变化

- `QuestionCategory` 收敛为两项；旧枚举仅在恢复迁移函数中识别。
- `JdConnection.experienceEvidence` 取 `demonstrated | partial | not_shown | not_applicable`。
- 题目发送给模型时仍包含类别、JD、简历、来源片段和回答；来源账本与逐字引文校验保持不变。

## 验证

- 更新引擎、存储迁移、桥接提示词、协议校验、UI 标签与样式测试。
- 未真实调用 DeepSeek；按项目要求由本地测试模拟模型响应。

## Obsidian 同步

该归档以项目 `interview-workbench/docs/archives/` 为事实来源；受当前执行环境权限限制，未写入外部 Obsidian Vault。

## 尚未完成

- 真实用户缓存中若题目结构严重损坏，仍会按既有工作台恢复边界丢弃无效记录。

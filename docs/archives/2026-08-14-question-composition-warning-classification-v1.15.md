---
date: 2026-08-14
status: confirmed
tags:
  - interview-workbench
  - deepseek
  - warning
  - page-test
  - partial-success
---

# DeepSeek 组题 Warning 分类回归 V1.15

## 目标

把 DeepSeek 组题部分成功时笼统的“候选题或来源校验失败”提示，改成用户能区分具体原因的安全汇总，并通过页面级回归确认有效题目不受影响。

## 分类规则

`src/question-composition-warning.ts` 只读取 warning code，不显示服务端原始 message：

| 用户分类 | 主要 code |
|---|---|
| 模板式 JD 题 | `GENERIC_JD_RESTATEMENT` |
| 重复题 | `DUPLICATE_CANDIDATE_ID`、`DUPLICATE_QUESTION_TITLE` |
| 包含多个问题的题 | `MULTI_FOCUS_QUESTION` |
| 来源或引文无法核验 | `INVALID_SOURCE_ID`、`UNVERIFIABLE_QUOTE`、`SOURCE_QUOTE_MISMATCH`、`MISSING_SOURCE`、`RESUME_SOURCE_REQUIRED`、`SOURCE_QUESTION_IMPERSONATION` |
| 配比调整 | `CATEGORY_BALANCE_LIMIT` |
| 其他质量问题 | 未识别的新 code |

多条同类 warning 会合并计数，并按固定顺序显示。例如：`已安全跳过 4 道：模板式 JD 题 1 道、重复题 1 道、包含多个问题的题 1 道、来源或引文无法核验的题 1 道。现有有效题目不受影响。`

## 页面级回归

既有 DeepSeek 部分成功流程扩展为一次返回四种 warning，同时保留两道有效题。测试确认：

- 四类用户文案及各自数量均显示；
- 服务端提供的原始 message 不出现在页面；
- 两道有效题继续显示并写入 localStorage；
- 面经原题和 `coach_generated` 标签保持正确；
- 请求仍只包含当前岗位来源，其他岗位资料不发送；
- 顶层完成通知继续显示有效题数和总跳过数。

此外，纯函数测试覆盖同类合并、固定顺序、配比分类、未知 code 兜底和空数组。

## 边界

本模块不改变服务端判题规则，不新增状态管理、数据库或服务，也不修改 V1/V2 真实观察结果。用户看到的是安全分类和数量，不是模型原文或内部异常详情。

## 下一步

先检查分类长文案在手机宽度下的换行、可读性和按钮布局，再决定是否发起第三轮真实观察。

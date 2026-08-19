---
date: 2026-08-14
status: confirmed
tags:
  - interview-workbench
  - architecture
  - react
  - use-cases
---

# 面试工作台页面 Use-case Hooks 拆分 V1.11

## 目标

在 V1.10 四条页面核心流程保护下，把导入、采集、组题、审阅、训练状态转换和备份从 `App.tsx` 逐组下沉。持久状态继续由既有 controller 管理，不引入 Redux、Zustand、数据库或新服务，也不把所有流程重新集中进一个巨型 controller。

## 最终边界

| 模块 | 单一职责 |
|---|---|
| `use-workbench-controller.ts` | localStorage 恢复／保存、持久状态 patch 和当前岗位派生数据 |
| `use-material-import-actions.ts` | JD、面经文本、Agent JSON 与简历文件导入 |
| `use-experience-collection.ts` | 搜索词交互、一次受限采集、四阶段结果与来源归档 |
| `use-question-composition.ts` | 当前岗位材料拼装、本地规则组题与 DeepSeek 智能组题 |
| `use-deepseek-session.ts` | DeepSeek 配置状态与进程内会话 Key 生命周期 |
| `use-answer-review.ts` | 审阅请求、来源上下文、前序轮次、超时和错误 |
| `use-training-actions.ts` | 首轮会话、唯一追问、第二轮封闭、提前结束和历史写回 |
| `use-workbench-backup-actions.ts` | 备份文件预览、确认恢复、导出和清除 |
| `App.tsx` | 页面组合、面经库切换、题目选择和浏览器语音交互 |

共享的 Agent 来源转换进入 `experience-source-utils.ts`；采集状态与空统计进入 `collection-state.ts`；手动来源表单类型进入 `source-draft.ts`。这些模块不持有 React 状态。

## 逐组回归记录

每完成一组都运行 `npm run test:ui`，固定验证：

1. 备份预览后确认完整恢复；
2. 岗位切换后的 JD、面经和题库隔离；
3. 采集等待态与搜索命中／正文读取／真题提取／失败四阶段结果；
4. 首轮审阅／唯一追问／次轮审阅／自动保存的有界两轮训练。

六组最终都达到 4/4。逐组门禁实际捕获了两个迁移遗漏：

- 导入组第一次运行时，采集仍临时引用刚移出的来源转换函数，导致采集进入失败态；改为共享纯工具并重跑通过。
- 审阅组第一次运行时，进入追问仍残留已删除的旧错误 setter；Vitest 报告未处理异常，即使四条断言表面通过也没有视为成功，替换并重跑后无异常通过。

## 架构结果

- `App.tsx` 从 730 行降至 270 行。
- `App.tsx` 不再直接调用 Agent Reach / DeepSeek clients、题库生成引擎、训练状态机或备份解析器。
- 最大的新 use-case hook 为 147 行，且只覆盖本地与 DeepSeek 两条组题路径；没有形成新的全局状态中心。
- DeepSeek 审阅与训练转换通过完成回调连接：审阅 hook 不掌握训练状态机，训练 hook 不掌握网络请求。
- localStorage 仍统一经过 repository 与 controller；备份恢复仍坚持先写入成功、再替换内存状态。

## 验证结果

- `npm run check`：通过。
- `npm run test:ui`：每组迁移后均为 4/4；最终再次通过。
- `npm test`：13 个测试文件、92 项测试全部通过。
- `npm run build`：通过；仅保留既有 PDF.js 大 chunk 警告。

## 后续边界

面经库切换、题目选择和浏览器语音识别目前仍是页面级交互。只有在它们出现独立演进需求或需要新增流程保护时再提取。备份弹窗与面经库卡片可按展示职责迁移为组件，但不以继续减少 `App.tsx` 行数作为单独目标。

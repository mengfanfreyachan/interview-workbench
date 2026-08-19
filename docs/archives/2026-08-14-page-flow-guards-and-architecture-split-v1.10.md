---
date: 2026-08-14
status: confirmed
tags:
  - interview-workbench
  - testing
  - architecture
  - react
---

# 面试工作台页面流程保护与渐进架构拆分 V1.10

## 背景

V1.9 已建立 React 页面测试环境，并保护备份恢复与岗位切换隔离，但采集四阶段状态和有界两轮训练仍只有较低层测试。与此同时，`App.tsx` 同时承担持久状态、网络请求、业务流程和页面展示，后续修改容易扩大影响范围。

本次目标是在不改变产品范围、不增加运行组件的前提下，先补齐四条核心页面流程保护，再完成第一轮渐进拆分。

## 已确认决策

- 四条核心页面流程必须通过用户可见操作和结果验证，不读取 React 组件内部状态。
- 保持 Vite + React 本地优先模块化单体，不引入 Redux、Zustand、数据库、队列、微服务或其他新服务。
- `App.tsx` 继续作为页面编排层；持久状态和派生数据进入 controller，网络进入 clients，展示进入区域组件。
- 架构拆分以职责边界和回归风险为依据，不以文件行数本身为目标，也不把所有动作集中进新的巨型 controller。

## 新增页面级回归

### 采集四阶段状态

页面测试从用户点击采集开始验证：

1. 请求未完成时显示“采集中”；
2. 成功后分别展示搜索命中、正文读取、真题提取和读取失败；
3. 失败详情对用户可见；
4. 正文已读但部分提取失败时，有效来源仍保存到当前岗位资料。

固定响应统计为 20 条搜索命中、1 篇正文读取、2 道真题和 1 次失败，避免只验证笼统“成功”提示。

### 有界两轮训练

页面测试覆盖完整状态转换：

1. 回答主问题并获得首轮 DeepSeek 审阅；
2. 用户主动进入唯一追问；
3. 回答追问并获得第二轮审阅；
4. 会话自动封闭并写入训练历史与 localStorage。

测试同时验证第二次审阅请求携带首轮上下文，最终完成记录包含两轮问题、回答和审阅。该用例发现 UI 使用 `TURN-01` 判断轮次、而状态机实际生成 `TURN-1` 的不一致；现改为依据真实轮次顺序显示“主问题”和“唯一追问”。

## 第一轮架构拆分

- `src/use-workbench-controller.ts`：接管持久工作台状态、恢复／迁移／保存副作用、当前岗位数据和安全 patch 操作。
- `src/workbench-initial-state.ts`：承载脱敏样例状态、来源与初始题目。
- `src/api-client.ts`：统一同源 JSON 请求和安全错误解析。
- `src/agent-reach-client.ts`：承载小红书采集请求。
- `src/deepseek-client.ts`：承载配置状态、会话 Key、智能组题和回答审阅请求。
- `src/components/materials-section.tsx`：目标、JD、面经采集／导入和简历材料区。
- `src/components/question-bank-section.tsx`：题库筛选与选择。
- `src/components/practice-section.tsx`：DeepSeek 配置、作答、审阅和追问。
- `src/components/training-history-section.tsx`：已完成训练历史。

`App.tsx` 已不再直接调用 `fetch`，但仍保留导入、采集、组题、审阅、训练转换和备份等 use cases。它目前是可继续收敛的页面编排层，而不是已完成全部拆分。

## 验证结果

- `npm run check`：通过。
- `npm test`：13 个测试文件、92 项测试全部通过。
- `npm run test:ui`：4 条页面核心流程全部通过。
- `npm run build`：通过；仅保留既有 PDF.js 大 chunk 警告。

## 下一步

1. 在四条页面流程保护下，把导入、采集、组题、审阅、训练状态转换和备份操作逐项下沉到面向用例的 controller hooks。
2. 视职责边界提取面经库与备份区域，避免产生超大 props 或新的集中式 controller。
3. 每次迁移一组职责后运行四条页面回归和全量验证；不改变当前本地单用户、localStorage 与本机 bridges 的产品边界。

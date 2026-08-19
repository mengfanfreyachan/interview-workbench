---
date: 2026-08-14
status: confirmed
tags:
  - interview-workbench
  - react
  - testing
  - backup-restore
  - target-isolation
---

# React 页面测试环境与首批核心流程 V1.9

## 本模块解决的问题

面试工作台已有纯函数、存储、桥接和领域协议测试，但 `App.tsx` 的用户流程没有页面级保护。后续拆分 controller 和页面区块时，备份确认顺序或岗位隔离可能在底层测试仍通过的情况下发生回归。

## 已确认的测试策略

- 保持 Vitest 的默认 Node 环境，避免让现有桥接和纯函数测试无意义地进入浏览器模拟环境。
- 仅 React 页面测试通过文件环境进入 jsdom，并使用 React Testing Library、user-event 和 jest-dom。
- 页面测试从可访问名称定位输入框、按钮和对话框，通过用户上传与点击驱动流程，不读取 React 内部 state。
- 增加独立 `tsconfig.test.json`，使测试代码参与 `npm run check`。
- `npm test` 继续运行全部测试；`npm run test:ui` 提供页面流程的快速验证入口。

## 已覆盖流程

### 备份恢复

1. 上传有效 V6 JSON 备份。
2. 页面展示文件名以及公司岗位、来源和题库数量预览。
3. 确认前当前公司和工作台内容不改变。
4. 点击“完整替换并恢复”后，JD、面经、题库和当前岗位全部替换。
5. 恢复后的状态写入正式 localStorage 键，对话框关闭并显示成功提示。

### 岗位切换隔离

1. 从包含两个岗位资料的浏览器状态启动页面。
2. 当前岗位只显示自身 JD、面经和题库。
3. 从“我的面经库”打开另一岗位后，页面显示另一岗位 JD 和面经，并隐藏上一岗位来源与题库。
4. 页面明确显示其他岗位来源已隔离。
5. 切回原岗位后，原 JD、面经和题库仍然存在。

## 代码与依赖变化

- 新增 `src/App.test.tsx` 和 `src/test/setup.ts`。
- 新增 `vitest.config.ts` 与 `tsconfig.test.json`。
- 增加 `@testing-library/react`、`@testing-library/user-event`、`@testing-library/jest-dom` 和 `jsdom` 开发依赖。
- 增加 `npm run test:ui`，不新增生产依赖或运行组件。

## 验证

- `npm run test:ui`：2 项页面流程通过。
- `npm run check`：通过，包含测试 TypeScript 配置。
- `npm test`：13 个测试文件、90 项测试全部通过。
- `npm run build`：通过；保留既有 PDF.js 大 chunk 警告。

## 下一步

- 补充采集四阶段状态和有界两轮训练的页面级流程测试。
- 四条核心页面流程稳定后，再逐步拆分 `App.tsx`：先提取 controller 和 API clients，再移动材料、题库与训练区组件。
- 不在本阶段引入 Redux、Zustand、数据库或新服务。

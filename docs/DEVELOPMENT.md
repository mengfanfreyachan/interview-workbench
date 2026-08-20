# 开发说明

## 技术范围

面试工作台是一个 Vite、React 和 TypeScript 模块化单体。页面组件负责展示，面向用例的 hooks 负责导入、采集、组题、审阅、训练和备份流程，领域模块负责题目提取、岗位隔离、证据协议和数据迁移，本机 Vite bridges 负责 DeepSeek 与 OpenCLI 连接。

项目不使用 Redux、Zustand、数据库、队列或额外微服务。

## 常用命令

```bash
npm run dev
npm run check
npm test
npm run test:ui
npm run build
```

`npm run test:ui` 只运行 React 页面核心流程。`npm test` 同时运行纯函数、桥接和页面测试。

当前页面回归覆盖以下流程。

- 备份预览、确认恢复和无效文件保护
- 岗位切换后的材料、题库和训练记录隔离
- 面经采集四阶段状态与失败提示
- 本地来源化组题和 DeepSeek 单题失败容错
- DeepSeek 会话 Key 的配置、替换和移除
- 有界两轮训练
- 来源原文重读与重新识别
- 跨标签页数据更新提示

## Golden Cases

产品、运营和法务三类脱敏 Golden Cases 用于固定题目类别、逐字引文、岗位相关经历、追问切口、面经原题保真、跨岗位隔离、去重和单一问题边界。日常测试使用确定性本地引擎，不依赖真实 Key 或在线模型输出。

真实 DeepSeek 观察需要显式确认，并且不会进入日常测试或 CI。

```bash
npm run observe:composition -- --confirm-live --output docs/observations/YYYY-MM-DD-deepseek-question-composition.md
```

观察 runner 按产品、运营和法务三类案例各调用一次，不自动重试或择优。报告只保留虚构岗位、输入指纹、题目标题、来源标识、warning 和统一 Rubric 结果，不保存 Key、完整材料或原始模型响应。

## 代码和协议入口

- 页面编排见 [`src/App.tsx`](../src/App.tsx)
- 工作台状态边界见 [`src/use-workbench-controller.ts`](../src/use-workbench-controller.ts)
- 本地存储见 [`src/workbench-repository.ts`](../src/workbench-repository.ts)
- 备份恢复见 [`src/workbench-backup.ts`](../src/workbench-backup.ts)
- 面经题目提取见 [`src/interview-question-extractor.ts`](../src/interview-question-extractor.ts)
- DeepSeek 证据协议见 [`INTERVIEW_EVIDENCE_REVIEW_V1.md`](./INTERVIEW_EVIDENCE_REVIEW_V1.md)
- 完整技术交接见 [`HANDOFF.md`](../HANDOFF.md)

## 数据边界

用户数据保存在浏览器 `localStorage`，DeepSeek 会话 Key 只保存在本机服务进程内存。完整正文只在需要重新提取题目时短暂读取，不写入浏览器来源记录。备份不包含 Key、Cookie、浏览器配置或原始简历文件。

提交前应运行完整测试和构建，并检查 `.env.local`、`node_modules/`、`dist/`、浏览器数据、真实简历与临时观察输出没有进入 Git。

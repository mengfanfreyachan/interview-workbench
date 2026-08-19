---
date: 2026-08-19
status: confirmed
tags:
  - interview-workbench
  - open-source
  - release
  - local-first
version: v0.1.0
---

# 面试工作台 GitHub 本机开源首发 v0.1.0

## 发布范围

本版本面向从 GitHub 下载后由单个使用者在自己的电脑运行，不面向公网多人共享服务。代码、DeepSeek 会话 Key、Chrome 登录会话和浏览器工作台数据均保持在各自本机边界内。

## 开源交付

- 项目要求 Node.js 22 或更高版本，以 `npm install`、`npm run dev` 启动。
- DeepSeek 与 Agent Reach / OpenCLI 均为可选能力。没有 Key 或 OpenCLI 时，手动材料导入、本地简历解析、本地规则组题、题库筛选、JSON 备份与恢复仍可使用。
- 工作台数据保存在当前运行地址对应的浏览器 `localStorage`，键为 `xiangqian.interview-workbench.v6`。清理浏览器数据、更换环境或卸载前应先从页面右上角导出 JSON。
- 子项目采用与根仓库一致的 MIT License，可独立复制时继续携带许可文本。

## 第三方边界

- 项目与 DeepSeek、小红书、Agent Reach 或 OpenCLI 没有隶属、授权或背书关系。
- 使用者自行遵守法律、平台条款、API 规则和内容权利边界。
- 小红书能力只允许用户主动触发的、有界、只读、本机采集；不绕过登录、验证码或风控，不进行后台无人值守、批量抓取、评论、点赞或发布。
- DeepSeek 使用个人 Key。页面填写的 Key 只进入本机服务进程内存，不写入 localStorage、备份、日志或项目文件，停止服务后失效。

## 文档与依赖修正

- README 首屏新增安装、可选能力、本地数据迁移和第三方声明。
- `MIGRATION_MANIFEST.txt` 删除“尚无完整恢复入口”的过时描述，改为当前的校验、预览、确认后完整替换流程，并将 LICENSE 加入保留清单。
- 冷启动发现原开发目录通过父级环境间接获得 Node 类型；`package.json` 和锁文件现显式声明 `@types/node@^22`，避免独立下载后的构建漂移。

## 干净环境验收

验收目录通过 `rsync` 从项目复制，并明确排除 `node_modules/`、`dist/`、`.env.local`、coverage、日志和系统缓存。使用独立 npm 缓存执行 README 命令，避免复用项目或父目录依赖。

结果：

- `npm install` 成功，审计为 0 项已知漏洞；
- 16 个测试文件、125 项测试全部通过；
- 10 条页面核心回归覆盖备份恢复、岗位切换隔离、采集四阶段与失败提示、本地组题、DeepSeek 单题容错与会话 Key、两轮训练、来源重读和跨标签页刷新；
- `npm run build` 通过；
- `npm run dev -- --host 127.0.0.1 --port 4183 --strictPort` 冷启动成功；
- 首页与 `/api/deepseek/interview-analysis/status` 正常响应；
- 仅保留 PDF.js 生产 chunk 大于 500 kB 的非阻断警告。

## 已知非阻断项

- 采集覆盖报告仍需进一步分开搜索失败和正文失败，并在最后一轮高产搜索后追加有限饱和验证；首发文案不承诺“穷尽采集”。
- 扫描版、图片型和加密 PDF 暂不支持。
- 数据没有跨设备自动同步，迁移依赖用户主动导出和导入 JSON。

## 发布结论

当前版本满足 GitHub 本机单用户开源首发门槛。发布提交只包含 `interview-workbench/`，不混入 JobHunter 根仓库中的其他未完成改动。

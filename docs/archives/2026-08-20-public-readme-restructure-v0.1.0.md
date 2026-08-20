---
date: 2026-08-20
status: confirmed
tags:
  - interview-workbench
  - open-source
  - documentation
  - readme
version: v0.1.0
---

# 面试工作台公开 README 重排

## 背景

首发 README 同时承担产品介绍、安装、全部功能边界、测试报告、模型观察、架构说明和排障手册。公开仓库访问者需要先读大量维护信息，才能理解产品用途和启动方式。

## 本次调整

- README 改为产品首页，按产品用途、核心能力、快速开始、使用流程、可选集成、本地数据、当前边界和许可组织。
- 新增 1440px 桌面截图。截图来自独立端口的脱敏示例数据，没有读取使用者已有浏览器资料。
- 测试、Golden Cases 和架构入口移入 `docs/DEVELOPMENT.md`。
- 启动、端口、DeepSeek、OpenCLI、来源重识别、跨标签页和文件解析问题移入 `docs/TROUBLESHOOTING.md`。
- `.env.example` 和迁移清单删除对 JobHunter 父项目的公开依赖表述，保持独立仓库语境。

## 未改变范围

本次没有修改产品代码、存储格式、采集规则、DeepSeek 协议或运行组件。公开版本仍面向 GitHub 下载后的本机单用户使用，`v0.1.0` 版本号和首发标签保持不变。

---
date: 2026-08-11
status: completed
tags:
  - interview-workbench
  - deepseek
  - byok
  - security
version: v0.7
---

# DeepSeek 会话级 BYOK V0.7

## 模块目标

让开源本地用户在页面使用自己的 DeepSeek API Key，同时避免把 Key 写入浏览器持久化数据、导出文件或项目目录。

## 已确认行为

- 页面支持配置、更换和移除自己的 Key。
- Key 只保存在本机服务进程内存；页面刷新后仍可使用，服务停止或重启后失效。
- 会话 Key 优先于环境 Key，移除后自动回退。
- 状态只暴露 `session`、`environment` 或 `none`，从不返回 Key。
- 静态版本不开放配置；多人托管版本不得直接复用单进程会话方案。

## 安全控制

- 配置内容限制 16—256 个可打印 ASCII 字符。
- POST 只接受 JSON；浏览器写请求必须同源。
- Key 不进入 `localStorage`、工作台备份、日志、`.env` 或 Git。
- 配置和状态响应使用 `Cache-Control: no-store`。

## 验证

- 类型检查通过。
- 7 个测试文件、45 项测试通过。
- 已覆盖进程内覆盖、环境回退、响应脱敏、非法 Key 拒绝和跨站请求拒绝。
- 已使用虚构 Key 完成本机配置／移除闭环，未向 DeepSeek 发起测试分析。

## 当前边界

- 不主动调用 DeepSeek 验证 Key；密钥无效、余额不足或限流在用户实际分析时提示。
- 不提供持久保存、云同步、多人隔离或其他模型 BYOK。

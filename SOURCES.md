# 源码导读

全书实现说明锁定 [Pi 提交 71dca871](https://github.com/earendil-works/pi/tree/71dca871bc80b6bc97be37f0ca3189399d651fff)。下表提供阅读入口；章节中的行号链接定位更细的机制。

阅读源码时先找输入、状态变化、返回结果和错误路径，再追踪辅助函数。不要把文档中的愿景、示例注释和真正执行的代码当作同一种证据。

| 想核验的机制 | 源码入口 | 对应章节 |
| --- | --- | --- |
| 安装版本、Node 要求、npm 名称 | [package.json](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/package.json) | 1 |
| 初次使用、认证、常用命令 | [quickstart.md](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/quickstart.md) | 1 |
| 模型与工具循环、截断保护 | [agent-loop.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts) | 2、5 |
| 状态、消息队列、订阅者 | [agent.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent.ts) | 2 |
| Coding Agent 的装配 | [sdk.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/sdk.ts) | 2、6 |
| 系统提示、工具使用建议 | [system-prompt.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/system-prompt.ts) | 3 |
| 项目说明、系统文件、资源发现 | [resource-loader.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/resource-loader.ts) | 3、4 |
| Skill 发现、元数据和渐进披露 | [skills.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/skills.ts) | 3、8 |
| 压缩预算与切点 | [compaction.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/compaction/compaction.ts) | 3 |
| JSONL、树状历史、分支与恢复 | [session-manager.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/session-manager.ts) | 4、6 |
| 自动压缩与完整会话生命周期 | [agent-session.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/agent-session.ts) | 3、6、8 |
| 内建工具及其组合 | [tools 目录](https://github.com/earendil-works/pi/tree/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/tools) | 5 |
| 扩展 API、事件语义与工具定义 | [extensions/types.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/extensions/types.ts) | 6、8 |
| 多个扩展如何依次处理事件 | [extensions/runner.ts](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/extensions/runner.ts) | 3、6 |
| 子进程控制协议 | [rpc.md](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/rpc.md) | 6、7 |
| JSON 事件输出 | [json.md](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/json.md) | 8 |
| 项目信任与真实权限边界 | [security.md](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/security.md) | 1、6、7 |
| 技能与扩展的版本分发 | [packages.md](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/packages.md) | 6、8 |

## 建议的源码阅读顺序

第一次读源码，可以从 `createAgentSession()` 看装配，再沿 `Agent` 进入 `agent-loop.ts`。读懂一轮以后，选择一个最小工具，例如 `write.ts`，跟踪参数到磁盘的路径。接着回到 `session-manager.ts` 看结果如何保存，最后看压缩与扩展怎样改变下一轮输入。

仓库还包含较新的持久化 harness 等运行路径。本书主要解释终端 Coding Agent 经 SDK 使用的常见路径；涉及另一路径时会明确指出。相似名称不代表所有默认值和调度保证完全一致。

## 异步机制的外部对照

第二章比较的是 Pi 固定版本的常规循环与其他消息协议，不能仅凭模型名称推导宿主行为。以下官方资料核对日期为 2026-09-14：

- [OpenAI 异步工具调用](https://developers.openai.com/api/docs/guides/async-tool-calling)：核验 Astra 的异步工具定义、执行责任与结果关联方式。
- [gpt-realtime 官方发布说明](https://openai.com/index/introducing-gpt-realtime/)：说明异步函数调用并非只存在于 Astra，具体支持要结合模型与 API 判断。

这些网页会更新；本书未把官方 API 能力当作已经在 Pi 路径中实测启用的能力。

## 结论强度

源码能证明某条路径实现了什么，不能独自证明某种设计在所有模型上更可靠。书中关于减少转义、分段读取、独立验收等论证，是从接口与故障方式得出的工程分析；涉及效果提升，需要用自己的任务集验证。

[返回目录](README.md)

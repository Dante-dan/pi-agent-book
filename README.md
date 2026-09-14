# Pi Agent从入门到精通

**从第一次运行开始，读懂一个 Agent 如何观察、行动、记忆与扩展。**

一本面向零基础读者的中文开源书。以 Pi 的实际源码为依据，解释 LLM、上下文与工具怎样组成可运行的 Agent，再逐步拆解上下文工程、会话记忆、工具契约、扩展生命周期和持续改进。

不要求你读过其他 Agent 教材。前两章从终端使用和基本概念开始；后续机制配有伪代码、Mermaid 图与固定版本源码链接。需要 TypeScript 或 JSON 概念时，会就地解释。

## 开始阅读

| 章节 | 这一章解决什么问题 |
| --- | --- |
| [第一章　认识 Pi，完成第一个任务](book/01-first-agent.md) | Agent、模型、Harness 和环境分别是什么？如何安装并完成一次可核验的修复？ |
| [第二章　从一次对话到一个运行系统](book/02-runtime.md) | 模型、工具和状态怎样构成循环？流式事件、并发、取消和队列意味着什么？ |
| [第三章　上下文工程](book/03-context-engineering.md) | 系统提示、项目说明、Skills、消息变换和压缩怎样决定模型看见什么？ |
| [第四章　记忆与知识库](book/04-memory.md) | 会话树保存什么？用户记忆有哪些边界？外部检索与知识更新怎样接入？ |
| [第五章　工具设计](book/05-tools.md) | 为什么保留 read/write/edit？如何处理参数、搜索、截断、多模态、并行与工具发现？ |
| [第六章　扩展与生命周期](book/06-extensibility.md) | 怎样接入业务工具、规则和可恢复状态，做到不必 fork 内核？ |
| [第七章　从编码助手到通用 Agent](book/07-general-agent.md) | 为什么代码与文件是通用任务的基础？如何组织报表、知识助理和协作？ |
| [第八章　持续进化](book/08-evolution.md) | 怎样把失败轨迹转成知识、Skill 或程序，并证明改进有效？ |

第一次接触 Agent，建议按顺序阅读。已经会用 Pi，可以从第三章开始，再按源码索引深入实现。**“精通”在这里指能够解释机制、选择扩展位置并验证行为，不是记住全部 API。**

## 动手练习

安装 Node.js 22.19.0 或更高版本后，在本仓库根目录运行：

```bash
node examples/order-report/setup.mjs
cd .workshop/order-report
node check.mjs
```

初始检查失败是预期行为。接着按[第一章](book/01-first-agent.md)安装、登录并让 Pi 修复程序。练习只含虚构订单，无第三方依赖。

已有或准备申请模型账户，可以运行[真实模型配套实验](examples/live-model/README.md)：真实修复、Skill 自动与显式加载对照、跨进程会话续接。脚本默认 dry-run，加 `--execute` 才请求模型，并保存轨迹与独立验收结果。

暂时没有模型账户，也可以验证样例与参考修复：

```bash
node examples/order-report/selftest.mjs
```

详见[练习说明](examples/order-report/README.md)。第五章另附[真实工具契约实验](examples/tool-contract/README.md)，无需模型账户即可验证 read/write/edit 的行为。书中的其他伪代码用于说明设计；除明确标为可运行的命令和配套文件外，不应直接当作 Pi API 使用。

## 版本与证据

- 源码核验日期：**2026-09-14**。
- 官方仓库：[earendil-works/pi](https://github.com/earendil-works/pi)。
- 固定源码提交：[`71dca871bc80b6bc97be37f0ca3189399d651fff`](https://github.com/earendil-works/pi/tree/71dca871bc80b6bc97be37f0ca3189399d651fff)。
- 该快照的 Coding Agent 包版本：`0.85.1`，包名 `@earendil-works/pi-coding-agent`。

正文区分三种内容：**Pi 内建行为、需要实现的扩展方案、一般工程建议**。例如，Pi 有会话持久化，但没有默认自动维护用户画像的完整流水线；内建搜索有数量限制，但不因此具备游标分页；项目信任控制资源加载，但不提供操作系统沙箱。

源码快照和同版本 npm 发布包分别核验；包版本号本身不证明二者逐文件相同。实现细节以固定源码链接为准。实际验证范围见[核验记录](VERIFICATION.md)，按问题查源码见[源码导读](SOURCES.md)，遇到陌生词可查[术语表](GLOSSARY.md)。

## 本地检查与贡献

```bash
python3 scripts/check-book.py
node examples/order-report/selftest.mjs
```

若同时克隆了对应 Pi 源码，可进一步检查每个源码链接的路径与行号：

```bash
python3 scripts/check-book.py --pi-source /path/to/pi
```

修正文中事实时，请附上对应版本的源码或可重复观察。更新版本时应一并核对参数、默认值与生命周期，避免只替换版本号。详见[贡献说明](CONTRIBUTING.md)。

## 许可

正文及原创图示采用 [CC BY 4.0](LICENSE)，配套原创程序采用 [MIT](LICENSE-CODE)。转载正文请保留书名、作者署名、项目链接、许可链接，并标明修改。Pi 的名称与上游代码属于各自权利人；本书为独立教程，不是官方文档。

作者署名：**Dante-dan**。

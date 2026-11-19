# Pi Agent从入门到精通

**简体中文** | [English](en/README.md)

**从第一次运行开始，读懂一个 Agent 如何观察、行动、记忆与扩展。**

> 🎮 **新：[π 工坊](https://pi.duanjl.com/)** —— 把这本书做成了一个能玩的 3D 小游戏。你是空间站的 Harness 设计师：接任务、装零件、查事故，在失败里把 Agent 的概念一个个逼出来。不用注册，不用 key。源码在 [`playground/`](playground/)。
>
> 现在这本书分两层：**[操作手册](manual/)** 跟着游戏走，用来入门和理解；**教材**（下面的章节）用来巩固和深入。推荐先玩一站、边玩边翻手册，再读教材。教材已按游戏的十站加一个沙盒专题重新编排：**教材第 N 章就是第 N 站的深入版**。重排之前的 8 章旧版归档在 [`archive/book-v1/`](archive/book-v1/README.md)。

一本面向零基础读者的中文开源书。以 Pi 的实际源码为依据，解释 LLM、上下文与工具怎样组成可运行的 Agent，再按李博杰《深入理解 AI Agent》的十章顺序，逐步拆解上下文工程、记忆与知识库、工具、Coding Agent、交互、评估、后训练、持续进化和多 Agent 协作，最后用一个专题讲沙盒与隔离。

不要求你读过其他 Agent 教材。第一章从终端使用和基本概念开始；每章先给阅读路线，告诉你手册里的哪个零件在本章哪一节接着讲，练习后给具体参考答案；后续机制配有类 JavaScript 伪代码、Mermaid 图与固定版本源码链接。需要 TypeScript 或 JSON 概念时，会就地解释。

## 开始阅读

| 章节 | 对应游戏 | 这一章解决什么问题 |
| --- | --- | --- |
| [第一章　AI Agent 入门](book/01-agent-loop.md) | 第 01 站　缸中之脑长出手 | Agent = LLM + 上下文 + 工具，三样各管什么？ReAct 循环怎么转、何时停？从 Demo 到产品，Harness 要补哪五样？ |
| [第二章　上下文工程](book/02-context.md) | 第 02 站　货舱管理学 | API 无状态、每轮重发，KV Cache 怎样反过来约束提示的写法？系统提示、Skill、状态栏、压缩和隔离各管什么？ |
| [第三章　用户记忆与知识库](book/03-memory.md) | 第 03 站　好记性与烂笔头 | 会话结束后它还记得什么？从记忆到知识库、存储格式一路演化，最后才是 RAG：关键词、向量、混合检索、图谱 |
| [第四章　工具](book/04-tools.md) | 第 04 站　十八般兵器 | 工具是一份契约：说明书怎么写、参数怎样原样送到、截断怎样明说、超时之后怎样做到幂等？ |
| [第五章　Coding Agent 与通用 Agent](book/05-coding.md) | 第 05 站　会写代码的万能工 | 为什么通用 Agent 的核心是代码加文件系统？完成闸门、执行边界、故障分类与熔断，以及 Pi 的扩展机制 |
| [第六章　交互：观察与动作空间](book/06-interaction.md) | 第 06 站　耳目与手脚 | 打破“轮流说话、世界静止”：异步事件、语音、Computer Use 的坐标与关键帧、机器人的闭环控制 |
| [第七章　Agent 的评估](book/07-evaluation.md) | 第 07 站　拉出来遛遛 | 评估对象是模型加 Harness；验证器查世界不听汇报，pass@k 与 pass^k，防泄漏、轨迹归因、回归与显著性 |
| [第八章　模型后训练](book/08-training.md) | 第 08 站　回炉重造 | 什么时候才该动模型？能力探针、环境、奖励挂在哪儿、钻漏洞与路径约束 |
| [第九章　持续进化](book/09-evolution.md) | 第 09 站　吃一堑长一智 | 怎样把失败变成知识、Skill 或程序，经验怎样发布、回滚和退役，可信根为什么不能被提案修改 |
| [第十章　多 Agent 协作](book/10-multi-agent.md) | 第 10 站　三个臭皮匠 | 多一个 Agent 要带来新信息；共享上下文与否、三种拓扑、数据平面与控制平面、移交与六类失败 |
| [专题　画地为牢：沙盒与隔离](book/s-sandbox.md) | 沙盒专题　画地为牢 | 假设 Agent 已经被带偏：挂载清单、出口白名单、命令语义解析、隔离层级，以及 Pi 内建了什么、没内建什么 |

第一次接触 Agent，建议按顺序阅读。已经会用 Pi，可以直接挑感兴趣的一站，先玩再读对应章节，再按源码索引深入实现。**“精通”在这里指能够解释机制、选择扩展位置并验证行为，不是记住全部 API。**

正文之外还有一组[延伸阅读](book/notes/README.md)，收录从主线分叉出去的话题：其他控制结构的兴衰、其他产品的设计取舍，以及模型能力变化怎样改变 Harness。正文在分叉处留有链接，笔记开头也注明它从哪里分叉出来，可以顺着链接在两边来回阅读。

## 贯穿案例

想象你正在开发一套电商订单系统，团队刚把新的结账页开放给一部分用户。这时负责人说：“新版上线后，退款好像变多了。帮我查一下是不是改版造成的，明早要决定要不要恢复旧版。”你手上有订单、客服记录和发布说明，但还没有查清它们之间的关系。

把这项工作交给 LLM，需要让它读取实际资料、确认“退款”的含义、用程序核对数字，并判断现有证据能支持什么结论。负责人中途补充要求时，它还要调整调查计划。全书会围绕这些具体需要讲解 Pi 的设计，并在[第五章](book/05-coding.md#t-code-case)完成调查推演。[配套实验](examples/investigation/README.md)提供分阶段资料和参考答案。

初次动手时，我们先从下面的小型订单修复开始，熟悉读取文件、修改程序和运行检查，再逐步进入完整调查。

## 动手练习

安装 Node.js 22.19.0 或更高版本后，在本仓库根目录运行：

```bash
node examples/order-report/setup.mjs
cd .workshop/order-report
node check.mjs
```

初始检查失败是预期行为。接着按[第一章](book/01-agent-loop.md)安装、登录并让 Pi 修复程序。练习只含虚构订单，无第三方依赖。

已有或准备申请模型账户，可以运行[真实模型配套实验](examples/live-model/README.md)：真实修复、Skill 自动与显式加载对照、跨进程会话续接、每次调用模型前的上下文选材。脚本默认 dry-run，加 `--execute` 才请求模型，并保存轨迹与独立验收结果。

暂时没有模型账户，也可以验证样例与参考修复：

```bash
node examples/order-report/selftest.mjs
```

详见[练习说明](examples/order-report/README.md)。第五章另附[真实工具契约实验](examples/tool-contract/README.md)，无需模型账户即可验证 read/write/edit 的行为。书中的其他伪代码用于说明设计；除明确标为可运行的命令和配套文件外，不应直接当作 Pi API 使用。

## 版本与证据

安全更新：工具契约实验现使用 Pi 1.5.0，并在 CI 中运行依赖审计。正文与原真实模型实验仍是 0.87.1 的历史快照；用于复现的旧版安装命令不是当前安全版本推荐。请先阅读[安全说明](SECURITY.md)。

- 源码核验日期：**2026-11-01**。本书原先依据 0.85.1 之后的提交 `71dca871`，现已升级到 v0.87.1 并逐条重新核对。
- 官方仓库：[earendil-works/pi](https://github.com/earendil-works/pi)。
- 固定源码提交：[`f07218c4d4bbc12bef056a7058c3dd49dfe41abe`](https://github.com/earendil-works/pi/tree/f07218c4d4bbc12bef056a7058c3dd49dfe41abe)。
- 该快照的 Coding Agent 包版本：`0.87.1`，包名 `@earendil-works/pi-coding-agent`。

正文区分三种内容：**Pi 内建行为、需要实现的扩展方案、一般工程建议**。例如，Pi 有会话持久化，但没有默认自动维护用户画像的完整流水线；内建搜索有数量限制，但不因此具备游标分页；项目信任控制资源加载，但不提供操作系统沙箱。

源码快照和同版本 npm 发布包分别核验；包版本号本身不证明二者逐文件相同。实现细节以固定源码链接为准。实际验证范围见[核验记录](VERIFICATION.md)，按问题查源码见[源码导读](SOURCES.md)，遇到陌生词可查[术语表](GLOSSARY.md)。

## 参考与致谢

本书的写作主要参考了以下两个开源项目：

- **[Pi 源码与官方文档](https://github.com/earendil-works/pi)**：是本书拆解运行时、上下文处理、工具、会话树和扩展机制的主要实现依据。正文中的机制说明链接到上述固定提交，方便读者对照源码核验。
- **李博杰的 [《深入理解 AI Agent：设计原理与工程实践》（AI Agent Book）](https://github.com/bojieli/ai-agent-book)**：为本书的章节组织与分析思路提供了重要参考，尤其是 Agent 与 Harness 的关系、上下文工程、记忆、工具设计、Coding Agent 与通用 Agent，以及持续进化等主题。本书吸收这些观点，以 Pi 的实际实现、具体案例与配套练习重新展开讲解。

感谢两个项目的作者与贡献者公开分享源码、知识和工程经验。本书为独立编写的学习材料，相关解释与案例由本项目负责，不代表上述项目的官方立场。

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

## Star 趋势

<a href="https://www.star-history.com/#Dante-dan/pi-agent-book&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Dante-dan/pi-agent-book&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Dante-dan/pi-agent-book&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Dante-dan/pi-agent-book&type=Date" />
  </picture>
</a>

## 许可

正文及原创图示采用 [CC BY 4.0](LICENSE)，配套原创程序采用 [MIT](LICENSE-CODE)。转载正文请保留书名、作者署名、项目链接、许可链接，并标明修改。Pi 的名称与上游代码属于各自权利人；本书为独立教程，不是官方文档。

作者署名：**Dante-dan**。

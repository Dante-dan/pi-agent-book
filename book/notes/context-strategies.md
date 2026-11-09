# 模型看不全的时候：检索、长上下文与隔离

**简体中文** | [English](../../en/book/notes/context-strategies.md)

[返回延伸阅读](README.md) · [返回目录](../../README.md)

> **从哪里分叉出来**：[第三章 3.1 上下文窗口不是整个项目的内存](../03-context-engineering.md#31-上下文窗口不是整个项目的内存) · [第三章 3.6 压缩](../03-context-engineering.md#36-压缩把旧过程整理成可继续工作的交接)
> **前置概念**：上下文窗口、token、压缩（第三章）
> **继续阅读**：[记忆的几种形状](memory-shapes.md) · [多 Agent 的兴衰](multi-agent.md) · [第五章 5.4 搜索给线索，读取给证据](../05-tools.md#54-搜索给线索读取给证据)
> **资料核验日期**：2026-11-09

退款调查要用的资料有订单表、几百条客服记录、发布说明，再加上几个月的历史讨论，加起来远远超出一次请求能放下的量。第三章讲了 Pi 的做法：项目说明在开头加载，需要时再读文件，历史太长就压缩。这一套做法并不是理所当然的。过去几年，“模型看不全”这个问题先后有过几种主流答案，每一种都和当时模型的窗口大小、读长文的能力有关。

## 四种做法

| 做法 | 资料怎样进入上下文 | 由谁决定读什么 | 典型时期 |
| --- | --- | --- | --- |
| 预先检索（RAG） | 请求前先查索引，把相关片段放进去 | 检索程序 | 2020 年起，窗口只有几千 token 的时候 |
| 全部放入 | 窗口足够大，整份资料直接放进去 | 没人取舍 | 2024 年起，百万 token 窗口出现 |
| 即时检索 | 模型用 `grep`、`read` 一类工具自己找、自己读 | 模型 | 编码 Agent 普及之后 |
| 压缩与隔离 | 旧过程压成摘要，或交给另一个上下文去读，只带回结论 | 宿主与模型共同决定 | 长任务成为常态之后 |

这四种做法互相并不排斥，今天的系统大多是组合使用。理解它们各自出现的原因，才能判断自己的任务该用哪一种。

## 预先检索：窗口太小时的唯一出路

2020 年的 RAG 论文把“先检索、再生成”确立为一种通用方法：用检索器从外部语料中找出相关段落，再交给生成模型作答。[RAG](https://arxiv.org/abs/2005.11401) 到了 2023 年，大多数模型的窗口只有几千到几万 token，一份稍长的文档都放不下。想让模型回答公司内部资料里的问题，几乎只能先切块、建向量索引、按相似度取前几段。向量数据库的热潮也是在这时兴起的。

这套做法的长处一直都在：语料再大也只需要取一小部分，成本稳定，延迟也低。问题在于，取什么由检索程序在模型看到资料之前决定。第四章讲过切块的风险：“金额单位为分”这句话被切到下一块，前一块的数字就会被误读。[第四章 4.6](../04-memory.md#46-从文件记忆走向外部知识库) 检索程序不知道模型接下来要推理什么，模型也没有机会说“这一段不够，再给我看前面一节”。

## 长上下文：放得下，不等于用得好

2024 年 2 月，Google 发布 Gemini 1.5 Pro，向部分开发者开放实验性的 100 万 token 窗口。[Google：Gemini 1.5](https://blog.google/technology/ai/google-gemini-next-generation-model-february-2024) 于是出现了“RAG 已死”的说法：既然整个代码库、整本手册都能放进去，还切块做什么？

研究给出的答案更谨慎。2023 年的《Lost in the Middle》发现，相关信息位于输入的开头或结尾时，模型表现最好；位于中间时，表现明显下降。[Lost in the Middle](https://arxiv.org/abs/2307.03172) 2025 年 Chroma 测试了 18 个模型，结论是：模型并不均匀地使用上下文，输入越长，表现越不可靠。[Chroma：Context Rot](https://www.trychroma.com/research/context-rot) Anthropic 把这种现象称为 context rot，并把上下文比作有限的“注意力预算”：每多一个 token，都在消耗这份预算。[Anthropic：Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

除了质量，还有成本和时间。把 50 万 token 全部放进去，每次请求都要为它付费、等待。对 Agent 来说更明显：循环里的每一轮都要重新发送上下文，第二章讲过这一点。

所以长上下文并没有取代检索，它改变的是取舍的粒度：过去只能放几段，现在可以放几份完整文件。真正的问题从“放不放得下”变成了“该放什么”。

## 即时检索：编码 Agent 的选择

Anthropic 在同一篇文章里描述了一种转向：不再在推理前用嵌入检索把资料准备好，而是让 Agent 只保留轻量的线索，比如文件路径、查询语句，运行时再用工具加载需要的内容。文中以 Claude Code 为例：`CLAUDE.md` 在开头直接放入上下文，其余文件则用 glob、grep 一类工具即时查找和读取，这样就绕开了索引过期和复杂语法树的问题。文章也指出，这种方式比预先检索慢，而且依赖好的工具设计。[Anthropic：Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

Pi 采用的是同样的组合：`AGENTS.md` 在开头加载，见[第三章 3.3](../03-context-engineering.md#33-agentsmd把项目知识放在项目旁边)；其余资料由模型通过 `grep`、`find`、`read` 按需取得，见[第五章 5.4](../05-tools.md#54-搜索给线索读取给证据)。Pi 核心没有代码向量索引。

为什么代码特别适合即时检索？有三个原因：

- **代码里有精确的名字。** 函数名、错误码、配置键都是可以直接匹配的字符串，语义检索在这里的优势不大。
- **文件一直是最新的。** 刚改过的文件立刻能搜到，不存在“索引还没重建”的时间差。
- **模型可以连续追问。** 第一次搜索结果不够，就换个关键词再搜，或者顺着 import 读下去。这正是第二章那个循环擅长的事情。

但这不等于向量检索在所有场景都过时了。资料不在文件系统里、规模大到无法逐个搜索，或者同一件事有许多种说法（如第四章的“报表合计有偏差”和“金额累计误差”），语义检索仍然有用，另一些编码工具也仍在为代码库建立语义索引。第四章的建议依然适用：先用实际查询验证收益，再决定是否引入。

## 压缩与隔离：在一次长任务里做减法

即时检索解决的是“读什么”，但读过的内容会留在历史里继续占空间。长任务走到一半，上下文里堆满了旧的工具输出。对此主要有两种处理办法。

**压缩**是把旧过程整理成摘要，保留近期消息，继续工作。Pi 的 compaction 就是这样，见[第三章 3.6](../03-context-engineering.md#36-压缩把旧过程整理成可继续工作的交接)。Anthropic 的 API 还提供了更细的 context editing：接近上限时自动清除过时的工具调用和结果。官方在一项 100 轮的网页搜索评估中报告，token 消耗减少了 84%。[Anthropic：Managing context](https://claude.com/blog/context-management) Cognition 则提到，他们为压缩历史专门微调过较小的模型，可见压缩本身就是一个难题。[Cognition：Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)

**隔离**是把“需要大量阅读才能回答的问题”交给另一个上下文。子 Agent 在自己的窗口里读完几十个文件，只把几百字的结论交回主会话。Pi 的子 Agent 扩展示例为每个子任务启动独立的 `pi` 进程，原因就在这里，见[第七章 7.6](../07-general-agent.md#76-协作为什么不是多开几个模型就够了)。这条路后来演变成了多 Agent 架构的主流形态，详见[多 Agent 的兴衰](multi-agent.md)。

两者都是有损的。摘要可能把“临时猜测”写成“确定结论”，子 Agent 的结论也可能漏掉主 Agent 恰好需要的细节。第三章的建议同样适用于隔离：精确值要保留原始来源，需要时重新读取。

## 怎样为一份资料选择进入方式

可以按资料的四个特征来判断：

| 资料特征 | 更合适的方式 |
| --- | --- |
| 很短，每次任务都要用（项目约定、指标定义） | 开头直接放入，如 `AGENTS.md` |
| 在文件系统里，有精确的名字可以搜索（代码、日志、配置） | 即时检索 |
| 规模很大，或者措辞多变（知识库、历史工单） | 预先检索，最好与即时读取原文配合 |
| 需要通读才能得出结论，但主任务只要结论 | 隔离到子任务 |
| 任务很长，早期过程已经不需要逐字保留 | 压缩，同时保留可回读的原始记录 |

这些选择背后是同一个判断：**上下文是有限的预算，要花在模型下一步真正需要看的东西上。** “上下文工程”这个名字就是从这个判断里来的，名字的演变见[从提示工程到 Harness 工程](prompt-context-harness.md)。

## 参考资料

- Lewis et al. [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401). 2020.
- Liu et al. [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172). 2023.
- Google. [Our next-generation model: Gemini 1.5](https://blog.google/technology/ai/google-gemini-next-generation-model-february-2024). 2024-02.
- Hong, Troynikov, Huber. [Context Rot: How Increasing Input Tokens Impacts LLM Performance](https://www.trychroma.com/research/context-rot). Chroma, 2025-07-14.
- Anthropic. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). 2025-09-29.
- Anthropic. [Managing context on the Claude Developer Platform](https://claude.com/blog/context-management). 2025-09-29.
- Walden Yan. [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents). Cognition, 2025-06-12.

# 记忆的几种形状：从向量库到一个文件夹

**简体中文** | [English](../../en/book/notes/memory-shapes.md)

[返回延伸阅读](README.md) · [返回目录](../../README.md)

> **从哪里分叉出来**：[第四章 4.1 先分清四种保存范围](../04-memory.md#41-先分清四种保存范围) · [第四章 4.6 从文件记忆走向外部知识库](../04-memory.md#46-从文件记忆走向外部知识库)
> **前置概念**：会话文件、`AGENTS.md`、检索（第三、四章）
> **继续阅读**：[模型看不全的时候](context-strategies.md) · [第四章 4.7 写入、冲突与遗忘](../04-memory.md#47-写入冲突与遗忘长期记忆的质量来自维护)
> **资料核验日期**：2026-11-09

第四章说过，Pi 提供会话文件和 `AGENTS.md`，但不内置长期记忆服务；想让它记住跨会话的事实，要由应用自己设计存储与检索。这个选择初看有些保守，毕竟“让 Agent 拥有记忆”曾是最热门的方向之一。

回顾这几年各家的做法，会发现记忆系统的形状一直在变：先是把一切写进向量库，然后是模仿操作系统的分层记忆，再到产品里用户可见的记忆条目，最后很多系统回到了一个普通的文件夹。每一次变化背后，都是对同一个问题的不同回答：**谁决定记什么，谁能看到并纠正它。**

## 2023 年：把一切写进向量库

2023 年春天，AutoGPT 一类自主 Agent 走红，它们普遍把“长期记忆”实现为向量数据库：每次观察、每个结果都转成向量存起来，需要时按相似度取回。项目支持 Pinecone、Redis、Milvus、Weaviate 等多种后端。

到了同年 6 月的 v0.4.0，AutoGPT 移除了 Milvus、Pinecone 和 Weaviate 后端，只保留本地 JSON 文件作为默认记忆。发布说明称，这是重构记忆系统期间为简化开发而采取的临时措施，Redis 也会在修复后重新加入。[AutoGPT v0.4.0 发布说明](https://github.com/Significant-Gravitas/AutoGPT/releases/tag/v0.4.0)

这件事常被转述成“AutoGPT 证明了向量数据库没用”，但发布说明并没有这样说。它能说明的是一件更朴素的事：把所有东西都存进向量库，并不会自动得到好用的记忆。存什么、什么时候取、旧信息怎样更新，这些问题并不会因为换了存储后端而消失。

## 研究中的两种设计：记忆流与分层记忆

同一年，有两篇论文给出了更完整的设计。

**Generative Agents** 让一群模拟角色在小镇里生活。每个角色有一条“记忆流”，按时间记录所见所闻。检索时综合三个分数：多近（recency）、多重要（importance）、与当前情境多相关（relevance）。角色还会定期“反思”，把零散的观察归纳成更高层的判断。[Generative Agents](https://arxiv.org/abs/2304.03442) 这说明光有相似度是不够的，时间和重要程度同样决定一条记忆该不该被想起。

**MemGPT** 借用了操作系统的思路：上下文窗口像内存，外部存储像磁盘，模型通过函数调用自己在两者之间搬运数据，从而在有限的窗口里提供“看起来更大”的上下文。[MemGPT](https://arxiv.org/abs/2310.08560) 这个设计把“记什么”的决定权交给了模型本身，而不是由外部程序每轮自动检索。

这两种思路后来都被吸收了：前者影响了“记忆需要打分和整理”的做法，后者影响了“记忆是模型主动调用的工具”的做法。

## 产品里的记忆：用户能看见的部分

面向普通用户的产品必须回答一个研究原型可以回避的问题：用户能不能看到、能不能改。ChatGPT 的记忆有两项设置：“参考已保存的记忆”对应用户明确要求记住、可以在设置中管理的条目；“参考聊天记录”在 2025 年 4 月起提供，让模型利用过去对话中的信息。关闭后者，从历史对话中学到的内容会被删除。[OpenAI：Memory FAQ](https://help.openai.com/en/articles/8590148-memory-faq)

前一类透明但需要维护，后一类方便但难以逐条审查。这正是第四章 4.7 讨论的写入、冲突与遗忘问题在产品层面的体现：记忆越自动，用户越难知道它为什么这样回答，也越难纠正错误。

## 回到文件夹：可读、可改、可追溯

编码 Agent 走向了另一个方向：记忆就是项目里的文件。

- **项目说明文件。** `CLAUDE.md`、`AGENTS.md` 这类文件放在仓库里，Agent 启动时读取。`AGENTS.md` 已成为多家编码工具共同支持的开放格式，2025 年 12 月由 OpenAI 捐赠给 Linux 基金会下的 Agentic AI Foundation。[OpenAI：Agentic AI Foundation](https://openai.com/index/agentic-ai-foundation/)
- **记忆工具。** Anthropic 在 2025 年 9 月推出 memory tool：Claude 在一个专门的目录里创建、读取、修改、删除文件，目录保存在开发者自己的基础设施上，工具由客户端执行。官方内部评估报告，记忆工具配合上下文编辑，比基线提高了 39%。[Anthropic：Managing context](https://claude.com/blog/context-management)
- **从错误中更新。** Mitchell Hashimoto 在 2026 年 2 月描述的做法是：Agent 每犯一次错，就把对应规则写进 `AGENTS.md`，或者写一个能自动指出错误的脚本。[My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey)

Pi 也在这一边：`AGENTS.md` 在启动时加载（[第三章 3.3](../03-context-engineering.md#33-agentsmd把项目知识放在项目旁边)），会话保存为可恢复的文件（[第四章 4.2](../04-memory.md#42-会话文件可恢复的工作记录)），长期记忆由扩展接入（[第四章 4.6](../04-memory.md#46-从文件记忆走向外部知识库)）。

文件之所以胜出，原因不在技术先进，而在于它把记忆的控制权交还给了人：

- **能读。** 打开文件就知道 Agent 记住了什么，不需要猜向量库里存了哪些片段。
- **能改。** 记错了直接编辑，不需要专门的删除接口。
- **能追溯。** 放进 git 就有版本历史，谁在什么时候改了哪条规则一目了然。
- **模型已经会用。** 读文件、搜文件本来就是编码 Agent 最熟练的操作，不需要额外的检索工具。

代价也很清楚：文件不擅长从海量记录中做语义召回，也不会自己清理过期内容。这时又要回到[模型看不全的时候](context-strategies.md)讨论的检索，以及第四章 4.7 的维护问题。

## 几种形状的对比

| 形状 | 代表 | 谁决定记什么 | 用户能否查看和纠正 | 主要弱点 |
| --- | --- | --- | --- | --- |
| 向量库 | 2023 年的自主 Agent | 程序自动写入一切 | 难 | 只按相似度取回，旧信息难以更新 |
| 记忆流加打分 | Generative Agents | 程序写入，按近度、重要度、相关度取回 | 难 | 打分规则需要调校 |
| 分层记忆 | MemGPT | 模型通过函数调用决定 | 取决于实现 | 依赖模型的判断是否可靠 |
| 产品记忆条目 | ChatGPT 已保存的记忆 | 用户要求记住的内容，可在设置中管理 | 能 | 条目多了以后维护成本高 |
| 文件 | `AGENTS.md`、memory tool、Pi | 人或模型写入文件 | 能，且有版本历史 | 不擅长海量语义召回 |

## 设计记忆前先问的三个问题

1. **谁写？** 由人写的规则（如 `AGENTS.md`）可靠但覆盖有限；由模型写的记忆覆盖广，但需要审查。不少系统两者都有，应该在存储上分开。
2. **谁读、何时读？** 每次都要用的放在开头加载，偶尔用到的让模型按需检索。两者混在一起，要么上下文过满，要么关键规则漏读。
3. **谁纠正？** 如果用户发现 Agent 记错了，应该有一个明确的地方可以改，改完以后可以验证生效。第四章练习 6 的验收方法就是为此设计的。

## 参考资料

- [AutoGPT v0.4.0 发布说明](https://github.com/Significant-Gravitas/AutoGPT/releases/tag/v0.4.0). 2023-06-05.
- Park et al. [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442). 2023.
- Packer et al. [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560). 2023.
- OpenAI. [Memory FAQ](https://help.openai.com/en/articles/8590148-memory-faq).
- Anthropic. [Managing context on the Claude Developer Platform](https://claude.com/blog/context-management). 2025-09-29.
- OpenAI. [Agentic AI Foundation](https://openai.com/index/agentic-ai-foundation/). 2025-12.
- Mitchell Hashimoto. [My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey). 2026-02-05.

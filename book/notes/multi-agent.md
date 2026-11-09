# 多 Agent 的兴衰：从“虚拟公司”到“主 Agent 加子任务”

**简体中文** | [English](../../en/book/notes/multi-agent.md)

[返回延伸阅读](README.md) · [返回目录](../../README.md)

> **从哪里分叉出来**：[第二章 2.7 从并行执行到异步 Agent](../02-runtime.md#async-execution) · [第七章 7.6 协作为什么不是多开几个模型就够了](../07-general-agent.md#76-协作为什么不是多开几个模型就够了)
> **前置概念**：工具并行、子 Agent、上下文窗口（第二、三章）
> **继续阅读**：[模型看不全的时候](context-strategies.md) · [谁决定下一步](control-structures.md)
> **资料核验日期**：2026-11-09

第七章用退款调查说明了多 Agent 协作要先约定什么：各自的目标、输入、产物、共享资源和失败处理。还举了一个反例：四行 CSV 的报告根本不值得拆成三个 Agent。

这个结论今天看来平常，但两三年前的主流想法正好相反。那时最引人注目的 Agent 演示，是一群扮演 CEO、产品经理、程序员、测试员的模型在“虚拟公司”里开会、写代码。这种设计后来大多被放弃，留下来的是一种更朴素的结构：一个主 Agent，在需要时把定义清楚的子任务交给隔离的上下文去完成。

## 2023 年：按角色分工

2023 年出现了一批有影响的多 Agent 框架：

- **CAMEL** 让两个模型分别扮演用户和助手，通过角色扮演协作完成任务。[CAMEL](https://arxiv.org/abs/2303.17760)
- **MetaGPT** 把软件公司的标准作业流程编码进多个角色，产品经理写需求、架构师做设计、工程师写代码。[MetaGPT](https://arxiv.org/abs/2308.00352)
- **ChatDev** 搭建了一家“虚拟软件公司”，各角色通过对话链分阶段完成设计、编码和测试。[ChatDev](https://arxiv.org/abs/2307.07924)
- **AutoGen** 提供通用框架，让开发者定义多个可对话的 Agent 及其交互方式。[AutoGen](https://arxiv.org/abs/2308.08155)

按角色分工在当时很有吸引力，原因有几个：

1. **单个模型撑不住长任务。** 窗口小，连续多步容易跑偏。把任务拆给多个角色，每个角色只看一小段，相当于用多个短上下文拼出一个长任务。
2. **拆角色就是拆提示词。** 一个提示词同时要求“写需求、做设计、写代码、做测试”，效果不好；拆成几个专注的提示词，每个都更容易写好。
3. **人类组织是现成的模板。** 公司怎么分工，大家都熟悉，照搬过来容易理解，演示效果也好。

## 失败在哪里

随着这些系统被用到真实任务上，问题逐渐显现。2025 年的论文《Why Do Multi-Agent LLM Systems Fail?》分析了 7 个流行框架的 1600 多条运行轨迹，指出多 Agent 系统在主流基准上的提升往往很有限。论文归纳出 14 种失败模式，分为三类：系统设计问题、Agent 之间不一致、任务验证不足。[Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657)

这三类问题正好对应第七章要求先约定的内容：设计问题对应目标和产物没说清，不一致对应共享资源和口径没对齐，验证不足对应没人负责验收。

## 2025 年 6 月的一场争论

2025 年 6 月，两篇文章前后只隔了一天，结论看起来正好相反。

**Cognition：《Don't Build Multi-Agents》**（6 月 12 日）。作者 Walden Yan 提出两条原则：一是共享上下文，而且要共享完整的 Agent 轨迹，不只是单条消息；二是行动本身带有隐含的决定，决定互相冲突，结果就会出错。文中的例子是做一个 Flappy Bird 小游戏：一个子 Agent 做背景，另一个做小鸟。前者误解任务，做出了马里奥风格的背景；后者做的小鸟风格也对不上。最后负责汇总的 Agent 只能面对两份互不相容的产物。文章建议默认使用单线程的线性 Agent；任务太长时，再用专门的模型压缩历史。[Cognition：Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)

**Anthropic：《How we built our multi-agent research system》**（6 月 13 日）。Anthropic 介绍了 Claude 的 Research 功能：Claude Opus 4 作为主 Agent，Claude Sonnet 4 作为子 Agent，在内部研究评估中比单个 Opus 4 高出 90.2%。但代价也很大：Agent 的 token 消耗约为普通对话的 4 倍，多 Agent 系统约为 15 倍；在 BrowseComp 评估中，单是 token 用量就解释了 80% 的表现差异。文章明确说，多 Agent 适合可以并行展开、信息量超过单个窗口的广度型任务；不适合需要所有 Agent 共享同一上下文、彼此依赖很多的任务，大多数编码任务就属于后者。[Anthropic：How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)

两篇文章其实并不矛盾。Cognition 反对的是**让多个 Agent 并行做相互依赖的决定**；Anthropic 支持的是**让多个 Agent 并行阅读互不依赖的资料**，再由一个主 Agent 做决定。两者都同意：决定应集中在一个地方，拆分的依据是上下文能否独立，而不是角色。

## 收敛：主 Agent 加隔离的子任务

今天主流编码 Agent 的子 Agent 设计，大多落在两篇文章的交集上。Cognition 在文中就以 Claude Code 为例：子 Agent 不与主 Agent 并行写代码，通常只回答一个定义清楚的问题；子 Agent 的调查过程不进入主 Agent 的历史，主会话因此能运行得更久。

Pi 的子 Agent 扩展示例也是这样设计的，见[第七章 7.6](../07-general-agent.md#76-协作为什么不是多开几个模型就够了)：

- 每个子任务在独立的 `pi` 进程中运行，拥有自己的上下文窗口。[源码：子 Agent 示例说明](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/examples/extensions/subagent/README.md#L1)
- 支持单个任务、并行（最多 8 个任务，同时运行 4 个）和链式三种模式；交回主会话的输出每个任务最多 50 KB。[源码：并行与输出上限](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/examples/extensions/subagent/index.ts#L33-L36)
- 示例里的 `scout` 角色专门做快速侦察，交回压缩后的上下文。这里的“角色”只是一份系统提示和工具配置，真正起作用的是上下文隔离。

所以“虚拟公司”式的多 Agent 并没有带来预期的效果，但其中的一部分保留了下来，只是理由变了：

| | 2023 年的理由 | 今天的理由 |
| --- | --- | --- |
| 为什么拆 | 单个模型能力不够，按角色拆提示词 | 资料太多，一个窗口放不下，需要隔离阅读 |
| 按什么拆 | 人类组织中的职位 | 能否独立读取、独立回答 |
| 谁做决定 | 角色之间协商 | 主 Agent 集中决定 |
| 子任务交回什么 | 对话消息 | 定义好格式的结论或产物 |

这与[谁决定下一步](control-structures.md)里讲的趋势相同：补偿模型弱点的部分（按角色拆提示词）随着模型变强而减少，与环境相关的部分（上下文容量、并行等待）则留了下来。子 Agent 与上下文管理的关系，见[模型看不全的时候](context-strategies.md)。

## 什么时候值得拆

拆分之前，可以先回答四个问题：

1. **子任务能否独立完成？** 如果子任务 B 要用到子任务 A 中途做的决定，就不要并行，让同一个 Agent 依次完成。
2. **主 Agent 需要的是结论还是过程？** 只需要结论，隔离才能节省上下文；如果主 Agent 还得把过程全部读一遍，拆分反而更费。
3. **值不值这个成本？** 按 Anthropic 的数据，多 Agent 的 token 消耗可达普通对话的 15 倍，任务价值要配得上这个成本。
4. **谁来验收？** 第七章的伪代码在汇总前检查数据版本和指标是否一致，这一步不能省略。

## 参考资料

- Li et al. [CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society](https://arxiv.org/abs/2303.17760). 2023.
- Hong et al. [MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework](https://arxiv.org/abs/2308.00352). 2023.
- Qian et al. [ChatDev: Communicative Agents for Software Development](https://arxiv.org/abs/2307.07924). 2023.
- Wu et al. [AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation](https://arxiv.org/abs/2308.08155). 2023.
- Cemri et al. [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657). 2025.
- Walden Yan. [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents). Cognition, 2025-06-12.
- Anthropic. [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system). 2025-06-13.

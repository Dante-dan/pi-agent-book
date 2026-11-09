# The Rise and Fall of Multi-Agent Systems: From “Virtual Companies” to a Main Agent with Subtasks

[简体中文](../../../book/notes/multi-agent.md) | **English**

[Back to further reading](README.md) · [Back to contents](../../README.md)

> **Branches from**: [Chapter 2, 2.7 From parallel execution to asynchronous agents](../02-runtime.md#async-execution) · [Chapter 7, 7.6 Collaboration needs more than additional models](../07-general-agent.md#76-collaboration-needs-more-than-additional-models)
> **Prerequisites**: tool parallelism, subagents, context windows (Chapters 2 and 3)
> **Continue with**: [When the Model Cannot See Everything](context-strategies.md) · [Who Decides the Next Step](control-structures.md)
> **Sources checked**: 2026-11-09

Chapter 7 used the refund investigation to show what multi-agent collaboration must agree on first: each agent's goal, inputs, outputs, shared resources, and failure handling. It also gave a counterexample: a report on a four-row CSV is not worth splitting across three agents.

That conclusion seems ordinary now, but two or three years ago the prevailing idea was the opposite. The most eye-catching agent demos featured models playing CEO, product manager, programmer, and tester, holding meetings and writing code in a “virtual company.” Most of those designs were later abandoned. What remained is a plainer structure: one main agent that, when needed, hands well-defined subtasks to isolated contexts.

## 2023: dividing work by role

Several influential multi-agent frameworks appeared in 2023:

- **CAMEL** had two models play user and assistant, collaborating through role-play. [CAMEL](https://arxiv.org/abs/2303.17760)
- **MetaGPT** encoded a software company's standard operating procedures into roles: the product manager writes requirements, the architect designs, engineers write code. [MetaGPT](https://arxiv.org/abs/2308.00352)
- **ChatDev** built a “virtual software company” in which roles completed design, coding, and testing in stages through chat chains. [ChatDev](https://arxiv.org/abs/2307.07924)
- **AutoGen** provided a general framework for defining multiple conversable agents and how they interact. [AutoGen](https://arxiv.org/abs/2308.08155)

Role-based division was attractive at the time for several reasons:

1. **One model could not sustain long tasks.** Windows were small and multi-step runs drifted. Splitting a task across roles, each seeing only a small part, assembled a long task from several short contexts.
2. **Splitting roles meant splitting prompts.** One prompt asking for “requirements, design, code, and tests” worked poorly; several focused prompts were each easier to get right.
3. **Human organizations were a ready template.** Everyone knows how companies divide work, so the analogy was easy to understand and made great demos.

## Where it failed

As these systems met real tasks, problems emerged. The 2025 paper “Why Do Multi-Agent LLM Systems Fail?” analyzed more than 1,600 traces from seven popular frameworks and observed that performance gains on popular benchmarks were often minimal. It identified 14 failure modes in three categories: system design issues, inter-agent misalignment, and task verification. [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657)

These three categories map onto what Chapter 7 says to agree on first: design issues correspond to unclear goals and outputs, misalignment to unaligned shared resources and definitions, and weak verification to nobody owning acceptance.

## A debate in June 2025

In June 2025, two articles published a day apart seemed to reach opposite conclusions.

**Cognition: “Don't Build Multi-Agents”** (June 12). Walden Yan proposed two principles: share context, and share full agent traces, not just individual messages; and actions carry implicit decisions, while conflicting decisions carry bad results. The example is a Flappy Bird clone: one subagent builds the background, another the bird. The first misunderstands and builds a Super Mario-style background; the second builds a bird that does not match either. The final agent is left reconciling two incompatible outputs. The article recommends a single-threaded linear agent by default, and a dedicated model to compress history when tasks grow too long. [Cognition: Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)

**Anthropic: “How we built our multi-agent research system”** (June 13). Anthropic described Claude's Research feature: Claude Opus 4 as lead agent with Claude Sonnet 4 subagents outperformed single-agent Opus 4 by 90.2% on an internal research evaluation. The cost was high: agents use about four times the tokens of chat, and multi-agent systems about fifteen times; in BrowseComp, token usage alone explained 80% of performance variance. The article states that multi-agent systems suit breadth-first tasks that parallelize and exceed one window, and do not suit domains where all agents must share the same context or where there are many dependencies between agents, which includes most coding tasks. [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)

The two articles do not really conflict. Cognition objects to **multiple agents making interdependent decisions in parallel**; Anthropic supports **multiple agents reading independent material in parallel**, with one lead agent deciding. Both agree that decisions should be concentrated in one place, and that the split should follow whether contexts can be independent, not roles.

## Convergence: a main agent with isolated subtasks

Today's mainstream subagent designs in coding agents mostly sit where the two articles overlap. Cognition itself cites Claude Code: its subagents do not write code in parallel with the main agent and usually answer one well-defined question; the subagent's investigation stays out of the main agent's history, so the main session can run longer.

Pi's subagent extension example follows the same design; see [Chapter 7, 7.6](../07-general-agent.md#76-collaboration-needs-more-than-additional-models):

- Each subtask runs in a separate `pi` process with its own context window. [Source: subagent example README](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/examples/extensions/subagent/README.md#L1)
- It supports single, parallel (up to eight tasks, four running at once), and chained modes; each task returns at most 50 KB of output to the main session. [Source: parallel limits and output cap](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/examples/extensions/subagent/index.ts#L33-L36)
- The example's `scout` role does fast reconnaissance and returns compressed context. A “role” here is just a system prompt and tool configuration; what actually matters is context isolation.

So “virtual company” multi-agent systems did not deliver what was hoped, but part of them survived for different reasons:

| | The 2023 reason | Today's reason |
| --- | --- | --- |
| Why split | One model was not capable enough; split prompts by role | Too much material for one window; isolate the reading |
| Split by what | Job titles in human organizations | Whether a part can be read and answered independently |
| Who decides | Roles negotiate | The main agent decides centrally |
| What subtasks return | Chat messages | Conclusions or artifacts in a defined format |

This matches the trend in [Who Decides the Next Step](control-structures.md): the parts compensating for model weakness (splitting prompts by role) shrink as models improve, while the parts tied to the environment (context capacity, parallel waiting) remain. For how subagents relate to context management, see [When the Model Cannot See Everything](context-strategies.md).

## When splitting is worth it

Before splitting, answer four questions:

1. **Can the subtasks finish independently?** If subtask B depends on a decision subtask A makes along the way, do not parallelize; let one agent do them in order.
2. **Does the main agent need the conclusion or the process?** Isolation saves context only if the conclusion is enough; if the main agent must reread the whole process, splitting costs more.
3. **Is it worth the cost?** By Anthropic's figures, multi-agent systems can use fifteen times the tokens of chat, so the task's value must justify it.
4. **Who accepts the result?** Chapter 7's pseudocode checks data versions and metric consistency before combining results; that step cannot be skipped.

## References

- Li et al. [CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society](https://arxiv.org/abs/2303.17760). 2023.
- Hong et al. [MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework](https://arxiv.org/abs/2308.00352). 2023.
- Qian et al. [ChatDev: Communicative Agents for Software Development](https://arxiv.org/abs/2307.07924). 2023.
- Wu et al. [AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation](https://arxiv.org/abs/2308.08155). 2023.
- Cemri et al. [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657). 2025.
- Walden Yan. [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents). Cognition, 2025-06-12.
- Anthropic. [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system). 2025-06-13.

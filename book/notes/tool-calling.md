# 工具调用怎样走到今天：从文本解析、函数调用、MCP 到写代码

**简体中文** | [English](../../en/book/notes/tool-calling.md)

[返回延伸阅读](README.md) · [返回目录](../../README.md)

> **从哪里分叉出来**：[第五章 5.2 少量基础工具怎样覆盖大量任务](../05-tools.md#52-少量基础工具怎样覆盖大量任务) · [第五章 5.8 按需发现工具](../05-tools.md#58-工具越来越多时按需发现比全部展示更合适)
> **前置概念**：工具契约、schema、按需激活工具（第五、六章）
> **继续阅读**：[谁决定下一步](control-structures.md) · [第五章 5.3 为什么不把所有事情都交给 bash](../05-tools.md#53-为什么不把所有事情都交给-bash)
> **资料核验日期**：2026-11-09

第五章说 Pi 默认只给模型四个工具：`read`、`bash`、`edit`、`write`。如果你用过接入了几十个 MCP 服务器的 Agent，可能会觉得四个工具太少了。但这几年工具调用的演进并不是一路“越加越多”。它先从文本约定走到结构化协议，再走到统一的连接标准，接着因为工具太多而开始往回收：按需加载工具，或者干脆让模型写代码去调用。

了解这条路，有助于理解 Pi 为什么这样设计，也能看清第五章那些原则分别是在应对哪个阶段的问题。

## 四个阶段

| 阶段 | 工具调用的形式 | 谁负责解析 | 主要问题 |
| --- | --- | --- | --- |
| 文本约定（2022–2023） | 模型输出 `Action: search[退款]` 这样的文字 | 宿主用正则表达式解析 | 格式漂移、转义出错 |
| 原生函数调用（2023 年起） | 模型输出符合 JSON Schema 的结构化调用 | 模型接口 | 形状对了，业务内容未必对 |
| 统一协议 MCP（2024 年底起） | 工具由独立服务器提供，按标准协议接入 | 协议客户端 | 工具定义占满上下文 |
| 按需加载与写代码（2025 年起） | 先搜索工具再加载，或让模型写一段程序调用工具 | 宿主与执行环境 | 需要沙箱，调试更难 |

## 文本约定：靠提示词和正则表达式

ReAct 论文里的 Agent 是这样调用工具的：模型在文本中写出 `Search[...]` 这样的动作，宿主按约定的格式找出动作和参数，执行后把观察结果拼回文本，再让模型继续写。[ReAct](https://arxiv.org/abs/2210.03629) Toolformer 则尝试让模型在训练中自己学会在文本里插入 API 调用。[Toolformer](https://arxiv.org/abs/2302.04761)

这个阶段最常见的故障是格式。模型多写了一个空格、参数里出现了换行或引号、在 `Action` 后面又自说自话写了一段“观察结果”，解析就会失败或者出错。第五章讲的“参数经过的语言越多，失真机会越大”，在这个阶段体现得最明显。

## 原生函数调用：格式交给接口

2023 年 6 月 13 日，OpenAI 在 `gpt-4-0613` 和 `gpt-3.5-turbo-0613` 中加入函数调用：开发者用 JSON Schema 描述函数，模型选择是否调用，并输出包含参数的 JSON 对象。[OpenAI：Function calling and other API updates](https://openai.com/index/function-calling-and-other-api-updates/) 2024 年 5 月 30 日，Anthropic 的工具调用正式开放。[Anthropic：Tool use is now generally available](https://www.anthropic.com/news/tool-use-ga) 同年 8 月 6 日，OpenAI 推出 Structured Outputs，函数定义设置 `strict: true` 后，输出会可靠地符合 schema。[OpenAI：Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/)

从此，解析格式的责任从宿主的正则表达式转移到了模型训练和接口。格式错误大幅减少，但第五章强调的那条界线依然存在：[schema 校验解决形状，不解决业务正确性](../05-tools.md#schema-校验解决形状不解决业务正确性)。一个格式完全合法的 `write` 调用，内容仍可能是半个函数。

## MCP：连接标准化，上下文却被占满

函数调用统一了格式，但每个应用仍要自己写一遍“接 GitHub”“接 Slack”的代码。2024 年 11 月 25 日，Anthropic 发布 Model Context Protocol（MCP），把工具和数据源的接入标准化：服务方写一个 MCP 服务器，任何支持 MCP 的客户端都能使用。[Anthropic：Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)

接入变容易以后，新的问题出现了：每个服务器带来一批工具定义，而这些定义在对话开始前就要全部放进上下文。

- Pi 的作者 Mario Zechner 在 2025 年 11 月统计过：Playwright MCP 有 21 个工具，占 13.7k token，约为 Claude 上下文的 6.8%；Chrome DevTools MCP 有 26 个工具，占 18.0k token，约 9.0%。他自己写的一套浏览器脚本，说明文档只有 225 token。[What if you don't need MCP at all?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)
- Anthropic 在同月的文章中举例：接入 GitHub、Slack、Sentry、Grafana、Splunk 五个服务器，共 58 个工具，对话开始前就占用约 55K token。[Anthropic：Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)

工具多了还会带来选择困难：名字相似的工具越多，模型越容易选错。这就是第五章 5.8 开头描述的处境。

## 往回收：按需加载，或者让模型写代码

针对“定义太多”，有两种主要做法。

**按需加载。** Anthropic 的 Tool Search Tool 让标记为 `defer_loading: true` 的工具先不进入上下文，模型需要时再搜索、加载。文章报告，在其 MCP 评估中，Opus 4 的准确率从 49% 提高到 74%，Opus 4.5 从 79.5% 提高到 88.1%。[Anthropic：Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) 第五章 5.8 的工具目录和第六章的[按需激活工具](../06-extensibility.md#dynamic-tools)是同一个思路在 Pi 中的实现方式。

**写代码调用。** 另一种做法更进一步：不让模型逐个调用工具，而是让它写一段程序，在程序里调用工具、过滤结果，只把最后需要的部分交回上下文。

- CodeAct（2024）提出用可执行的 Python 代码统一 Agent 的动作空间，在 17 个模型上的实验中优于 JSON 或文本格式的动作。[CodeAct](https://arxiv.org/abs/2402.01030)
- Cloudflare 在 2025 年 9 月推出 Code Mode：把 MCP 工具转换成 TypeScript API，让模型写代码调用。[Cloudflare：Code Mode](https://blog.cloudflare.com/code-mode/)
- Anthropic 在 2025 年 11 月指出直接调用 MCP 工具的两个问题：工具定义占满上下文，中间结果也要经过模型，消耗额外的 token。文中的例子通过让模型写代码，把 token 消耗从 150,000 降到 2,000，节省了 98.7%。[Anthropic：Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)

Mario Zechner 的主张更直接：很多场景根本不需要 MCP 服务器。Agent 本来就会用 bash、会写代码，给它几个小型命令行脚本和一份 README，需要时再读 README，平时不占上下文；脚本的输出是普通文本或文件，可以互相组合，也容易修改。[What if you don't need MCP at all?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)

## Pi 站在哪里

Pi 的设计与这条路线的最新阶段一致：

- 默认只有四个通用工具，见[第五章 5.2](../05-tools.md#52-少量基础工具怎样覆盖大量任务)。
- 本书固定版本的 coding-agent 源码里没有内建 MCP 客户端，只在处理工具图片的注释中把“MCP 桥接”列为扩展可能产生图片的来源之一。[源码：工具结果图片处理](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/utils/tool-result-images.ts#L17) 需要 MCP 时，可以通过扩展接入。
- Skill 的做法与“README 加脚本”相同：启动时只加载名称和描述，需要时才读完整说明，见[第三章 3.4](../03-context-engineering.md#34-prompt-template-与-skill重复表达和按需能力)。

但这并不意味着“只用 bash 就够了”。第五章用了整整一节讨论[为什么不把所有事情都交给 bash](../05-tools.md#53-为什么不把所有事情都交给-bash)：参数经过 shell 转义会失真，专用工具能给出稳定的失败语义，权限也要落在执行边界上。写代码调用工具同样需要沙箱，见[第五章 5.9](../05-tools.md#59-最小权限应落到执行边界)。

## 这条演进路线说明了什么

回头看四个阶段，每一步都在把某种负担从一方移到另一方：

- 文本到函数调用：格式解析从宿主移到模型接口。
- 函数调用到 MCP：接入代码从每个应用移到共享的服务器。
- MCP 到按需加载和写代码：工具选择和结果过滤从上下文移到执行环境。

这和[谁决定下一步](control-structures.md)里讲的趋势一致：模型越擅长写代码、读文件，就越适合用少量通用的工具去组合，而不是为每件事准备一个专用工具。不变的是工具契约本身：参数要完整，结果要说清楚做成了什么，失败要能指导下一步。这些原则在四个阶段里都成立。

## 参考资料

- Yao et al. [ReAct](https://arxiv.org/abs/2210.03629). 2022.
- Schick et al. [Toolformer](https://arxiv.org/abs/2302.04761). 2023.
- OpenAI. [Function calling and other API updates](https://openai.com/index/function-calling-and-other-api-updates/). 2023-06-13.
- Anthropic. [Tool use is now generally available](https://www.anthropic.com/news/tool-use-ga). 2024-05-30.
- OpenAI. [Introducing Structured Outputs in the API](https://openai.com/index/introducing-structured-outputs-in-the-api/). 2024-08-06.
- Anthropic. [Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol). 2024-11-25.
- Wang et al. [Executable Code Actions Elicit Better LLM Agents (CodeAct)](https://arxiv.org/abs/2402.01030). 2024.
- Cloudflare. [Code Mode: the better way to use MCP](https://blog.cloudflare.com/code-mode/). 2025-09-26.
- Mario Zechner. [What if you don't need MCP at all?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/). 2025-11-02.
- Anthropic. [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp). 2025-11-04.
- Anthropic. [Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use). 2025-11-24.

# How Tool Calling Got Here: From Text Parsing and Function Calls to MCP and Code

[简体中文](../../../book/notes/tool-calling.md) | **English**

[Back to further reading](README.md) · [Back to contents](../../README.md)

> **Branches from**: [Chapter 5, 5.2 A few basic tools can support many tasks](../05-tools.md#52-a-few-basic-tools-can-support-many-tasks) · [Chapter 5, 5.8 Discover tools on demand](../05-tools.md#58-discover-tools-on-demand-as-the-catalog-grows)
> **Prerequisites**: tool contracts, schemas, on-demand tool activation (Chapters 5 and 6)
> **Continue with**: [Who Decides the Next Step](control-structures.md) · [Chapter 5, 5.3 Why not use bash for everything?](../05-tools.md#53-why-not-use-bash-for-everything)
> **Sources checked**: 2026-11-09

Chapter 5 said Pi gives the model only four tools by default: `read`, `bash`, `edit`, and `write`. If you have used an agent connected to dozens of MCP servers, four may seem too few. But tool calling has not simply grown over the years. It moved from text conventions to structured protocols, then to a shared connection standard, and then, because there were too many tools, began to pull back: loading tools on demand, or letting the model write code to call them.

Following that path explains why Pi is designed as it is, and shows which stage each of Chapter 5's principles responds to.

## Four stages

| Stage | Form of a tool call | Who parses it | Main problem |
| --- | --- | --- | --- |
| Text conventions (2022–2023) | The model writes text like `Action: search[refunds]` | The host, with regular expressions | Format drift, escaping errors |
| Native function calling (from 2023) | The model emits a structured call matching a JSON Schema | The model API | Right shape, possibly wrong business content |
| A shared protocol, MCP (from late 2024) | Tools come from separate servers over a standard protocol | The protocol client | Tool definitions crowd the context |
| On-demand loading and code (from 2025) | Search for tools before loading them, or have the model write a program that calls them | Host and execution environment | Requires a sandbox; harder to debug |

## Text conventions: prompts and regular expressions

In the ReAct paper, the agent called tools by writing actions such as `Search[...]` in its text. The host found the action and argument by an agreed format, executed it, appended the observation to the text, and let the model continue. [ReAct](https://arxiv.org/abs/2210.03629) Toolformer tried to have the model learn during training to insert API calls into text on its own. [Toolformer](https://arxiv.org/abs/2302.04761)

The most common failures at this stage were about format. An extra space, a newline or quote inside an argument, or the model writing its own fake “observation” after an action would make parsing fail or go wrong. Chapter 5's point that every language boundary creates opportunities for distortion was most visible here.

## Native function calling: format moves into the API

On June 13, 2023, OpenAI added function calling to `gpt-4-0613` and `gpt-3.5-turbo-0613`: developers describe functions with JSON Schema, and the model chooses whether to call one and outputs a JSON object with the arguments. [OpenAI: Function calling and other API updates](https://openai.com/index/function-calling-and-other-api-updates/) On May 30, 2024, Anthropic's tool use became generally available. [Anthropic: Tool use is now generally available](https://www.anthropic.com/news/tool-use-ga) On August 6, 2024, OpenAI introduced Structured Outputs; with `strict: true` in a function definition, output reliably matches the schema. [OpenAI: Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/)

From then on, responsibility for parsing format moved from the host's regular expressions to model training and the API. Format errors dropped sharply, but the line Chapter 5 draws still holds: [schema validation checks shape, not business correctness](../05-tools.md#schema-validation-checks-shape-not-business-correctness). A perfectly well-formed `write` call can still contain half a function.

## MCP: standard connections, crowded context

Function calling unified the format, but every application still wrote its own “connect to GitHub” and “connect to Slack” code. On November 25, 2024, Anthropic released the Model Context Protocol (MCP), standardizing how tools and data sources connect: a service writes one MCP server, and any MCP-capable client can use it. [Anthropic: Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)

Once connecting became easy, a new problem appeared: every server brings a batch of tool definitions, and they all go into context before the conversation starts.

- In November 2025, Pi's author Mario Zechner measured it: Playwright MCP has 21 tools using 13.7k tokens, about 6.8% of Claude's context; Chrome DevTools MCP has 26 tools using 18.0k tokens, about 9.0%. The README for his own browser scripts was 225 tokens. [What if you don't need MCP at all?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)
- In an article the same month, Anthropic gave an example: connecting five servers (GitHub, Slack, Sentry, Grafana, Splunk) means 58 tools consuming about 55K tokens before the conversation even starts. [Anthropic: Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)

More tools also make selection harder: the more similarly named tools there are, the more likely the model picks the wrong one. This is the situation at the start of Chapter 5.8.

## Pulling back: load on demand, or let the model write code

There are two main responses to “too many definitions.”

**Load on demand.** Anthropic's Tool Search Tool keeps tools marked `defer_loading: true` out of context until the model searches for them. The article reports that on its MCP evaluations, Opus 4 improved from 49% to 74% and Opus 4.5 from 79.5% to 88.1%. [Anthropic: Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) Chapter 5.8's tool catalog and Chapter 6's [on-demand tool activation](../06-extensibility.md#dynamic-tools) implement the same idea in Pi.

**Call through code.** Another approach goes further: instead of calling tools one by one, the model writes a program that calls tools and filters results, returning only what is needed to the context.

- CodeAct (2024) proposed unifying agent actions as executable Python code; in experiments across 17 models it outperformed JSON or text action formats. [CodeAct](https://arxiv.org/abs/2402.01030)
- In September 2025, Cloudflare introduced Code Mode, converting MCP tools into a TypeScript API that the model calls by writing code. [Cloudflare: Code Mode](https://blog.cloudflare.com/code-mode/)
- In November 2025, Anthropic identified two problems with direct MCP tool calls: tool definitions overload the context window, and intermediate results consume additional tokens by passing through the model. Its example cut token use from 150,000 to 2,000, a 98.7% saving, by having the model write code. [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)

Mario Zechner's position is more direct: many situations do not need an MCP server at all. Agents already use bash and write code; give them a few small command-line scripts and a README that they read only when needed, costing no context otherwise. Script output is plain text or files, so tools compose and are easy to modify. [What if you don't need MCP at all?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)

## Where Pi stands

Pi's design matches the latest stage of this path:

- Only four general tools by default; see [Chapter 5, 5.2](../05-tools.md#52-a-few-basic-tools-can-support-many-tasks).
- The coding-agent source at the book's pinned version has no built-in MCP client; MCP appears only in a comment on tool-result images, listing “MCP bridges” among extension sources that may produce images. [Source: tool-result image handling](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/utils/tool-result-images.ts#L17) MCP can be connected through an extension when needed.
- Skills work like “README plus scripts”: only names and descriptions load at startup, and the full instructions are read when needed; see [Chapter 3, 3.4](../03-context-engineering.md#34-prompt-templates-and-skills-repetition-and-on-demand-capability).

This does not mean “bash is all you need.” Chapter 5 spends a whole section on [why not to use bash for everything](../05-tools.md#53-why-not-use-bash-for-everything): shell escaping distorts arguments, dedicated tools provide stable failure semantics, and permissions belong at the execution boundary. Calling tools through code needs a sandbox too; see [Chapter 5, 5.9](../05-tools.md#59-least-privilege-belongs-at-the-execution-boundary).

## What this path shows

Looking back over the four stages, each step moved a burden from one party to another:

- Text to function calls: format parsing moved from the host to the model API.
- Function calls to MCP: integration code moved from each application to shared servers.
- MCP to on-demand loading and code: tool selection and result filtering moved from the context to the execution environment.

This matches the trend in [Who Decides the Next Step](control-structures.md): the better models get at writing code and reading files, the better a few general tools combine, rather than one dedicated tool per job. What stays constant is the tool contract itself: arguments must be complete, results must state exactly what succeeded, and failures must guide the next step. These principles hold in all four stages.

## References

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

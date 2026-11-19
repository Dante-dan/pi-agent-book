# Pi Agent: From Beginner to Proficient

[简体中文](../README.md) | **English**

**Start with your first run and learn how an agent observes, acts, remembers, and extends its capabilities.**

> 🎮 **New: [π Workshop](https://pi.duanjl.com/)** turns this book into a playable 3D game (in Chinese). You are the harness designer of a space station: take missions, install parts, investigate incidents. The book now has two layers: the **[operator's manual](../manual/)** (Chinese only) follows the game for a first understanding, and the **textbook** below goes deeper. **Chapter N of the textbook is the in-depth version of station N.** The earlier 8-chapter edition is archived in [`archive/en-book-v1/`](../archive/en-book-v1/README.md).

An open-source book for complete beginners, grounded in Pi's actual implementation. Learn how LLMs, context, and tools form a running agent, then follow the ten chapters of Li Bojie's *AI Agent Book* through context engineering, memory and knowledge bases, tools, coding agents, interaction, evaluation, post-training, continuous evolution and multi-agent collaboration, ending with a special topic on sandboxing and isolation.

No previous agent textbook is required. The first chapters introduce terminal use and basic concepts. Each chapter offers a reading path and concrete exercise answers; later mechanisms include JavaScript-like pseudocode, Mermaid diagrams, and pinned source references. TypeScript and JSON concepts are explained where needed.

## Start reading

| Chapter | Game station | What it answers |
| --- | --- | --- |
| [1. Getting started with AI agents](book/01-agent-loop.md) | Station 01 | Agent = LLM + context + tools: what does each part do? How does the ReAct loop turn and stop? Which five things must a harness add between a demo and a product? |
| [2. Context engineering](book/02-context.md) | Station 02 | The API is stateless and resends everything each turn; how does the KV cache constrain prompt design? What do system prompts, skills, status bars, compaction and isolation each handle? |
| [3. User memory and knowledge bases](book/03-memory.md) | Station 03 | What survives the session? From memory to knowledge bases and evolving storage formats, and only then RAG: keywords, vectors, hybrid search, graphs |
| [4. Tools](book/04-tools.md) | Station 04 | A tool is a contract: how to write the spec, deliver arguments intact, report truncation, and stay idempotent after a timeout |
| [5. Coding agents and general agents](book/05-coding.md) | Station 05 | Why code plus a file system sits at the core of general agents; completion gates, execution boundaries, fault classes, circuit breakers, and Pi's extension mechanism |
| [6. Interaction: observation and action spaces](book/06-interaction.md) | Station 06 | Breaking "take turns while the world stands still": async events, voice, Computer Use coordinates and keyframes, closed-loop robot control |
| [7. Evaluating agents](book/07-evaluation.md) | Station 07 | The thing under test is model plus harness; verifiers that check the world, pass@k vs pass^k, leakage, trajectory attribution, regression and significance |
| [8. Model post-training](book/08-training.md) | Station 08 | When is touching the model worth it? Capability probes, environments, where rewards attach, reward hacking and path constraints |
| [9. Continuous evolution](book/09-evolution.md) | Station 09 | Turning failures into knowledge, skills or programs; releasing, rolling back and retiring lessons; why the trusted root must be out of a proposal's reach |
| [10. Multi-agent collaboration](book/10-multi-agent.md) | Station 10 | Another agent must bring new information; shared vs separate context, three topologies, data and control planes, handoffs and six failure modes |
| [Special topic: sandboxing and isolation](book/s-sandbox.md) | Sandbox topic | Assume the agent has already been led astray: mount lists, egress allowlists, semantic command parsing, isolation tiers, and what Pi does and does not build in |

New readers should proceed in order. Experienced Pi users can pick any station, play it, read the matching chapter, and follow the source index. **Proficiency here means explaining mechanisms, choosing integration points, and validating behavior, not memorizing every API.**

Beyond the chapters, [Further reading](book/notes/README.md) collects topics that branch off the main line: the rise and fall of other control structures, design choices in other products, and how changing model capabilities reshape the harness. Chapters link out at each branch, and each note states where it branches from, so you can move back and forth between them.

## The running case

Imagine an e-commerce team has released a redesigned checkout to some users. The lead asks: “Refunds seem to have increased. Did the redesign cause this? Tomorrow we must decide whether to restore the old version.” You have orders, support records, and release notes, but their relationships are unclear.

An LLM must read actual sources, clarify what “refund” means, verify numbers with code, and limit conclusions to evidence. When requirements change, it must revise its plan. The book develops Pi's mechanisms around these needs and completes the [investigation in Chapter 5](book/05-coding.md#t-code-case). The [lab](examples/investigation/README.md) includes staged materials and reference answers.

First, a smaller order repair introduces reading, editing, and checking before the full investigation.

## Hands-on practice

Install Node.js 22.19.0 or later. **Run all commands from the repository root, not `en/`, unless another directory is explicitly shown.** Both editions share executable examples.

```bash
node examples/order-report/setup.mjs
cd .workshop/order-report
node check.mjs
```

The initial failure is intentional. Follow [Chapter 1](book/01-agent-loop.md) to install Pi, authenticate, and request a repair. The exercise uses fictional orders and no third-party dependencies.

With model access, run the [live-model labs](examples/live-model/README.md): repair, automatic versus explicit skill loading, cross-process session recovery, and context selection before every model call. Scripts default to dry-run; `--execute` requests a model and saves traces and independent results.

Without an account, validate the examples and reference repair:

```bash
node examples/order-report/selftest.mjs
```

See the [exercise guide](examples/order-report/README.md). Chapter 5 includes a [real tool-contract lab](examples/tool-contract/README.md) requiring no model account. Other pseudocode explains design and should not be treated as real Pi APIs unless explicitly marked runnable.

## Versions and evidence

Security update: the tool-contract lab now uses Pi 1.5.0 with dependency auditing in CI. The book and original live-model labs remain a historical 0.87.1 snapshot; old-version reproduction commands are not a recommendation of a current secure release. Read the [security notes](SECURITY.md).

- Source verification date: **2026-11-01**. The book originally used post-0.85.1 commit `71dca871`; it was upgraded and rechecked against v0.87.1.
- Official repository: [earendil-works/pi](https://github.com/earendil-works/pi).
- Pinned commit: [`f07218c4d4bbc12bef056a7058c3dd49dfe41abe`](https://github.com/earendil-works/pi/tree/f07218c4d4bbc12bef056a7058c3dd49dfe41abe).
- Coding Agent package in this snapshot: `@earendil-works/pi-coding-agent`, version `0.87.1`.

The book distinguishes **built-in behavior, proposed extensions, and general engineering advice**. Session persistence is built in; automatic profile maintenance is not a default pipeline. Search limits are not cursor pagination. Project trust controls resource loading without providing an OS sandbox.

The source snapshot and same-version npm package were checked separately; equal versions do not prove file-for-file identity. Pinned sources govern implementation details. See [verification](VERIFICATION.md), the [source guide](SOURCES.md), and [glossary](GLOSSARY.md).

This English edition translates the Chinese book's versioned account, including its historical verification scope. Translation does not imply fresh model experiments or verification against a newer Pi release.

## References and acknowledgments

Two open-source projects were major references:

- **[Pi source and official documentation](https://github.com/earendil-works/pi)** ground the runtime, context, tools, session-tree, and extension explanations. Pinned references support comparison with implementation.
- **Li Bojie's [Understanding AI Agents: Design Principles and Engineering Practice (AI Agent Book)](https://github.com/bojieli/ai-agent-book)** informed chapter organization and analysis, especially agents and harnesses, context engineering, memory, tool design, general-purpose coding agents, and continuous improvement. This book develops those themes through Pi's implementation, concrete cases, and exercises.

Thank you to both projects' authors and contributors for sharing code, knowledge, and engineering experience. This is independently authored learning material; its explanations and examples are this project's responsibility and do not represent those projects' official positions.

## Local checks and contributions

```bash
python3 scripts/check-book.py
node examples/order-report/selftest.mjs
```

With the pinned Pi checkout, also validate source paths and line ranges:

```bash
python3 scripts/check-book.py --pi-source /path/to/pi
```

Supply version-specific source or reproducible observations for factual corrections. Upgrades need checks of arguments, defaults, and lifecycle, not just new version numbers. See [contributing](CONTRIBUTING.md).

## Star history

<a href="https://www.star-history.com/#Dante-dan/pi-agent-book&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Dante-dan/pi-agent-book&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Dante-dan/pi-agent-book&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Dante-dan/pi-agent-book&type=Date" />
  </picture>
</a>

## License

Text and original diagrams use [CC BY 4.0](../LICENSE); original companion code uses [MIT](../LICENSE-CODE). Reuse should retain the title, author, project and license links, and modification notice. Pi's name and upstream code belong to their respective rights holders. This independent tutorial is not official documentation.

Author attribution: **Dante-dan**.

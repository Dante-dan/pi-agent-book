# Pi Agent: From Beginner to Proficient

[简体中文](../README.md) | **English**

**Start with your first run and learn how an agent observes, acts, remembers, and extends its capabilities.**

An open-source book for complete beginners, grounded in Pi's actual implementation. Learn how LLMs, context, and tools form a running agent, then explore context engineering, session memory, tool contracts, extension lifecycles, and continuous improvement.

No previous agent textbook is required. The first chapters introduce terminal use and basic concepts. Each chapter offers a reading path and concrete exercise answers; later mechanisms include JavaScript-like pseudocode, Mermaid diagrams, and pinned source references. TypeScript and JSON concepts are explained where needed.

## Start reading

| Chapter | Questions answered |
| --- | --- |
| [1. Meet Pi and complete your first task](book/01-first-agent.md) | What are agents, models, harnesses, and environments? How do you install Pi and complete a verifiable repair? |
| [2. From a conversation to a running system](book/02-runtime.md) | How do models, tools, and state form a loop? What do streaming events, concurrency, cancellation, and queues mean? |
| [3. Context engineering](book/03-context-engineering.md) | How do prompts, project instructions, skills, message transforms, and compaction determine what the model sees? |
| [4. Memory and knowledge bases](book/04-memory.md) | What does the session tree preserve? What are user-memory boundaries? How do retrieval and updates integrate? |
| [5. Tool design](book/05-tools.md) | Why keep read/write/edit? How do arguments, search, truncation, multimodality, concurrency, and discovery work? |
| [6. Extensions and lifecycle](book/06-extensibility.md) | How can business tools, rules, and recoverable state integrate without forking the core? |
| [7. From coding assistant to general-purpose agent](book/07-general-agent.md) | Why do code and files support general tasks? How do reports, knowledge assistance, and collaboration fit together? |
| [8. Continuous improvement](book/08-evolution.md) | How can failures become knowledge, skills, or code, and how do you prove improvement? |

New readers should proceed in order. Experienced Pi users can start with Chapter 3 and follow the source index. **Proficiency here means explaining mechanisms, choosing integration points, and validating behavior, not memorizing every API.**

## The running case

Imagine an e-commerce team has released a redesigned checkout to some users. The lead asks: “Refunds seem to have increased. Did the redesign cause this? Tomorrow we must decide whether to restore the old version.” You have orders, support records, and release notes, but their relationships are unclear.

An LLM must read actual sources, clarify what “refund” means, verify numbers with code, and limit conclusions to evidence. When requirements change, it must revise its plan. The book develops Pi's mechanisms around these needs and completes the [investigation in Chapter 7](book/07-general-agent.md#changing-task). The [lab](examples/investigation/README.md) includes staged materials and reference answers.

First, a smaller order repair introduces reading, editing, and checking before the full investigation.

## Hands-on practice

Install Node.js 22.19.0 or later. **Run all commands from the repository root, not `en/`, unless another directory is explicitly shown.** Both editions share executable examples.

```bash
node examples/order-report/setup.mjs
cd .workshop/order-report
node check.mjs
```

The initial failure is intentional. Follow [Chapter 1](book/01-first-agent.md) to install Pi, authenticate, and request a repair. The exercise uses fictional orders and no third-party dependencies.

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

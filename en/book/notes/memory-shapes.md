# The Shapes of Memory: From Vector Stores to a Folder

[简体中文](../../../book/notes/memory-shapes.md) | **English**

[Back to further reading](README.md) · [Back to contents](../../README.md)

> **Branches from**: [Chapter 4, 4.1 Four storage scopes](../04-memory.md#41-four-storage-scopes) · [Chapter 4, 4.6 From file memory to an external knowledge base](../04-memory.md#46-from-file-memory-to-an-external-knowledge-base)
> **Prerequisites**: session files, `AGENTS.md`, retrieval (Chapters 3 and 4)
> **Continue with**: [When the Model Cannot See Everything](context-strategies.md) · [Chapter 4, 4.7 Writing, conflicts, and forgetting](../04-memory.md#47-writing-conflicts-and-forgetting-memory-needs-maintenance)
> **Sources checked**: 2026-11-09

Chapter 4 explained that Pi provides session files and `AGENTS.md` but no built-in long-term memory service; remembering facts across sessions is up to the application's own storage and retrieval design. That choice can look conservative, since “giving agents memory” was once one of the hottest directions in the field.

Looking back at what different systems did, the shape of memory keeps changing: first everything went into a vector store, then came tiered memory modeled on operating systems, then user-visible memory entries in products, and finally many systems returned to an ordinary folder. Each change answers the same question differently: **who decides what to remember, and who can see and correct it.**

## 2023: write everything into a vector store

In spring 2023, autonomous agents such as AutoGPT went viral, and they commonly implemented “long-term memory” as a vector database: every observation and result was embedded and stored, then retrieved by similarity. AutoGPT supported several backends, including Pinecone, Redis, Milvus, and Weaviate.

By v0.4.0 in June of that year, AutoGPT removed the Milvus, Pinecone, and Weaviate backends, leaving a local JSON file as the default memory. The release notes describe this as a stop-gap to simplify development during a memory-system rework, with Redis to return after a fix. [AutoGPT v0.4.0 release notes](https://github.com/Significant-Gravitas/AutoGPT/releases/tag/v0.4.0)

This is often retold as “AutoGPT proved vector databases are useless,” but the release notes say no such thing. What it does show is simpler: storing everything in a vector store does not automatically produce useful memory. What to store, when to retrieve it, and how to update old information remain open questions whatever the storage backend.

## Two research designs: memory streams and tiered memory

The same year, two papers offered more complete designs.

**Generative Agents** placed simulated characters in a small town. Each character kept a “memory stream” recording what it observed over time. Retrieval combined three scores: recency, importance, and relevance to the current situation. Characters also periodically “reflected,” synthesizing scattered observations into higher-level judgments. [Generative Agents](https://arxiv.org/abs/2304.03442) Similarity alone is not enough; time and importance also decide whether a memory should come to mind.

**MemGPT** borrowed from operating systems: the context window is like RAM, external storage is like disk, and the model moves data between them through function calls, providing the appearance of a larger context within a limited window. [MemGPT](https://arxiv.org/abs/2310.08560) This design gave the model itself the decision about what to remember, rather than having an external program retrieve automatically every turn.

Both ideas were later absorbed: the first influenced the practice of scoring and consolidating memories, the second the practice of treating memory as a tool the model calls.

## Memory in products: the part users can see

Products for general users must answer a question research prototypes can skip: can users see it, and can they change it? ChatGPT memory has two settings. “Reference saved memories” covers entries users explicitly asked it to remember, which they can manage in settings. “Reference chat history,” available from April 2025, lets the model use information from past conversations; turning it off deletes what was learned from them. [OpenAI: Memory FAQ](https://help.openai.com/en/articles/8590148-memory-faq)

The first kind is transparent but needs maintenance; the second is convenient but hard to audit entry by entry. This is Chapter 4.7's problem of writing, conflicts, and forgetting at product scale: the more automatic the memory, the harder it is for users to know why it answered as it did, and the harder to correct mistakes.

## Back to a folder: readable, editable, traceable

Coding agents went another way: memory is files in the project.

- **Project instruction files.** Files like `CLAUDE.md` and `AGENTS.md` live in the repository and are read when the agent starts. `AGENTS.md` became an open format supported by many coding tools, and in December 2025 OpenAI contributed it to the Agentic AI Foundation under the Linux Foundation. [OpenAI: Agentic AI Foundation](https://openai.com/index/agentic-ai-foundation/)
- **A memory tool.** In September 2025 Anthropic released a memory tool: Claude creates, reads, updates, and deletes files in a dedicated directory stored on the developer's own infrastructure, with the tool executed client-side. Anthropic's internal evaluation reports a 39% improvement over baseline with the memory tool plus context editing. [Anthropic: Managing context](https://claude.com/blog/context-management)
- **Updating from mistakes.** Mitchell Hashimoto described his practice in February 2026: each time the agent makes a mistake, add a rule to `AGENTS.md` or write a script that points out the error automatically. [My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey)

Pi is on this side too: `AGENTS.md` loads at startup ([Chapter 3, 3.3](../03-context-engineering.md#33-agentsmd-keep-project-knowledge-beside-the-project)), sessions are saved as recoverable files ([Chapter 4, 4.2](../04-memory.md#42-session-files-recoverable-work-records)), and long-term memory is connected through extensions ([Chapter 4, 4.6](../04-memory.md#46-from-file-memory-to-an-external-knowledge-base)).

Files did not win by being technically advanced. They won by giving control of memory back to people:

- **Readable.** Open the file and you know what the agent remembers; no guessing which chunks are in a vector store.
- **Editable.** If something is wrong, edit it; no special deletion interface needed.
- **Traceable.** Put it in git and you have version history: who changed which rule, and when.
- **Already familiar to the model.** Reading and searching files is what coding agents do best; no extra retrieval tool is required.

The costs are also clear: files are poor at semantic recall across massive records, and they do not clean up stale content on their own. That leads back to the retrieval discussed in [When the Model Cannot See Everything](context-strategies.md) and to Chapter 4.7's maintenance problem.

## Comparing the shapes

| Shape | Example | Who decides what to remember | Can users view and correct it? | Main weakness |
| --- | --- | --- | --- | --- |
| Vector store | 2023 autonomous agents | The program writes everything automatically | Hard | Retrieval by similarity only; old information hard to update |
| Scored memory stream | Generative Agents | The program writes; retrieval by recency, importance, relevance | Hard | Scoring rules need tuning |
| Tiered memory | MemGPT | The model decides through function calls | Depends on implementation | Relies on the model's judgment being reliable |
| Product memory entries | ChatGPT saved memories | What users ask it to remember, manageable in settings | Yes | Maintenance cost grows with entries |
| Files | `AGENTS.md`, memory tool, Pi | People or the model write files | Yes, with version history | Poor at semantic recall at scale |

## Three questions before designing memory

1. **Who writes?** Rules written by people (such as `AGENTS.md`) are reliable but limited in coverage; memory written by the model covers more but needs review. Many systems have both and should store them separately.
2. **Who reads, and when?** What every task needs should load up front; what is needed occasionally should be retrieved on demand. Mixing them either overfills the context or misses key rules.
3. **Who corrects?** If a user finds the agent remembered something wrong, there should be a clear place to fix it and a way to verify the fix took effect. Chapter 4's Exercise 6 acceptance method is designed for this.

## References

- [AutoGPT v0.4.0 release notes](https://github.com/Significant-Gravitas/AutoGPT/releases/tag/v0.4.0). 2023-06-05.
- Park et al. [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442). 2023.
- Packer et al. [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560). 2023.
- OpenAI. [Memory FAQ](https://help.openai.com/en/articles/8590148-memory-faq).
- Anthropic. [Managing context on the Claude Developer Platform](https://claude.com/blog/context-management). 2025-09-29.
- OpenAI. [Agentic AI Foundation](https://openai.com/index/agentic-ai-foundation/). 2025-12.
- Mitchell Hashimoto. [My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey). 2026-02-05.

# When the Model Cannot See Everything: Retrieval, Long Context, and Isolation

[简体中文](../../../book/notes/context-strategies.md) | **English**

[Back to further reading](README.md) · [Back to contents](../../README.md)

> **Branches from**: [Chapter 3, 3.1 The context window is not memory](../03-context-engineering.md#31-the-context-window-is-not-memory-for-the-entire-project) · [Chapter 3, 3.6 Compaction](../03-context-engineering.md#36-compaction-turn-older-work-into-a-useful-handoff)
> **Prerequisites**: context window, tokens, compaction (Chapter 3)
> **Continue with**: [The Shapes of Memory](memory-shapes.md) · [The Rise and Fall of Multi-Agent Systems](multi-agent.md) · [Chapter 5, 5.4 Search provides leads](../05-tools.md#54-search-provides-leads-reading-provides-evidence)
> **Sources checked**: 2026-11-09

The refund investigation involves an orders table, hundreds of support tickets, release notes, and months of past discussion, far more than one request can hold. Chapter 3 described Pi's approach: load project instructions up front, read files when needed, and compact history when it grows too long. That approach was not obvious. Over the past few years, “the model cannot see everything” has had several mainstream answers, each tied to the context sizes and long-input abilities of its time.

## Four approaches

| Approach | How material enters context | Who decides what to read | Typical period |
| --- | --- | --- | --- |
| Pre-retrieval (RAG) | An index is queried before the request; relevant chunks are inserted | The retrieval program | From 2020, when windows held a few thousand tokens |
| Put everything in | The window is large enough to hold whole documents | Nobody chooses | From 2024, with million-token windows |
| Just-in-time retrieval | The model finds and reads material itself with tools like `grep` and `read` | The model | After coding agents became common |
| Compaction and isolation | Older work becomes a summary, or another context reads and returns only conclusions | Host and model together | After long tasks became routine |

These approaches are not mutually exclusive; most systems today combine them. Knowing why each appeared helps you judge which one your task needs.

## Pre-retrieval: the only option when windows were small

The 2020 RAG paper established “retrieve, then generate” as a general method: a retriever finds relevant passages in an external corpus and passes them to a generator. [RAG](https://arxiv.org/abs/2005.11401) By 2023, most models had windows of a few thousand to a few tens of thousands of tokens, too small for even a moderately long document. Answering questions about internal material meant chunking, building a vector index, and taking the top few chunks by similarity. The vector database boom started here.

The strengths remain real: however large the corpus, only a small part is used, and cost and latency stay predictable. The problem is that the retrieval program chooses what to include before the model sees anything. Chapter 4 described a chunking risk: if “amounts are in cents” falls into the next chunk, numbers in the previous chunk will be misread. [Chapter 4, 4.6](../04-memory.md#46-from-file-memory-to-an-external-knowledge-base) The retriever does not know what the model will reason about next, and the model cannot say “this chunk is not enough; show me the section before it.”

## Long context: fitting is not the same as using well

In February 2024, Google released Gemini 1.5 Pro with an experimental one-million-token window for some developers. [Google: Gemini 1.5](https://blog.google/technology/ai/google-gemini-next-generation-model-february-2024) The phrase “RAG is dead” followed: if an entire codebase or manual fits, why chunk anything?

Research was more cautious. The 2023 paper “Lost in the Middle” found that models performed best when relevant information was at the beginning or end of the input, and noticeably worse when it was in the middle. [Lost in the Middle](https://arxiv.org/abs/2307.03172) In 2025, Chroma tested 18 models and concluded that models do not use their context uniformly; performance grows increasingly unreliable as input length grows. [Chroma: Context Rot](https://www.trychroma.com/research/context-rot) Anthropic calls this context rot and compares context to a finite “attention budget”: every token spends part of it. [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

Beyond quality, there is cost and time. Sending 500,000 tokens means paying for and waiting on them in every request. For agents this compounds: as Chapter 2 explained, every turn of the loop resends the context.

So long context did not replace retrieval; it changed the granularity of the trade-off. Instead of a few chunks, you can include several whole files. The real question shifted from “does it fit?” to “what should go in?”

## Just-in-time retrieval: the coding agent's choice

The same Anthropic article describes a shift: instead of preparing material with embedding retrieval before inference, the agent keeps lightweight references such as file paths and queries, then loads what it needs at runtime with tools. Its example is Claude Code: `CLAUDE.md` goes into context up front, while other files are found and read just in time with tools like glob and grep, avoiding stale indexes and complex syntax trees. The article also notes that this is slower than pre-computed retrieval and depends on good tool design. [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

Pi uses the same combination: `AGENTS.md` loads at the start, as described in [Chapter 3, 3.3](../03-context-engineering.md#33-agentsmd-keep-project-knowledge-beside-the-project); everything else is obtained on demand through `grep`, `find`, and `read`, as in [Chapter 5, 5.4](../05-tools.md#54-search-provides-leads-reading-provides-evidence). Pi's core has no code vector index.

Why does code suit just-in-time retrieval so well? Three reasons:

- **Code has exact names.** Function names, error codes, and configuration keys are strings that can be matched directly; semantic retrieval adds little.
- **Files are always current.** A file edited a moment ago is immediately searchable; there is no gap while an index rebuilds.
- **The model can keep asking.** If the first search is not enough, it tries another keyword or follows an import. This is exactly what Chapter 2's loop is good at.

That does not make vector retrieval obsolete everywhere. When material lives outside the filesystem, is too large to search item by item, or describes the same thing in many different words (as with Chapter 4's “report totals are off” and “cumulative amount error”), semantic retrieval still helps, and some coding tools still build semantic indexes of codebases. Chapter 4's advice stands: verify the benefit with real queries before adopting it.

## Compaction and isolation: subtracting within a long task

Just-in-time retrieval decides what to read, but whatever is read stays in history and keeps taking space. Halfway through a long task, the context is full of old tool output. There are two main remedies.

**Compaction** turns older work into a summary, keeps recent messages, and continues. Pi's compaction works this way; see [Chapter 3, 3.6](../03-context-engineering.md#36-compaction-turn-older-work-into-a-useful-handoff). Anthropic's API also offers finer-grained context editing, automatically clearing stale tool calls and results as the limit approaches; the company reports an 84% reduction in token consumption in a 100-turn web search evaluation. [Anthropic: Managing context](https://claude.com/blog/context-management) Cognition mentions fine-tuning smaller models specifically to compress history, which shows how hard compaction is in its own right. [Cognition: Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)

**Isolation** hands a question that requires heavy reading to another context. A subagent reads dozens of files in its own window and returns a few hundred words to the main session. This is why Pi's subagent extension example starts a separate `pi` process for each subtask; see [Chapter 7, 7.6](../07-general-agent.md#76-collaboration-needs-more-than-additional-models). This path later became the dominant form of multi-agent architecture; see [The Rise and Fall of Multi-Agent Systems](multi-agent.md).

Both are lossy. A summary may turn a tentative guess into a firm conclusion, and a subagent's conclusion may omit a detail the main agent needed. Chapter 3's advice applies to isolation too: keep original sources for exact values and reread them when necessary.

## Choosing how material enters context

Judge by the material's characteristics:

| Material | Better approach |
| --- | --- |
| Short and needed in every task (project conventions, metric definitions) | Load up front, as with `AGENTS.md` |
| In the filesystem with exact names to search (code, logs, configuration) | Just-in-time retrieval |
| Very large, or phrased in many ways (knowledge bases, past tickets) | Pre-retrieval, ideally combined with reading the original text |
| Must be read in full to reach a conclusion, but the main task needs only the conclusion | Isolate it in a subtask |
| Long task whose early work no longer needs to be kept verbatim | Compaction, while keeping the original records available to reread |

Behind all these choices is one judgment: **context is a finite budget; spend it on what the model actually needs to see next.** The name “context engineering” comes from that judgment; for how the names evolved, see [From Prompt Engineering to Harness Engineering](prompt-context-harness.md).

## References

- Lewis et al. [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401). 2020.
- Liu et al. [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172). 2023.
- Google. [Our next-generation model: Gemini 1.5](https://blog.google/technology/ai/google-gemini-next-generation-model-february-2024). 2024-02.
- Hong, Troynikov, Huber. [Context Rot: How Increasing Input Tokens Impacts LLM Performance](https://www.trychroma.com/research/context-rot). Chroma, 2025-07-14.
- Anthropic. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). 2025-09-29.
- Anthropic. [Managing context on the Claude Developer Platform](https://claude.com/blog/context-management). 2025-09-29.
- Walden Yan. [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents). Cognition, 2025-06-12.

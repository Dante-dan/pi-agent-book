# Further Reading

[简体中文](../../../book/notes/README.md) | **English**

[Back to contents](../../README.md)

The main text follows one line: from running Pi for the first time to the loop, context, memory, tools, extensions, and continuous improvement. But knowledge is a network, and every mechanism on that line connects to other designs, products, and eras. This section collects the branches: material relevant to the current question that would interrupt the main line if expanded in place.

Each note stands alone. Its header states where it branches from the main text, which concepts it assumes, and what to read next; the matching place in the main text links back with a “Further reading” pointer.

## Notes

| Note | Questions it answers | Branches from |
| --- | --- | --- |
| [Who Decides the Next Step: Workflows, Plan-and-Execute, and the Agent Loop](control-structures.md) | What control structures exist besides the agent loop? Why were they popular, and why did they fade? What does removing the todo tool show? Will models eat the harness? | [Chapter 2, 2.4](../02-runtime.md#24-what-the-loop-does-and-when-it-ends), [Chapter 6, 6.5](../06-extensibility.md#65-recovery-requires-more-than-an-in-memory-variable) |
| [From Prompt Engineering to Harness Engineering: New Names, a Shifting Focus](prompt-context-harness.md) | What do prompt, context, and harness engineering each focus on? How did the weight of the work move as the names changed? | [Chapter 1, 1.1](../01-first-agent.md#11-know-what-you-are-using), [Chapter 8, 8.1](../08-evolution.md#81-ask-where-the-change-happened) |
| [When the Model Cannot See Everything: Retrieval, Long Context, and Isolation](context-strategies.md) | Why did RAG, long context, just-in-time retrieval, and compaction with isolation each appear? Why do coding agents favor grep over vector indexes? | [Chapter 3, 3.1](../03-context-engineering.md#31-the-context-window-is-not-memory-for-the-entire-project), [Chapter 3, 3.6](../03-context-engineering.md#36-compaction-turn-older-work-into-a-useful-handoff) |
| [The Shapes of Memory: From Vector Stores to a Folder](memory-shapes.md) | What are the trade-offs of vector memory, memory streams, tiered memory, product memory, and files? Why did many systems return to files? | [Chapter 4, 4.1](../04-memory.md#41-four-storage-scopes), [Chapter 4, 4.6](../04-memory.md#46-from-file-memory-to-an-external-knowledge-base) |
| [How Tool Calling Got Here: From Text Parsing and Function Calls to MCP and Code](tool-calling.md) | What stages did tool calling go through? What problem did MCP bring? Why the return to a few general tools and code? | [Chapter 5, 5.2](../05-tools.md#52-a-few-basic-tools-can-support-many-tasks), [Chapter 5, 5.8](../05-tools.md#58-discover-tools-on-demand-as-the-catalog-grows) |
| [The Rise and Fall of Multi-Agent Systems: From “Virtual Companies” to a Main Agent with Subtasks](multi-agent.md) | Why did role-based multi-agent systems fade? What did each side of the 2025 debate argue? When is splitting worth it? | [Chapter 2, 2.7](../02-runtime.md#async-execution), [Chapter 7, 7.6](../07-general-agent.md#76-collaboration-needs-more-than-additional-models) |

## Handling a branch

When writing reaches a branch, choose by its relationship to the main line:

| Situation | Handling |
| --- | --- |
| The current paragraph cannot be understood without it | Expand it in place |
| It aids understanding but would interrupt the main line | Write a note; leave a one-sentence conclusion and a “Further reading” link in the text |
| It is a main line in its own right, needing several sections | Discuss it as a new chapter |
| Another chapter already covers it | Link to that section instead of repeating it |

Notes follow the same conventions as the chapters: start from a concrete situation, cite conclusions, and link Pi mechanisms to pinned source. Unlike chapters, notes may discuss systems, history, and debates beyond Pi, but must separate verified facts from opinions.

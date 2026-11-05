# Source Guide

Implementation explanations are pinned to [Pi commit f07218c4 (v0.87.1)](https://github.com/earendil-works/pi/tree/f07218c4d4bbc12bef056a7058c3dd49dfe41abe). These are starting points; chapter line links locate finer details.

Find inputs, state transitions, returns, and error paths before following helpers. Aspirations, example comments, and executed code are different kinds of evidence.

| Mechanism | Source entry | Chapters |
| --- | --- | --- |
| Installation version, Node requirement, npm name | [package.json](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/package.json) | 1 |
| First use, authentication, common commands | [quickstart.md](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/quickstart.md) | 1 |
| Built-in TUI and session responsibilities | [interactive-mode.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/modes/interactive/interactive-mode.ts) | 2 |
| Independent terminal UI library | [pi-tui README](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/tui/README.md) | 2 |
| Model/tool loop and truncation protection | [agent-loop.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/agent/src/agent-loop.ts) | 2, 5 |
| State, queues, subscribers | [agent.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/agent/src/agent.ts) | 2 |
| Coding Agent assembly | [sdk.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/sdk.ts) | 2, 6 |
| Application-to-model message conversion | [messages.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/messages.ts) | 2 (location/responsibility), 3 (full example) |
| System prompt and tool advice | [system-prompt.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/system-prompt.ts) | 3 |
| Project instructions, system files, discovery | [resource-loader.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/resource-loader.ts) | 3, 4 |
| Skill discovery, metadata, progressive disclosure | [skills.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/skills.ts) | 3, 8 |
| Compaction budgets and cut points | [compaction.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/compaction/compaction.ts) | 3 |
| JSONL, tree history, branches, recovery | [session-manager.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/session-manager.ts) | 4, 6 |
| Entry format, including model-view-only context_edit | [session-format.md](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/session-format.md) | 4 |
| Request assembly: prompt, history, tools | [how-pi-works.md](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/how-pi-works.md) | 2, 3 |
| Automatic compaction and session lifecycle | [agent-session.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/agent-session.ts) | 3, 6, 8 |
| Built-in tools and combinations | [tools directory](https://github.com/earendil-works/pi/tree/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/tools) | 5 |
| Extension API, events, tool definitions | [extensions/types.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/extensions/types.ts) | 6, 8 |
| Sequential event processing across extensions | [extensions/runner.ts](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/extensions/runner.ts) | 3, 6 |
| Subprocess control protocol | [rpc.md](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/rpc.md) | 6, 7 |
| JSON event output | [json.md](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/json.md) | 8 |
| Project trust and real permissions | [security.md](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/security.md) | 1, 6, 7 |
| Versioned skill/extension distribution | [packages.md](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/packages.md) | 6, 8 |

## Suggested reading order

Start with `createAgentSession()` for assembly, then follow `Agent` into `agent-loop.ts`. After understanding a turn, trace a minimal tool such as `write.ts` from arguments to disk. Return to `session-manager.ts` for persistence, then compaction and extensions for changes to the next request.

The repository also contains newer persistent-harness paths. This book primarily follows terminal Coding Agent through the SDK and explicitly identifies other paths. Similar names do not imply identical defaults or scheduling guarantees.

## External asynchronous-protocol comparisons

Chapter 2 compares the pinned ordinary loop with other protocols. Model names alone cannot establish host behavior. These official references were checked on 2026-09-14:

- [OpenAI asynchronous tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling): Astra tool definitions, execution responsibilities, and result association.
- [gpt-realtime announcement](https://openai.com/index/introducing-gpt-realtime/): asynchronous function calling is not exclusive to Astra; evaluate the model/API combination.

These pages change. API capabilities are not presented as experimentally enabled in Pi's ordinary path.

## Strength of conclusions

Sources establish implementation along particular paths, not reliability across all models. Arguments about escaping, partial reading, and independent acceptance are engineering analyses of interfaces and failures. Validate performance improvements with your own tasks.

[Back to contents](README.md)

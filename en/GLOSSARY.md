# Glossary

| Term | Meaning in this book |
| --- | --- |
| LLM | A large language model generates text or tool requests from current input; it differs from the program executing tools. |
| Agent | A system organizing model, context, and tools into an observation/action loop. |
| Harness | Runtime framework surrounding a model, organizing context, calls, state, and lifecycle. |
| Environment | Files, processes, databases, webpages, users, and other objects observed or acted on through interfaces. |
| Context | Material actually supplied to this model call, not all information on disk. |
| Token | A model input/output unit with no fixed conversion to characters, words, or bytes. |
| Prompt | Task or behavior instructions; natural-language requirements are not system permission boundaries. |
| Tool | An interface with a name, description, input contract, and execution logic. The model requests; the host executes. |
| Schema | A description of data structure, such as required fields and string/number types. |
| JSON | Structured text using objects, arrays, strings, and other values, such as `{"count":2}`. |
| JSONL | One JSON value per line; systems can still use entirely different record schemas. |
| Markdown | Plain-text markup for headings, lists, links, and code blocks, used by this book. |
| Mermaid | Text syntax for diagrams that GitHub renders from code blocks. |
| CLI | Command-line interface, such as entering `pi` in a terminal. |
| SDK | Programmatic interfaces for embedding Pi in an application. |
| RPC | Communication allowing one program to request operations in another process; Pi uses JSON messages. |
| Node.js | JavaScript runtime required by the Pi CLI. |
| TypeScript | JavaScript with type expressions, widely used in Pi's core and extensions. |
| Session | Persisted conversation and state spanning runs and possibly tree branches. |
| Turn | In the runtime chapters, one model response and its triggered tool execution. |
| Trajectory / trace | Messages, calls, and results recording what happened during execution. |
| Compaction | Summarizing older work while retaining recent material to reduce future context usage. |
| Skill | On-demand methods and reference material; not automatically a registered tool. |
| Extension | Host-executed code registering tools, handling events, and maintaining state. |
| RAG | Retrieval-augmented generation: retrieve relevant material before answering; a vector database is optional. |
| Vector index | Retrieves semantically similar numerical content representations; similarity proves neither truth nor authorization. |
| Cursor | A continuation token for the next results; increasing a limit is not cursor pagination. |
| Git commit | An identified code version; pinned links prevent drift as main changes. |
| Fork | For repositories, a derived repository; for Pi sessions, another session from a historical position. |
| Idempotency | Repeating a business request does not repeat an effect meant to occur once. |
| Sandbox | An execution-isolation boundary supplied by OS, virtualization, or restricted services, not a prohibition in a prompt. |

[Back to contents](README.md)

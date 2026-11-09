# Contributing

Contributions correcting facts, improving beginner explanations, and strengthening repeatable exercises are welcome.

Distinguish mechanism exercises from integrated tasks. Fixed-formula exercises teach calls but do not establish a need for LLMs. Integrated tasks need unfixed investigation steps, ambiguous evidence, or changes affecting plans, plus sources, answers, and verifiable limits. Generalization requires changed problem structure, not renamed samples.

## Factual corrections

Identify the chapter, problem, Pi version, and pinned source. For observed behavior, include command, environment, input, and output. One success is not proof of universal success.

Check defaults, options changing behavior, and failure/boundary cases together. Distinguish built-ins, official examples, third-party extensions, and proposed architecture.

## Writing conventions

Begin each chapter with people, materials, and an obstacle, then provide a reading route and chapter connections. Give enough background before terminology, principles, APIs, and steps. Continue established scenarios naturally instead of repeating them or mechanically adding “suppose.” Place itemized answers immediately after exercises. Design answers need concrete proposals; experiments must distinguish expectations, failures, and actual observations.

Give each mechanism one primary explanation. Other chapters should retain only necessary examples, conclusions, and links rather than preempt later implementations. Moving content requires updating exercises, references, indexes, and anchors. Separate principle, implementation, and application when each answers a different question.

Prefer readable JavaScript-like pseudocode with `while`, `if`, arrays, functions, and explanatory comments. Omit irrelevant types and details. Label custom helpers and non-runnable sketches; never present them as actual APIs. Explain principles through concrete failures and link to related chapters.

Explain concepts on first use. Prefer a continuing example for causes, process, and results before introducing interfaces. Put runnable programs in `examples/` with instructions. Use Mermaid in Markdown for GitHub-readable diagrams.

Write original technical explanations. Do not copy third-party books, diagrams, or long documentation passages. Preserve license and attribution for necessary code quotations. Prefer pinned source links over changing blogs or main-branch references.

Keep the Chinese and English editions aligned. Executable examples are shared; run commands from the repository root. Maintain cross-edition navigation and translated anchors when editing headings.

## Further reading and branches

The book is organized like a knowledge base: chapters follow one main line, and at each branch you choose, per the [further-reading guide](book/notes/README.md#handling-a-branch), whether to expand in place, write a note, propose a new chapter, or link to an existing section.

When adding a note:

- Put it in `book/notes/` with a same-named English version in `en/book/notes/`.
- Start with “Branches from,” “Prerequisites,” “Continue with,” and “Sources checked.”
- At every chapter location listed under “Branches from,” add a `> **Further reading**` link back to the note, and vice versa.
- Register it in the list in `book/notes/README.md`.
- When discussing other products or history, rely on primary sources (papers, official documentation, pinned changelogs). Attribute reported opinions and keep them separate from verified facts.

`scripts/check-book.py` verifies registration, edition parity, and two-way links between notes and chapters.

## Before submitting

```bash
python3 scripts/check-book.py
node examples/order-report/selftest.mjs
```

With the pinned source checkout:

```bash
python3 scripts/check-book.py --pi-source /path/to/pi
```

The checker validates links and fences, not technical truth. Behavior changes still require source review or experiments. State which checks actually ran and which did not.

Submitting means you have the right to contribute under the project's text and code licenses.

# Verification Record

Verification date: 2026-11-01, rechecked after upgrading Pi to 0.87.1; initial verification was 2026-09-14. This record separates execution, source review, and untested scope. Teaching sketches are not experiment results. The English edition preserves this historical record; translating it does not imply rerunning those experiments.

## Actually executed

| Item | Method | Result |
| --- | --- | --- |
| Pi CLI | Install `@earendil-works/pi-coding-agent@0.87.1`; run `--version` and `--help` | Version `0.87.1`; documented/scripted options exist |
| Order exercise | `node examples/order-report/selftest.mjs` | Initial bug detected; reference passed five inputs; checker modifications rejected |
| Real tool contracts | Install pinned dependencies in `examples/tool-contract`, then `npm test` | Literal special characters, line reads, `edits[]`, and 2000-line notices passed |
| Book structure | `python3 scripts/check-book.py` | Eight chapters, relative links, anchors, fences, navigation passed |
| Pinned source references | Checker with `--pi-source` at pinned checkout | Commit, paths, line ranges passed |
| Live-model scripts | Event-parser/context-selection self-checks and four dry-runs | Preparation passed |
| Live models | On 2026-11-01, `google/gemini-3.8-flash`; repair/skill/session/context once each on Pi 0.85.1 and 0.87.1 | Eight lab executions passed automatic acceptance; replies manually reviewed; see [lab guide](examples/live-model/README.md) |
| Diagram syntax | Mermaid 11.17.2 `parse()` with DOM | On 2026-11-03, after four diagrams were updated for 0.87.1, all twelve parsed; an intentionally broken diagram confirmed error detection. Syntax is not visual acceptance on every device |

CLI/tool tests used macOS arm64 and Node.js 22.19.0. Live-model runs on 2026-11-01 used Node.js 22.16.0, below Pi's declared minimum, without runtime errors. Dependencies used `--ignore-scripts`. Credentials were excluded from the public repository. Tool-contract tests did not call model services.

The order checker evaluates a teaching example and executes its JavaScript. It detects normal calculation errors and protected-file edits but is not a same-privilege malicious-code sandbox.

## Source review

All chapters use [v0.87.1's pinned commit](https://github.com/earendil-works/pi/tree/f07218c4d4bbc12bef056a7058c3dd49dfe41abe). Review focused on model/message ordering, defaults and parallel scheduling, argument compatibility, truncation, project and skill loading, compaction cuts/recovery, tree history, extension visibility, lifecycle, and project-trust limits.

Terminology was cross-checked: underlying-loop end, persistent session, and settled run differ; saved extension state need not be visible; dynamic registration does not supply business discovery; search limits do not supply cursor pagination.

Same-version npm and source were checked separately. File-for-file identity was not claimed.

### Rechecking the upgrade from 0.85.1 to 0.87.1

There were 146 commits between original post-v0.85.1 `71dca871` and v0.87.1 `f07218c4`:

1. Whole-file diffs mapped every line reference to the new version. Four surrounding lines were compared, with low similarity reviewed manually. More than ten old references on blank/adjacent lines were corrected too.
2. About twenty rewritten/reorganized references were manually relocated. Old README references for sessions, trust, default tools, and design tradeoffs moved to `docs/sessions.md`, `docs/cli.md`, `docs/security.md`, `sdk.ts`, and the official sub-agent example.
3. Changelogs for three packages across 0.86.0–0.87.1 were read. Automated screening of backticked identifiers found only `shouldStopAfterTurn` absent from the new source.
4. Actual diffs of referenced files were reviewed chapter by chapter for continued validity.

Changes included system prompt/tool declarations as `system` messages (Chapters 2, 3, 6); `context` excluding system messages and new `context_with_system` (2, 6); `finishTurn` replacing `shouldStopAfterTurn` (2); per-request session reconstruction and `context_edit` (4); changed `/fork` wording (4); model-specific image scaling (5); incremental dynamic tools and fail-closed `user_bash` (6); and intervention at `turn_end` and `agent_before_settle` (8).

Four diagrams were updated: package relationships now show rereading session records before each request; context flow includes system/conversation/results entering records before rebuilding; tool discovery appends system declarations; event flow adds `context_with_system`, `turn_end`, and `agent_before_settle`. Eight conceptual or unchanged-mechanism diagrams remained. Another correction clarified that context files load after the trust decision, regardless of its result; old and new source behave the same here.

## Teaching revisions

All eight chapters gained reading routes and exercise answers, with JavaScript-like mechanism sketches and cross-checked references. Minimal-loop and full stopping rules were separated; transforms gained concrete input/output; ordinary tool parallelism was distinguished from native asynchronous protocols. Session-tree selection, prefill, summaries, and forks were source-reviewed. UI procedures are reproducible instructions, not claims of fresh model experiments.

Design answers and hypothetical evaluation data are explicitly labeled rather than presented as actual results.

Scenarios and transitions were reviewed to supply sufficient context before terms, parameters, principles, and exercises, consolidating repeated setup. This was editorial review; link/format checks do not validate reader understanding.

Package and skill diagrams were relabeled by source ownership, checking `InteractiveMode`'s `pi-tui` use, dependencies, resource loading, catalog format, and explicit expansion. Syntax passed; no new TUI/model experiment was claimed.

Full skill discovery and message-conversion examples now live in Chapter 3; Chapter 2 retains ownership, call sites, and brief examples. Background interfaces live in Chapter 5, while event wiring, dynamic activation, and recovery APIs live in Chapter 6. Exercises and references were updated. Compaction generation and restoration remain in Chapters 3 and 4 because they answer different questions.

## Integrated investigation

Two fictional evidence stages, preparation, rubric, and answers were added. Setup calls no model, excludes answers, and refuses existing stage files. Both deliveries, duplicate-delivery rejection, and sample numbers were locally checked. The path and memo remain reference solutions without a real-model trace. Variant tables specify future tasks rather than completed generalization tests.

The fixed order summary is a mechanism subexercise; the integrated case demonstrates clarification, evidence selection, and plan revision. No claim establishes that an LLM is the only or superior solution.

## Not executed

Live-model labs used one model once on each of two Pi versions; other models and reruns may differ. The integrated investigation has no real-model trace. Not every exercise was run with paid models. Real-model compaction, long-term retrieval, collaboration, provider deferred loading, and unattended publication were not established as verified experiments. Chapters label these as mechanisms, expected observations, or proposed architecture.

No cross-model success comparison establishes universally better prompts/skills. Business data is fictional; numerical conclusions follow explicit samples and rules.

Links prove existence and valid ranges, not every technical sentence. Source review remains necessary, especially after Pi upgrades.

## Continuous checks

GitHub Actions runs structure checks, order self-tests, real tool contracts, and local live-model self-tests/dry-runs on pushes and pull requests. It calls no model service and accesses no private data. Local pinned-source ranges and Mermaid parsing are outside default CI.

The bilingual structural checker also validates English chapter navigation and relative links. Shared executable examples retain their existing behavior.

[Back to contents](README.md)

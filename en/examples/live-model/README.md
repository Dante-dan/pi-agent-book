# Companion Labs with Model Access

Security note: these scripts require historical Pi 0.87.1, whose published dependencies have known vulnerabilities. They have not been upgraded or validated as 1.5.0 model experiments. Do not use them for production or untrusted material; reproduction needs a separately restricted environment. See [security notes](../../SECURITY.md).

These labs run actual models through Pi and save traces and acceptance results. They differ from [direct tool tests](../tool-contract/README.md): correct functions do not guarantee correct model selection or use.

**Recorded release status:** all scripts passed local static checks, event parsing, and dry-runs. On 2026-11-01, A/B/C/D each ran once using `google/gemini-3.8-flash` on Pi 0.85.1 and 0.87.1; both rounds passed automatic acceptance. Records follow below. One run per version does not guarantee other models or repeats.

For ambiguity and changing requirements, use the [integrated investigation](../investigation/README.md). These four deliberately narrow labs verify repair, skills, sessions, and context mechanisms, not open-task generalization. Both editions share executable scripts; their generated teaching prompts and some fixture text remain in Chinese. The English instructions explain their rules and results.

## 1. Configure an account

Requires Node.js 22.19.0 or later and Pi 0.87.1:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.87.1
pi --version
pi
```

Inside Pi, use `/login` and `/model` to configure a supported account/API key and a tool-capable model. See [version-pinned providers](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/providers.md).

Send a short introductory request to confirm access, then `/quit` and run:

```bash
pi --list-models
```

Replace `YOUR_PROVIDER` and `YOUR_MODEL_ID` below with actual IDs. Available models and prices change; these labs prescribe no best provider.

Configure authentication through Pi or environment variables. Do not put keys in commands, code, commits, or issues. No credentials need be shared with this book's author.

## 2. Dry-run before execution

From the repository root:

```bash
node examples/live-model/run.mjs repair --provider YOUR_PROVIDER --model YOUR_MODEL_ID
```

By default, this creates fictional inputs and `manifest.json` without starting Pi or requesting a model. Inspect the manifest, then execute:

```bash
node examples/live-model/run.mjs repair --provider YOUR_PROVIDER --model YOUR_MODEL_ID --execute
```

Each run creates a fresh directory under `.workshop/live-model/`. `--pi /path/to/pi` chooses the binary; `--timeout 300` changes the per-stage process limit from 180 seconds.

Execution consumes account quota. Timeout is **not a token/currency cap or a rollback guarantee**. Repairs can call models repeatedly. Start small and inspect actual usage. Inputs are fictional, but the process retains your permissions; a working directory is not a sandbox.

Scripts explicitly select models, disable automatic extension/skill/template/context discovery, and reject project resources. The skill lab explicitly loads its generated teaching skill. `--offline` disables startup update checks, **not model API calls**. These settings reduce interference, not provider variability.

## 3. Lab A: real repair and independent acceptance

The `repair` lab uses Chapter 1's program with `read/bash/edit/write`. It requests only `report.mjs` changes, preservation of data/checker, and check execution.

Independent acceptance tests five inputs, compares protected files, and confirms actual tool activity. Merely replying “3500 cents, done” cannot pass.

Inspect whether the model reads rules/data, responds to failure, and reports consistently with independent checks. Diagnose the first wrong evidence in a failed trace. The checker executes generated JavaScript and is not hostile-code isolation.

**Recorded run, 2026-11-01, `google/gemini-3.8-flash`:** both passed `PASS: 5 cases; orders.json and check.mjs unchanged`.

| Pi | Model calls | Tool calls | Input tokens | Cost |
| --- | --- | --- | --- | --- |
| 0.87.1 | 9 | 8: three reads, one edit, checks/program, git status, reread | About 24,600 | About $0.023 |
| 0.85.1 | 10 | 11: additional initial ls/git queries | About 28,600 | About $0.026 |

Both added a `status === 'paid'` condition and correctly reported two orders and 3500 cents. Both independently ran `git status`; 0.85.1 also ran `git check-ignore`. These read-only commands could see beyond the ignored `.workshop/` directory, illustrating the lack of sandboxing.

## 4. Lab B: automatic skill discovery versus explicit invocation

```bash
node examples/live-model/run.mjs skill --provider YOUR_PROVIDER --model YOUR_MODEL_ID --execute
```

The script creates a `report-check` skill and three orders. One independent session receives a natural checking request; another explicitly invokes `/skill:report-check`.

The body contains unique marker `REPORT-CHECKED-V1` and requires correct amount/count. Results record skill-file reads, the marker, and expected numbers. Explicit expansion occurs in the host and need not cause a read call, so identical read-count criteria would be wrong.

Numbers/markers are only coarse filters. Manually confirm 3500 cents and two paid orders. Automatic nonselection is recorded honestly; inspect descriptions before blaming discovery. Compare changed descriptions with unchanged data.

**Recorded run, 2026-11-01:** once per version, both passed with matching behavior.

| Stage | Read SKILL.md? | Marker | Answer | Model calls |
| --- | --- | --- | --- | --- |
| Automatic | Yes, first step | Present | A-001/A-003 included, A-002 excluded; 2 orders, 3500 cents | 3 |
| Explicit | No; host expanded body | Present | Same | 2 |

The automatic path needed an extra read. Two successful selections do not establish universal selection.

## 5. Lab C: cross-process recovery versus a new session

```bash
node examples/live-model/run.mjs session --provider YOUR_PROVIDER --model YOUR_MODEL_ID --execute
```

All stages disable tools:

1. A process receives a random fictional codename and integer-cent convention and saves the session.
2. Another opens that session and asks for both facts.
3. A new session asks without being given the codename.

Automatic checks require the marker in the resumed answer and absent from the new answer; manually review units and honest uncertainty.

This tests cross-process history, not user-profile memory or compaction recall. Not knowing in the new session illustrates scope rather than a defect.

**Recorded run, 2026-11-01:** once per version, both passed. Resumption recalled codename and integer cents; new sessions said they lacked evidence instead of inventing facts. Each stage used one model call, totaling about $0.004 per run.

## 6. Lab D: who selects materials before each model call?

See [Chapter 2](../../book/02-runtime.md#message-transforms).

```bash
node examples/live-model/run.mjs context --provider YOUR_PROVIDER --model YOUR_MODEL_ID --execute
```

Twenty orders include eight requests and three completed refunds. `rules.json` contains METRIC-01 for requests and DEC-02 for completions. Three stages ask for the refund rate:

| Stage | Extension | Rules | Expected observation |
| --- | --- | --- | --- |
| `select` | Yes | Available | Fetch once, inject DEC-02 before every call, answer 3/20 = 15% |
| `missing` | Yes | Deliberately unavailable | Inject missing-rule notice; first line `RULES-MISSING`, no invented definition |
| `baseline` | No | None | Record behavior without supplying a definition; not scored |

Read [context-rules.mjs](../../../examples/live-model/context-rules.mjs), under seventy lines. It:

1. Selects the effective dated rule in `before_agent_start` and caches it. It returns no message because returned messages would persist.
2. Removes previous `refund-rules` injections in `context`, adds current rules, and logs each execution.
3. Explicitly injects missing-rule information instead of silently skipping it.

`result.json` checks:

| Check | Meaning |
| --- | --- |
| `fetchedOncePerRequest` | One retrieval per user request |
| `contextRanBeforeEveryModelCall` | Handler/model counts match, at least twice |
| `notWrittenBack` | No previous injection in subsequent input or session file |
| `usedCurrentRule` | Orders read; answer includes 15% or 3/20 and DEC-02 |
| `missingReported` | Missing rules produce `RULES-MISSING` |

**Recorded run, 2026-11-01:** once per version, all checks passed. Each stage read orders then answered in two model calls.

- `select`: two context executions, one retrieval. The second history was `user, assistant, toolResult`, without prior injection or system messages. From 0.87.1 system/tool declarations are stream messages but excluded from `context`. The answer used DEC-02 and R004/R009/R015 for 15%.
- `missing`: began `RULES-MISSING`, explained the undefined numerator, and supplied no number.
- `baseline`: both runs supplied 15% and 40% under two definitions. That is not inherently wrong, but leaves definition selection to the model or user.

Three stages totaled roughly 8,000–9,500 input and 2,600–2,900 output tokens, with provider-reported cost about $0.015–$0.017 per run. These small samples may vary. The machine used Node 22.16.0, below the declared minimum, without errors; use the supported version.

Try `CONTEXT_LAB_DATE=2026-08-15` to select METRIC-01, or remove deduplication from `buildContext` and inspect `outgoingCount`. `notWrittenBack` explains why per-request injections do not accumulate in saved history.

## 7. Read artifacts, not just PASS

| File | Purpose |
| --- | --- |
| `manifest.json` | Provider/model/Pi version, time, commands, stage timeouts |
| `*.events.jsonl` | Actual events, calls, final messages |
| `*.stderr.txt` | Diagnostics |
| `*.session.jsonl` | Persistence format, distinct from events |
| `result.json` | Checks, answers, calls, usage, limits |
| `workspace/` | Fictional inputs and actual outputs |
| `expected.json` | Random session marker for acceptance only |
| `rules.json`, `*.context-log.jsonl` | Rule store and per-context-call logs |

Authentication, limits, network failures, timeouts, and incomplete streams must not be presented as success. Retain failed directories; reruns create fresh ones.

Logs can contain model content and local paths. `.workshop/` is ignored by Git. Review before publishing evidence and exclude authentication directories. Provider usage is not a final bill.

## 8. Further work: observe compaction manually

Use [Chapter 3's exercise](../../book/03-context-engineering.md) in a longer conversation, save fictional constraints, and `/compact`. Compare the summary, retained segment, and originals for recall and rereading needs.

Do not waste hundreds of thousands of tokens to trigger automatic compaction. Short histories may not compact; the goal is locating entry, retention, and loss, not exhausting capacity.

## Check scripts without an account

```bash
node examples/live-model/selftest.mjs
node examples/live-model/run.mjs repair --provider demo --model demo
node examples/live-model/run.mjs skill --provider demo --model demo
node examples/live-model/run.mjs session --provider demo --model demo
node examples/live-model/run.mjs context --provider demo --model demo
```

The final four are dry-runs. `demo` is a placeholder, not a real model. CI runs local checks only, without credentials or model charges.

[Back to contents](../../README.md)

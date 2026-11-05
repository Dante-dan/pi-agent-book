# Security Notes

[简体中文](../SECURITY.md)

## Dependency revision: 2026-11-05

`examples/tool-contract` was upgraded from Pi 0.87.1 to 1.5.0. Its lockfile now uses `undici 8.12.3`, `minimatch 11.0.3`, and `brace-expansion 5.0.12`, resolving the related audit findings. These include [undici TLS validation bypass](https://github.com/advisories/GHSA-2m5v-pch6-74hx), [minimatch resource exhaustion](https://github.com/advisories/GHSA-g3hv-75wg-m249), and [brace-expansion resource exhaustion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).

The 0.87.1 npm package supplies its own shrinkwrap. The root overrides attempted here did not replace those vulnerable dependencies, so the lab uses an official newer release and reruns its contracts. The lockfile was not manually rewritten to hide alerts.

From the repository root:

```bash
cd examples/tool-contract
npm ci --ignore-scripts
npm test
npm audit --audit-level=low
```

CI also audits dependencies. Zero known vulnerabilities describes this dependency tree at audit time, not proof that every program or execution mode is risk-free.

## Historical book and model labs

The book remains based on pinned Pi 0.87.1 source. Original live-model scripts still enforce that version to preserve historical reproduction. Their global installation commands do not use the tool lab's new lockfile. A clean lab audit does not apply to a separately installed old global Pi.

Do not use the historical environment for production or untrusted inputs. Reproduction requires a separately restricted environment, fictional data, and limited mounts, network access, and credentials. Actual deployments should separately select a patched version. This revision does not establish revalidation of the entire book or original model experiments on 1.5.0.

Neither Pi nor the teaching verifier is a malicious-code sandbox. `--ignore-scripts` restricts installation lifecycle scripts, not later program execution. Model labs default to dry-run; explicit `--execute` requests a model.

## Evidence delivery

Investigation `setup.py` rejects existing stage files, including dangling symlinks, and writes through exclusive creation to reject files introduced after preflight. Users choose the destination; this is not a complete filesystem sandbox against malicious same-privilege processes. CSV inputs, staged questions, and answer separation remain unchanged.

Logs in Git-ignored `.workshop/` may contain local paths and model content. Review selected evidence before publishing and exclude authentication directories and real business data.

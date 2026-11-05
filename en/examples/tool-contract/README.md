# Observe Pi's Tool Contracts Directly

Use with [Chapter 5](../../book/05-tools.md). The program invokes actual Pi 0.87.1 tools without a model, API key, or user extensions. Files live in an automatically cleaned temporary directory.

Requires Node.js 22.19.0 or later. From the repository root, enter the shared executable directory:

```bash
cd examples/tool-contract
npm ci --ignore-scripts
npm test
```

Checks:

1. `write` preserves dollar signs, backticks, and newlines.
2. `read` respects line offsets and limits.
3. `edit` accepts this version's `edits` array and replaces text.
4. Reading 2005 lines by default reports the 2000-line range and continuation at `offset=2001`.

Expected output begins `PASS: literal write`. This demonstrates tool behavior for fixed cases, not that models always select correct tools or arguments. Other versions, images, and all error paths are outside this test.

# Order Summary Exercise

Use with [Chapter 1](../../book/01-first-agent.md). Requires only Node.js, with no third-party dependencies or network requests. Commands run shared code from the repository root.

```bash
node examples/order-report/setup.mjs
cd .workshop/order-report
node check.mjs
pi
```

The initial failure is intentional. Ask Pi to modify only `report.mjs`, summarizing `paid` orders. After repair:

```bash
node check.mjs
node ../../examples/order-report/verify.mjs .
```

The external verifier retains original data and checker copies, confirms they are unchanged, and tests five inputs. It still executes the JavaScript being checked: this is not malicious-code isolation. Inputs contain no real orders or credentials.

Without model access, read [the reference solution](../../../examples/order-report/solution/report.mjs). From the repository root, verify that the defect is detected, the solution passes, and checker tampering is rejected:

```bash
node examples/order-report/selftest.mjs
```

Setup refuses existing directories. Repeat with another destination:

```bash
node examples/order-report/setup.mjs .workshop/order-report-2
```

Amounts are integer cents. Only orders still `paid` count; `refunded`, `pending`, and other statuses do not. Taxes, conversion, partial refunds, and net cash flow are outside scope. Add explicit rules and independent cases before expanding it.

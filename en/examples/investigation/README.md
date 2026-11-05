# Integrated Lab: More Refunds—Should We Roll Back?

Your team exposes a redesigned checkout to some users. Refunds seem higher, and the lead needs a decision by morning. Orders, support records, and release notes are available but not yet connected.

Ask Pi to inspect materials, clarify metrics, and choose analyses. After round one, provide changed data and requirements. Separately evaluate arithmetic, evidence, uncertainty, and plan adaptation.

All materials are fictional and small enough to review manually. This illustrates a task shape, **not superiority over a purpose-built program** or a model ranking. Chapter 1's repair and the earlier mechanism labs are deliberately narrower.

Status: staged delivery and numbers were checked locally. This integrated lab has no real-model completion trace. The following is a reference path, not execution logs.

## Preparation: deliver stage one only

Requires Python 3 and Pi configured through the [model-access guide](../live-model/README.md). Setup calls no model. Run from the repository root:

```bash
python3 examples/investigation/setup.py --language en --stage 1 --dest .workshop/investigation-01
cd .workshop/investigation-01
pi
```

Send this inside Pi. Do not supply this guide, answers, or later materials:

> Read request.md and investigate it. Save first-round findings to output/round1.md, with evidence, unknowns, and questions for me. You may write scripts; preserve inputs. Do not read the book, answers, or future materials outside this practice directory.

This is an experimental instruction, not isolation. Pi retains process permissions. Formal blind tests need an environment that cannot access answers or stage two. Record the `/session` ID, scripts, outputs, and trace.

Stage one contains the request, forty orders, old metrics, release notes, and support excerpts. Do not preselect customer grouping for the model. Do not require an arbitrary question count: it can compute settled facts first and identify missing evidence.

### Stage-one exercise and answer

**Exercise:** Did it directly equate higher refunds with redesign causation? Did it inspect denominators, customer mix, exposure, and support sampling?

**Reference answer:** `orders.csv` and METRIC-01 support request rates:

| Metric | before | after |
| --- | --- | --- |
| Overall request rate | 3/20 = 15% | 8/20 = 40% |
| Existing customers | 1/16 = 6.25% | 0/4 = 0% |
| New customers | 2/4 = 50% | 8/16 = 50% |
| New-customer share | 4/20 = 20% | 16/20 = 80% |

The 25-percentage-point increase coincides with customer-mix changes; grouped values do not show the same overall rise. This challenges attribution from aggregates alone but does not prove no effect. Samples are small, exposure missing, controls absent, and acquisition changed too.

T01/T02 refer to A17, not two independent customers. T06 raises button wording but has no order ID. Shipping confusion, delivery, address errors, and hesitation are distinct leads. Preserve original wording and sources; do not attribute every refund to the page.

Clarify requests versus completions, rollback versus pausing expansion, exposure, equal windows, and controls. Round one needs sourced preliminary findings and open questions, not just a correct table.

## Stage two: preserve earlier judgment, then introduce changes

After round one, open another terminal and run from the repository root:

```bash
python3 examples/investigation/setup.py --language en --stage 2 --dest .workshop/investigation-01
```

Return to the same Pi session:

> I added decision-update.md, event-schema.md, and refund-events.csv. Read them before deciding what changes in the plan. Preserve round1.md and write output/decision.md and output/validation-plan.md, explaining the evidence behind updates.

Four things change: requests become completions, order flags become events, observation windows are fourteen versus three days, and the goal becomes rollout decisions and shipping usability. Look for recognition before code/evidence/deliverable changes. Replacing 40% with another number is insufficient.

### Stage-two exercise and answer

**Exercise:** Did it join and deduplicate by order, retain the old metric's identity, and avoid claiming causation without tracking?

**Reference answer:** Completed orders are B01/B17/B18 and A13–A17: 3/20 = 15% and 5/20 = 25% at export. Earlier 15%/40% request rates were arithmetically valid; labeling them completion rates was wrong. Keep both definitions and sources. Counting event rows double-counts orders.

Fourteen versus three days prevents treating these as equally mature final rates. DEC-02 governs this decision without erasing METRIC-01's history or making completion rate universal policy.

A qualifying memo might say:

> Evidence neither proves nor excludes a redesign effect. Higher aggregate request rates coexist with changing customer mix. Provisional completion rates are 15% and 25% under unequal windows. REL-12's shipping change and A17's feedback justify usability investigation but cannot estimate prevalence. Consider briefly pausing expansion while testing shipping visibility, limiting exposure under uncertainty rather than claiming a proven defect. No production change has been executed.

Continued limited rollout with risk, monitoring, and stopping conditions can also be defensible. Do not require every model to recommend pausing; no loss function or company threshold determines a unique optimum here.

A minimal plan compares equivalent tasks on old/new pages, tests whether customers can state shipping and total before payment, defines misunderstanding and discoverability in advance, records exposure and customer groups, uses equal refund windows, and leaves expansion decisions to the lead. A few usability interviews do not guarantee statistical significance or causal refund estimates.

## Evaluation: numbers and decision process

| Dimension | Evidence | Clear failure |
| --- | --- | --- |
| Understanding | Questions and revised delivery | Produces full monthly report after one-page request |
| Evidence acquisition | Actual reads/calls and sources | Claims all users saw new checkout without reading releases |
| Calculation | Reproducible code/input/output | Counts events as refunded orders |
| Uncertainty | Distinguishes cause, association, leads | Treats customer mix as proof of no version effect |
| Adaptation | Definitions, changed plan, old artifacts | Changes conclusion without explaining metrics/windows |
| Action boundary | Actual calls and claims | Unauthorized production changes or invented execution |

This rubric requires human review, not checking for three keywords. Alternative paths and analyses are acceptable if important claims are sourced, unknowns preserved, and changes affect actions.

### Generalization exercise and answer: do not memorize the story

**Exercise:** An evaluator prepares variants in fresh directories/sessions without exposing answers. Keep tools and prompts fixed unless explicitly comparing skills.

| Variant | Required adaptation | Avoid mechanically reusing |
| --- | --- | --- |
| Same customer mix; concurrent recorded exposure; clearly increased shipping confusion | Examine assignment/sample quality and version effect, potentially stop expansion | “Everything is customer mix” |
| Refunds concentrate in documented delivery delays; no shipping feedback | Investigate logistics and explain why checkout rollback is poorly targeted | Shipping-visibility plan |
| Multiple line items per order; line amounts | Establish granularity and order denominators before refund joins | Deleting repeated IDs or rejecting all rows |
| User explicitly wants request-rate monitoring, no causal analysis | Repeatable monitoring and defined thresholds | Unconditionally expanding into causal investigation |

**Reference answer:** Generalization changes plans, tool use, or conclusions, not just names. Retain numerical regressions while testing adaptation. These are task specifications, not complete variant datasets or measured results; evaluators must prepare consistent materials.

For fair comparison, freeze a baseline script, record covered rules/inputs and manual adaptation time. Record agent configuration, cost, time, questions, and errors. Only such evidence supports claims that agents are worthwhile under these changes. Stable tasks with reliable scripts may be better served by direct execution.

[Chapter 7](../../book/07-general-agent.md#changing-task) · [Back to contents](../../README.md)

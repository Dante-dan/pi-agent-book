# Operations Weekly Metric Notes (Previous Definition)

Document METRIC-01, updated 2026-08-20.

In weekly reports, “refund rate” defaults to orders with at least one refund request divided by orders in the same cohort. Count multiple requests for one order once. This document defines neither completed-refund rate nor an observation window for comparisons across weeks.

CSV field `refund_requested` means a request existed by export time, not that a refund completed. `before` and `after` are teaching samples of twenty orders each, not full production data.

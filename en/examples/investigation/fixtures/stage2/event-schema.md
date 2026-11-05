# Refund Event Export Notes

Document EVENTS-02.

`event_id` uniquely identifies an event. `order_ref` joins to `order_id` in orders.csv. `kind=requested` means a submitted request; `kind=completed` means a completed refund. Events are cumulative through export time, and every completion corresponds to a request.

Deduplicate by `order_ref` when counting orders instead of counting event rows. Observation periods differ, so current completion rates are not final completion rates.

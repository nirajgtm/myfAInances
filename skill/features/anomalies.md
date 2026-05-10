# Anomaly Detection

Two phases. Phase 1 runs per-transaction during ingest (sets `anomaly_flags` array). Phase 2 runs after all files in the batch are ingested (cross-account, cross-time signals). Both write events to `db/anomalies.json` with one row per `(txn_id, flag)` pair.

## Flags

- **`new_merchant`**: `merchant_canonical` not seen in the trailing 12 months across any account.
- **`outlier_amount`**: at this merchant, |amount| > mean(trailing-6-month) + outlier_stddev_multiplier * stddev. Default multiplier 2. Skip if mean is below $5 (noise floor).
- **`dup_billing`**: same `merchant_canonical`, same |amount|, two charges within 24 hours on the same account.
- **`card_test`**: 3+ charges from new merchants on the same account within 30 minutes, each below $5. Classic fraud pattern.
- **`late_night`**: 3+ charges between the late-night window (default 00:00-05:00 from `config.yaml`) within 2 hours, on the same account. Time of day requires `date_transaction` to include time; if statements give date only, this flag never fires.
- **`round_number_large`**: |amount| >= 500 AND amount ends in two zeros (e.g., $500.00, $1,200.00, $2,500.00).
- **`fee`**: `type == "fee"` OR `description_normalized` matches the fee regex bank (`(?i)\b(ATM|FOREIGN|OVERDRAFT|NSF|LATE|RETURNED|MAINTENANCE|WIRE)\s*FEE\b` and similar).
- **`foreign`**: `is_foreign == true`.
- **`free_trial_jump`**: see `features/subscriptions.md`. Set on the second-charge transaction.
- **`unwanted_merchant`**: matches a `block` entry in `personal/alerts.yaml`.
- **`large_txn`**: |amount| >= `large_txn_threshold` from `config.yaml` (default $500).

## Mute and override

Before writing an anomaly event, consult `personal/alerts.yaml` mute list. If the merchant matches a mute entry and the flag is in its `flags` array, suppress the event (do not append to `db/anomalies.json`, but do still set the flag on the transaction so the user can see it filtered).

`flag_always` entries always create an event, even if other rules would have suppressed it.

## Confidence

Set confidence per flag:
- 1.0 for deterministic rules (`fee`, `foreign`, `large_txn`, `round_number_large`, `unwanted_merchant`, `dup_billing`, `free_trial_jump`).
- 0.7-0.95 for statistical rules (`outlier_amount`, `card_test`, `late_night`, `new_merchant`) based on how strong the signal is.

## Review state

`reviewed_by_user` and `user_action` are mutated only by explicit user actions ("dismiss this flag", "mark investigated"). Re-running detection never overwrites them.

## Phase 2 (post-batch) checks

- `new_merchant`: needs the full updated merchant registry.
- Cross-account dup_billing: same merchant, same amount, within 24h, on different accounts. Possible double-charge or accidental double-pay.
- Statement gap detection: per `core/workflow.md` and `features/reporting.md`. Surface in the data_quality section of the report.

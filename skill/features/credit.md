# Credit Card Tracking

v1 scope: utilization and payment due date awareness. Active only when at least one credit card statement has been ingested.

## Utilization

For each credit card account, compute `utilization = (credit_limit - available_credit) / credit_limit` from the most recent statement.

Surface in the period report under `credit`:

```
"credit": [
  {
    "account_id": "<issuer-slug>_<product-slug>",
    "credit_limit": 10000,
    "current_balance": 2345.67,
    "available_credit": 7654.33,
    "utilization": 0.234,
    "payment_due_date": "2026-05-25",
    "min_payment_due": 35.00,
    "statement_close_date": "2026-04-30",
    "days_to_due": 21
  }
]
```

If `credit_limit` is missing from the statement (some cards do not print it on every statement), fall back to the value in `personal/accounts.yaml`.

## Payment due tracking

Flag in the report:
- `due_within_7_days`: any card whose `payment_due_date` is within 7 days of the report generation date.
- `min_payment_only_streak`: detected only if you have 2+ months of statements where the inflow to the card during the period equaled exactly `min_payment_due` from the prior statement. Suggests carrying a balance and paying minimums.

## Deferred to v2

- APR cost simulator.
- Reward optimization (which card for what category).
- Debt paydown scheduler.

The schema in `core/db-schema.md` already captures APR fields, so v2 has the data when we get there.

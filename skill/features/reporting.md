# Reporting

Structured JSON is the primary output. Markdown is rendered from the JSON. Both write to `db/reports/<YYYY-MM>.json` and `db/reports/<YYYY-MM>.md` respectively.

## When to generate

After every ingest, generate a report for any month that received new data. If a statement crosses a month boundary, generate reports for both months affected.

A user can also request a report ad-hoc: "give me April".

## JSON shape (v1)

```
{
  "version": 1,
  "generated_at": "<ISO timestamp UTC>",
  "period": { "start": "2026-04-01", "end": "2026-04-30" },
  "accounts_included": ["<account_id_1>", "<account_id_2>"],

  "summary": {
    "total_income": 8450.00,
    "total_spend": -5320.45,
    "net_cashflow": 3129.55,
    "savings_rate": 0.370,
    "txn_count": 142,
    "vs_prior_period": { "spend_delta": -212.30, "income_delta": 0 }
  },

  "spend_by_category": [
    { "category_id": "groceries", "name": "Groceries", "amount": -842.10, "txn_count": 14, "pct_of_total": 0.158 }
  ],

  "top_merchants_by_amount": [
    { "merchant": "<merchant>", "amount": -612.40, "txn_count": 7, "category": "groceries" }
  ],

  "top_merchants_by_frequency": [
    { "merchant": "<merchant>", "txn_count": 22, "amount": -118.45, "category": "coffee" }
  ],

  "subscriptions": {
    "active_count": 14,
    "monthly_cost_total": 187.42,
    "annual_cost_total": 2249.04,
    "cancellation_candidates": [
      {
        "subscription_id": "sub_<merchant-slug>",
        "merchant": "<merchant>",
        "monthly_cost": 17.99,
        "annual_cost": 215.88,
        "tags": ["recent_price_increase", "overlap_streaming"],
        "reason": "<short, human-readable rationale>"
      }
    ]
  },

  "anomalies": [
    {
      "id": "anom_...",
      "txn_id": "txn_...",
      "flag": "outlier_amount",
      "amount": -487.32,
      "merchant": "<merchant>",
      "reason": "2.4 stddev above 6-month mean for this merchant",
      "confidence": 0.86
    }
  ],

  "categories_added_this_period": [
    { "category_id": "<category-slug>", "name": "<Category Name>", "example_merchant": "<merchant>", "created_by": "ai" }
  ],

  "credit": [ /* see features/credit.md */ ],

  "data_quality": {
    "uncategorized_count": 3,
    "missing_statements": [
      { "account_id": "<account_id>", "missing_period": "2026-03" }
    ],
    "balance_mismatches": []
  },

  "narrative": "<2-3 sentence summary of the period: total spend vs prior, top category, subscription count, anomalies flagged>"
}
```

## Markdown rendering

Render from the JSON, do not re-derive. Sections in order:

1. Title and period.
2. Narrative (the prose summary).
3. Summary table (income, spend, net, savings rate, deltas).
4. Top categories.
5. Top merchants.
6. Subscriptions (count, total monthly/annual, then the candidate list with reasons).
7. Anomalies (one bullet per event with merchant, amount, reason, confidence).
8. New categories created this period (so user can rename or merge).
9. Credit (if any cards).
10. Data quality (uncategorized count, missing statements, balance mismatches).

Keep the markdown scannable. Use tables for category and merchant breakdowns. Bullets for anomalies and candidates.

## Stability

The JSON shape is versioned (`version: 1`). Future changes bump the version and add a migration note in `ops/` (deferred to v2).

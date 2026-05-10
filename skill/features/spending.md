# Spending Breakdowns

Compute spending views from `db/transactions.json`. Pure derivations, never mutate transactions.

## Definitions

- **Spend** = sum of negative amounts in the period, excluding `type=transfer`, excluding txns with `transfer_pair_id` set, excluding txns categorized as transfers.
- **Income** = sum of positive amounts in the period, excluding transfers and excluding payments to credit cards (those are transfers from a checking account).
- **Net cashflow** = income + spend (spend is negative; result is signed).
- **Savings rate** = (income + spend) / income, expressed as a percentage. Negative when spending exceeds income.

## Views the report must include

- **By category** for the period: amount, txn_count, percent of total spend.
- **By merchant_canonical** for the period: amount, txn_count, top category for the merchant.
- **Top N merchants** ranked by amount (default N=10).
- **Top N merchants** ranked by frequency (default N=10).
- **Account breakdown:** spend per account, useful when multiple cards are used to split categories.
- **Day-of-week and time-of-day distributions:** cheap to compute, useful for the late-night anomaly check.

## Plain-English summary

After computing the numbers, generate a 2-4 sentence narrative for the report:

- Lead with net cashflow vs the prior period.
- Call out the largest category and the biggest mover (largest delta vs trailing 3-month average).
- Mention the count of subscriptions detected and any cancellation candidates.
- End with the count of anomalies surfaced.

Keep it factual. No advice, no judgment.

## Drilldowns

For Q&A ("what did I spend on dining last month?"), filter `transactions.json` by category, period, account, or merchant. Always read the JSON directly; do not re-derive from PDFs.

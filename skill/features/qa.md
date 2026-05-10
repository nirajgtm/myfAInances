# Q&A Over the DB

When the user asks a question rather than dropping a statement, treat it as a query over `db/transactions.json` and the derived files.

## Approach

1. Identify the time window. Default to the last full month if not specified.
2. Identify the dimension. Category, merchant, account, period, anomaly type.
3. Read the relevant JSON files directly. Filter, aggregate.
4. Answer with concrete numbers and 1-2 line context. Cite the period.
5. If the answer requires a chart, defer (v2) and describe the result in text.

## Common queries and how to answer

- **"What did I spend on X last month?"** Filter `transactions.json` by `category == X` AND `period`. Sum negative amounts. Show totals and top merchants in that category.
- **"Should I cancel any subscriptions?"** Read `db/subscriptions.json`, filter where `suggestion_tags` is non-empty, sort by annual_cost. Read each `suggestion_reason`. Present top 5 with reason.
- **"What is weird this month?"** Read `db/anomalies.json` filtered by surfaced_at within the month. Present each with merchant, amount, reason.
- **"How much do I make per month?"** Sum positive amounts, excluding transfers and credit-card-payments-from-checking. Average over last 3-6 months for stability.
- **"What are my recurring charges?"** Read `db/subscriptions.json`, status=active. Group by category.
- **"Did I miss a statement?"** Read `data_quality.missing_statements` from the most recent reports.

## What to never do

- Recompute spending by re-parsing PDFs. The JSON is the source of truth.
- Guess at dollar amounts. If the data is not there, say so.
- Give financial advice ("you should invest more"). Stick to facts about the user's own data.
- Predict future spending without explicit basis. If the user asks for a forecast, base it on trailing 3-month averages and label the assumption.

## When the data is incomplete

If `data_quality.uncategorized_count` is high or `missing_statements` is non-empty, lead with that caveat before answering.

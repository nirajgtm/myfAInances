# Canonical Extraction Fields

What every extractor must produce, regardless of input format. Field names match `core/db-schema.md`.

## Statement-level fields (always)

- `institution` (string, slug; lowercase snake_case derived from the issuer name)
- `account_id` (string, matches `personal/accounts.yaml`)
- `period_start`, `period_end` (ISO date)
- `issue_date` (ISO date, optional)
- `beginning_balance`, `ending_balance` (number)
- `currency` (3-letter code, default USD)

## Statement-level fields (credit card only)

- `credit_limit`, `available_credit`
- `min_payment_due`, `payment_due_date`
- `apr_purchases`, `apr_cash`, `apr_balance_transfer`
- `rewards_balance`, `rewards_earned`, `rewards_redeemed`

## Transaction-level fields (always)

- `date_posted`, `date_transaction` (ISO date; if statement only gives one, use it for both)
- `amount` (signed number; outflow negative, inflow positive)
- `description_raw` (verbatim from statement)
- `type` (debit | credit | fee | interest | transfer | check | dividend; infer from context)

## Transaction-level fields (when available)

- `check_number` (for check transactions)
- `reference_id` (any stable id from the source)
- `is_foreign` (bool)
- `fx_rate` (number)
- `balance_after` (running balance, if printed)

## Derived during ingest (do not extract; compute downstream)

- `id`, `description_normalized`, `merchant_canonical`, `category`, `category_confidence`, `categorized_by`, `tax_tag`, `subscription_id`, `anomaly_flags`, `transfer_pair_id`

## Normalization rules

- **Description normalization:** uppercase, collapse whitespace, strip trailing location codes that change per-store, keep store numbers but normalize their format.
- **Amount sign:** in checking/savings, withdrawals are negative. In credit cards, charges are negative (outflow from your perspective), payments to the card are positive. Be consistent.
- **Date format:** always ISO `YYYY-MM-DD`. Reject the row and log if the source date cannot be parsed.

## Required for v1

The set above. If the source format does not provide a field marked "always", abort the extraction and ask the user to switch to a different format for that institution.

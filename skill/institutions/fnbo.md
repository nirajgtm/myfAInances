# FNBO (First National Bank of Omaha)

Issues co-branded credit cards (e.g. various airline + retail co-brands).

## Statement format

PDF, monthly. Header: cardholder name + "New Balance / Minimum Payment /
Payment Due" tri-column at top. "Account number ending in <last4>". "For
billing cycle ending <date>". Issued by "First National Bank of Omaha
(FNBO®)". Payment URL `card.fnbo.com/bp`.

## Account type

`credit_card`.

## Fields populated

`credit_card` block: `credit_limit`, `available_credit`, `min_payment_due`,
`payment_due_date`, plus per-statement `apr_purchases`, `apr_cash`,
`apr_balance_transfer` (printed in disclosures section).

## Transactions

Standard credit-card layout: charges as positive in the bank's view, flip
to negative for our convention. Payments flip to positive. `merchant_state`
is the 2-letter US state code printed after the merchant name.

## Quirks

- Statement filename when downloaded directly from card.fnbo.com follows
  pattern `<YYYY-MM-DD>.pdf` (period close date), where the date is the
  billing-cycle-close date, not the issue date.
- Issuer brand says "FNBO®" but the card is often co-branded with an
  airline, retailer, or affinity program. The co-brand sits on the
  front of the physical card and isn't always repeated in the
  statement header.
- "Cash Limit" and "Available Cash" rows in Account Summary are the cash
  advance limit, not the spending limit.

## Quirks observed

- FNBO co-brand statements typically dedicate a page to a rewards
  activity table with categories — captures bonus categories,
  redemptions, and expiries separately from the transaction list.
- FNBO statement reference numbers are 23 chars long and embed an internal
  merchant ID; the same merchant ID often appears separately in the
  transaction description.
- FNBO co-brand Visa APRs run hot (e.g. ~32% purchase APR, ~30% cash
  advance APR) — higher than typical FNBO co-brands; capture per
  statement since rates fluctuate across cycles.
- FNBO zero-balance statements still print a full Charge Summary with
  "Balance Subject to Interest Rate" showing the average daily balance
  before mid-cycle payment posted; this is informational, not a charge.
- FNBO auto-pay description format `AUTO PMT FROM ACCT <last4>` identifies
  the funding account by last4 — useful for transfer-pair matching.
- FNBO co-brand rewards activity table shows category-by-category zeros
  in zero-activity months; "Current point balance" equals "Beginning
  point balance" when no spend posts.
- FNBO "Balance Subject to Interest Rate" is the average daily balance for
  the cycle, not the ending balance — appears even when grace period
  applies and no interest is actually charged.
- FNBO zero-balance statements still emit a payment transaction (`AUTO PMT`)
  when the prior balance was paid in full mid-cycle.
- FNBO `AUTO PMT FROM ACCT <digits>` description embeds the funding
  account number; the last 4 digits identify the funding account for
  transfer-pair matching.
- FNBO co-brand rewards summary may show "Points that will be expiring
  on your next statement closing date" as a separate line — useful for
  expiry-warning anomaly detection.

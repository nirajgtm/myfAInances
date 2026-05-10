# bank_of_america

Notes the LLM has learned while parsing statements from this institution.
Used as additional context on subsequent ingest calls. Bullets are deduped
by string-equality; rewrite this file freely if it gets cluttered.

## Quirks observed

- Bank of America credit-card statements use "New Balance Total" label
  rather than "New Balance"; period defined by "Statement Closing
  Date" and "Days in Billing Cycle".
- Bank of America credit-card statement prints all four APR types
  (Purchases, Balance Transfers, Direct Deposit and Check Cash
  Advances, Bank Cash Advances) in an "Interest Charge Calculation"
  table; variable rates flagged with a trailing `V`.
- Bank of America "Penalty APR" appears only in the late-payment
  warning footer, not in the APR table — capture it from the footer
  if disclosed.
- Bank of America credit-card statement emits zero-dollar
  `INTEREST CHARGED ON ...` rows for each balance type even when no
  interest accrued — informational, not transactions.
- Bank of America cash-back cards' "Your Reward Summary" shows
  "Base Cash Back Earned" (period) and "Total Cash Back Available"
  (running balance) in cash dollars; convert to integer cents (×100)
  for `rewards_balance`.

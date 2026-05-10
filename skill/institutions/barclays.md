# barclays

Notes the LLM has learned while parsing statements from this institution.
Used as additional context on subsequent ingest calls. Bullets are deduped
by string-equality; rewrite this file freely if it gets cluttered.

## Quirks observed

- Barclays statements use "Statement Balance" label rather than "New
  Balance"; period defined by `Statement Period MM/DD/YY - MM/DD/YY`
  and "Days in Billing Cycle".
- Barclays APR table often prints all three balance types (Purchases,
  Balance Transfers, Cash Advances) at the same variable rate for
  retailer co-brands; capture each separately even when they match.
- Barclays statement footer "Avoiding Interest on Purchases (Grace
  Period)" restates the amount needed to avoid interest — equals
  Statement Balance when no promotional balances exist.
- Barclays issues many retailer-co-branded Mastercards under
  "Barclays Bank Delaware"; use slug `barclays` for any of them since
  the underlying issuer is the same.
- Barclays "Total Credit Line" includes the cash-advance sub-limit;
  the cash-advance available is tracked separately under "Cash
  Advance Credit Line".

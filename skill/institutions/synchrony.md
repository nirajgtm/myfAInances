# synchrony

Notes the LLM has learned while parsing statements from this institution.
Used as additional context on subsequent ingest calls. Bullets are deduped
by string-equality; rewrite this file freely if it gets cluttered.

## Quirks observed

- Synchrony retailer-co-brand statements concatenate reference number,
  merchant, city, 2-letter state, and an item description into the
  description column. The item description is often prefixed with a
  short alphanumeric token (the retailer's internal SKU or order
  reference) before the human-readable item name.
- Synchrony retailer-co-brand cards print rewards redemption as a
  separate "YOUR STORE CARD STATEMENT CREDIT" line under "Other
  Credits" (negative on bank's view; flip to positive).
- Synchrony statement summary header includes `AUTOPAY OF $X.XX SET FOR
  MM/DD/YY` — that signals an upcoming auto-debit, not a posted
  transaction. Do not emit as a transaction.
- Synchrony retailer statements define `period_start` =
  "Previous Balance as of <date>" and `period_end` = "New Balance as of
  <date>"; "Billing Cycle from X to Y" confirms the range.
- Synchrony retailer-co-brand APRs run high (typically high-20s to
  low-30s % variable for purchases) and many co-brands disclose only
  a purchase APR — no cash advance or balance transfer APR.

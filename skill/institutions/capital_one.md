# capital_one

Notes the LLM has learned while parsing statements from this institution.
Used as additional context on subsequent ingest calls. Bullets are deduped
by string-equality; rewrite this file freely if it gets cluttered.

## Quirks observed

- Capital One credit-card statements concatenate merchant + city +
  2-letter state with no delimiter (e.g. `MERCHANTNAMECITYSS`); split
  city by the trailing 2-letter state code.
- Capital One period is defined by a `<Month D, YYYY> - <Month D,
  YYYY>` header plus a "Days in Billing Cycle" count.
- Capital One Rewards Summary on travel-rewards cards prints Previous
  Balance / Earned This Period / Redeemed This Period as integer
  point counts (miles) without a cash conversion — apply
  `points_value_cents` from accounts.yaml for dollar value.
- Capital One "Variable APRs" uses letter codes (P, PL, DF)
  referencing Prime Rate / LIBOR + margin; Penalty APR not shown.
- Capital One foreign/online merchants append a numeric merchant ID
  to the merchant name with no city/state delimiter (e.g.
  `MERCHANT.COM12345`); strip the trailing digit run.

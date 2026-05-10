# robinhood

Notes the LLM has learned while parsing statements from this institution.
Used as additional context on subsequent ingest calls. Bullets are deduped
by string-equality; rewrite this file freely if it gets cluttered.

## Quirks observed

- Robinhood Credit Card is issued by Robinhood Credit, Inc.; use slug
  `robinhood`.
- Robinhood statements show charges as positive and payments/credits with
  trailing minus sign (e.g. `<amount>-`); flip to our convention.
- Robinhood lists "POINTS REDEEMED" rows as statement credits applied to
  balance (positive in our convention).
- Robinhood PDF text extraction concatenates merchant name + city + state
  with no spaces (e.g. `MERCHANTNAMECITYSS` where SS is the 2-letter state
  code); split by the trailing 2-letter state code.
- Robinhood APR for Purchases and Cash Advances are typically the same
  variable rate; no balance transfer APR shown.
- Robinhood billing cycle is "Days in Billing Cycle"; period_start =
  closing date - days_in_cycle + 1.
- Robinhood statement summary line concatenates labels and amounts inline
  (e.g. `PreviousBalance $X.XX-Payments&Credits $Y.YY+...`); the trailing
  `-` / `+` acts as separator/sign indicator, not a negative balance.
- Robinhood transaction reference numbers have predictable prefixes by
  type — capture them to disambiguate purchases vs payments vs
  points-redemptions.
- Robinhood transaction descriptions for online-only merchants substitute
  a phone number where the city would be (e.g.
  `MERCHANT 800-555-1234 CA`); detect the phone-shaped token and treat
  the merchant as online-only (no real city).
- Robinhood airline ticket entries include a follow-on itinerary line
  beneath the main row (e.g. `<date> 1<carrier> <origin> <destination>
  2<carrier> <destination> <origin>`).
- Robinhood transaction-export CSV columns:
  `Date,Time,Cardholder,Amount,Points,Balance,Status,Type,Merchant,Description`.
- Robinhood CSV `Type` values: `Purchase` (positive amount, points
  earned), `Payment` (negative amount, 0 points), `Other` (negative
  amount = points-redeemed statement credit, 0 points).
- Robinhood CSV `Balance` column is the running statement balance after
  each transaction (most recent at top); use to derive
  `beginning_balance` for ad-hoc CSV exports.
- Robinhood CSV concatenates merchant + city + state with no delimiter
  (`<MERCHANT><CITY><SS>`); split city by trailing 2-letter state code.
- Robinhood CSV merchants pass through processor prefixes: `SQ *`
  (Square), `TST*` (Toast), `SPO*` (SpotOn), `UEP*` (Upserve), `YSI*` —
  capture as `extra.processor`.
- Robinhood CSV `Merchant` column has the cleaned merchant name;
  `Description` column has the raw card-network descriptor — `Description`
  is the better source of truth for city/state.
- Robinhood points-redeemed entries are dated separately from payment
  entries (typically same day or day after the payment posts) and apply
  the dollar amount as a statement credit.

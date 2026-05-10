# Bay Area FasTrak

Toll account for Bay Area bridges + express lanes.

## Statement format

PDF. Header `FasTrak Customer Service Center`, "Statement Date" + "Account
Number" (9-digit numeric). Issued by Bay Area Toll Authority.

## Account type

`toll`.

## Fields populated

`toll` block: `balance` (current pre-paid balance), `auto_replenish_threshold`
+ `auto_replenish_amount` (when account auto-tops-up), `tag_count`,
`trips_period`, `tolls_period`, `fees_period`, `violations_count`,
`violations_amount`.

## Transactions

Each itemized toll trip: date, location (e.g. "BAY BRIDGE"), amount.
Capture as `debit` type, location goes into `merchant_canonical` =
"FasTrak — <bridge or lane>", description preserves the raw entry.

Auto-replenish charges (debits from a card on file or ACH from a bank
account) appear as positive entries to the FasTrak account balance — emit
as `transfer` type from the user's funding account (we won't know which
without the funding-side statement, so leave `transfer_pair_id` null on
ingest; reconciliation pairs them later).

## Quirks

- Tag transponder ID (printed wrapped in asterisks) is the account number,
  not a card identifier.
- Statements list trips chronologically, not by bridge.
- "Violation" entries are missed-toll fees; flag as anomaly source.

## Quirks observed

- FasTrak statement lists each toll trip with posting date, transaction
  date, tag/plate, agency code, entry plaza abbreviation, entry time, and
  entry lane. Plaza descriptions printed below the table map abbreviations
  (e.g. DUM = Dumbarton Bridge).
- FasTrak account number doubles as the tag transponder ID (printed
  wrapped in asterisks at the top); not a card identifier.
- FasTrak "Replenishment Method" identifies the funding source (e.g.
  MASTERCARD) and "Replenishment Amount" is the auto-top-up amount when
  balance falls below threshold (commonly $15).

# empower

Retirement account provider. Acquired Personal Capital in 2020. Hosts
employer 401(k) plans and individual IRAs.

## Statement format

PDF. Header names the specific Empower product (e.g. a Traditional IRA,
Roth IRA, or 401(k) plan). Statement period date range top-right.
"Participant ID" + "Plan" identifier. Followed by "Account-at-a-Glance"
with beginning + ending balance and contributions.

## Account type

`ira` (or `roth_ira`) with `retirement.subtype` set to match the
header. For employer 401(k) accounts hosted by Empower, use `401k`.

## Fields populated

`retirement` block: `balance`, `vested_balance` (= balance for IRA;
distinct only on 401k), `ytd_contributions_employee`, `plan_name`,
`plan_id`. Holdings list per fund with `name`, `value`, `allocation_pct`.

## Transactions

Each contribution, distribution, dividend reinvest, expense-ratio fee
becomes a transaction:

- Contributions → `transfer` type, positive (inflow into the account).
- Dividends/interest reinvested → `dividend` or `interest` type,
  positive.
- Fund management fees → `fee` type, negative.
- Distributions → `transfer` type, negative.

## Quirks

- "Participant ID" looks like an SSN-style number; it's the plan
  member identifier — never log it.
- Statement covers calendar YTD on first issue of the year, then
  cumulative through end of period.
- Holdings table lists current value, units (shares), and
  allocation %.

## Quirks observed

- Empower statements include an "Activity by Contribution Source" table
  that breaks balance change down by source (e.g. rollover, employee
  pre-tax, employer match) — useful for separating rollover-funded
  accounts from contribution-funded ones.
- Empower IRA statements may span multi-month YTD periods (e.g. since
  Jan 1) rather than a calendar month.
- "Change in Value" column captures unrealized market gain/loss with no
  transaction-level detail; do not emit as a transaction.

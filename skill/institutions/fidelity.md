# Fidelity

Hosts multiple distinct account products under one institution slug
(`fidelity`). Each gets its own `account_id`:

- **Fidelity HSA** → `fidelity_hsa` (`account_type: hsa`)
- **Fidelity NetBenefits** (employer 401(k) plan record-keeper) →
  `fidelity_<plan_sponsor_slug>_401k` (`account_type: 401k`)
- **Fidelity Brokerage / IRA** → `fidelity_brokerage` /
  `fidelity_traditional_ira` / `fidelity_roth_ira` (`account_type` matches)

## Statement formats

- HSA: PDF "INVESTMENT REPORT" header. Period range
  `Month DD, YYYY - Month DD, YYYY`. Account number `XXX-XXXXXX`.
- NetBenefits 401(k): PDF "Statement Details" or "Retirement Savings
  Statement" header that names the employer plan (e.g. `<Employer Name>
  401(k) Plan`). Brokerage Services LLC return address printed in the
  footer.
- Portfolio summary: HTML export from `digital.fidelity.com`. Use
  `extraction/html.md` extraction pathway. May aggregate multiple
  Fidelity accounts on one page.

## Fields populated

- HSA → `retirement` block, subtype `hsa`. Holdings list each fund.
- 401(k) → `retirement` block, subtype `401k`. Populates `vested_balance`
  separately from `balance` (vesting matters), plus
  `ytd_contributions_employee`, `ytd_contributions_employer`,
  `plan_name`, `plan_sponsor`, `plan_id`, `vesting_schedule`.
- Brokerage / IRA → `brokerage` (taxable) or `retirement` (IRA) block.

## Transactions

Statements often itemize: contribution credits, dividends/cap gains,
fund-fee debits, exchanges (sells + buys with same date).

For NetBenefits 401(k): contributions split by source (employee pre-tax,
employer match, after-tax). Each becomes a separate transaction with
`extra: {"contribution_source": "employee_pretax|employer_match|..."}`
preserved.

## Quirks

- HSA statements use "INVESTMENT REPORT" not "STATEMENT" — the parser
  must recognize it as a statement anyway.
- NetBenefits headers explicitly name the employer plan; carry that into
  `retirement.plan_sponsor`.
- HTML portfolio summary is a snapshot, not a transactional record. Treat
  it as a balance update only — emit a single statement record per
  account it lists, `period_start` = `period_end` = the snapshot date,
  no transactions.
- Envelope numbers printed at the top of HSA statements are mailing
  identifiers; ignore them.

## Quirks observed

- Fidelity NetBenefits 401(k) aggregates contributions YTD by source
  (Pre-Tax, After-Tax, Employer Match, Rollover, Roth in-Plan
  Conversion) without per-paycheck itemization.
- NetBenefits "Your Contribution Summary" table breaks out Total
  Account Balance and Total Vested Balance per source — useful for
  tracking after-tax + Roth in-plan mega-backdoor flow.
- NetBenefits statements include "Personal Rate of Return"
  (time-weighted) for the period — informational, not transactional.
- NetBenefits 401(k) statement period commonly spans YTD
  (Jan 1 – statement-issue date) rather than the prior calendar month.
- Fidelity HSA "INVESTMENT REPORT" splits contribution sources as
  "Participant Cur Yr" (employee) and "Employer Cur Yr" (employer
  match) without a per-source vested-balance breakdown.
- Fidelity HSA core fund (FDRXX) buy/sell activity appears in a
  separate "Core Fund Activity" table reflecting cash sweeps for
  contributions and mutual-fund purchases — internal sweeps, not user
  transactions; do not double-count.
- Fidelity HSA labels HSA dividends as "Tax-free" in the Income
  Summary (vs "Tax-deferred" for traditional IRAs).
- Fidelity HSA new-account first statement shows Beginning Account
  Value as `-` (dash) instead of `$0` — treat as 0.
- Fidelity HSA "Contributions and Distributions" summary breaks out
  `<year> Partic.` (employee) and `<year> Company` (employer)
  separately for both period and YTD.
- Fidelity HSA employer contributions can post as a single annual
  lump sum in one month, then show $0 in subsequent months while the
  YTD employer figure stays flat. Capture the lump-sum month from the
  period column, not by inferring from YTD changes.

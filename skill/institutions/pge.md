# PG&E (Pacific Gas & Electric)

Combined gas + electric utility. California.

## Statement format

PDF, monthly. "ENERGY STATEMENT" header. Account number top-right
(`<10-digits>-0` style). Service address top-left.

## Account type

`utility` with `service_type: "combined"` (gas + electric on one bill).
Some service addresses are electric-only — set `service_type: "electric"`.

## Fields populated

`utility` block: `service_address`, `previous_balance`, `payments_received`,
`current_charges`, `amount_due`, `due_date`, `usage.electric_kwh`,
`usage.electric_cost`, `usage.gas_therms`, `usage.gas_cost`,
`usage.average_daily_kwh`, `usage.average_daily_therms`,
`usage.vs_prior_period_pct`, `usage.rate_plan` (e.g. "E-1", "E-TOU-C").
Capture tier breakdown (Tier 1 / Tier 2) under `usage.tier_breakdown`.

## Transactions

A PG&E statement is single-charge: one transaction per statement equal to
the `amount_due` (negative), dated `due_date`, type `debit`. No itemized
transactions.

## Quirks

- Bills include detailed weather + usage comparison vs prior year. Capture
  the kWh/therms numbers; ignore the weather narrative.
- "Service For:" line names the account-holder, not a merchant.
- Late fees appear inline as separate line items only if billing is
  delinquent.

## Quirks observed

- PG&E statement may include unpaid prior balance rolled into current Total
  Amount Due — capture both `previous_balance` and `current_charges`
  separately, with `amount_due` = sum.
- PG&E E-TOU-C rate schedule splits charges into Peak (4–9pm every day) and
  Off Peak with separate kWh totals and rates. E-TOU-C generation charges
  (PCE) further split into 4 tiers: On Peak Tier 1, Off Peak Tier 1, On
  Peak Tier 2, Off Peak Tier 2.
- PG&E periodically introduces new charge categories decoupled from
  per-kWh price (e.g., a fixed Base Services Charge billed daily) —
  capture as a distinct line item in `usage.tier_breakdown` rather
  than rolling into delivery. Pre-introduction statements simply
  lack the row.
- PG&E uses different third-party generation providers (Community
  Choice Aggregators / CCAs) depending on the service address. The CCA
  bills for generation; PG&E bills for delivery. Both rows appear on
  the statement alongside PG&E delivery charges. Some CCA-served
  addresses also include a Local Utility Users Tax on PG&E delivery
  charges that other addresses don't.
- PG&E statement can cover overlapping/sequential service at two different
  addresses on the same account (one CLOSED final bill + one new service
  start) — sum kWh and per-address charges separately.
- PG&E returned-check restriction notice is an account-specific compliance
  flag (typically pages 7 or 11) for accounts with 2+ returned checks in
  12 months; restricts payment methods for up to 12 months. Capture as a
  compliance flag, not a generic disclosure.
- PG&E statement filename pattern matches statement_date (e.g.
  `<YYYY-MM-DD>.pdf` is the statement-date, not the period-end).
- PG&E electric monthly billing history graph at top lists 13 months
  (current + 12 prior) with a single-line per-month total — useful for
  trend tracking.
- PG&E Daily Usage Comparison shows "One Year Ago / Last Period / Current
  Period" kWh per day — captures YoY and MoM usage trend.

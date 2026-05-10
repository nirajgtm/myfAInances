# Tax-form extraction

**Tax forms are not transaction statements.** They aggregate events that
the user already received during the year. Don't double-count: every
dividend, interest payment, and sale should already be a transaction on
the issuing institution's monthly statement. The 1099 is a year-end
summary that the user files with the IRS.

## What we extract

A tax form becomes a single statement record with:
- `account_type: "tax_document"`
- `period_start: <YYYY-01-01>`, `period_end: <YYYY-12-31>` for the tax year
- `issue_date`: the form's "Date Prepared" line
- No `transactions` (skip extraction; deduplication is impossible without
  per-event detail and the underlying statements already carry it)
- A `tax_form` block (see schema below)

## Form types

### 1099 Composite (Schwab, Fidelity, Robinhood)

Combines several IRS forms into one PDF. Common boxes to capture:

**1099-DIV** — Dividends and Distributions
- `total_ordinary_dividends` (Box 1a)
- `qualified_dividends` (Box 1b)
- `total_capital_gain_distr` (Box 2a)
- `nondividend_distributions` (Box 3)
- `federal_income_tax_withheld` (Box 4)
- `section_199a_dividends` (Box 5)
- `foreign_tax_paid` (Box 7)

**1099-INT** — Interest Income
- `interest_income` (Box 1)
- `early_withdrawal_penalty` (Box 2)
- `interest_on_us_treasury` (Box 3)
- `federal_tax_withheld` (Box 4)
- `tax_exempt_interest` (Box 8)

**1099-B** — Proceeds From Broker Transactions
- `total_proceeds` (sum of Box 1d across all sales)
- `total_cost_basis` (sum of Box 1e)
- `total_gain_loss`
- Reported by box (covered short-term, covered long-term, noncovered, etc.)

**1099-MISC / 1099-NEC** — captured if present
- `other_income`
- `nonemployee_compensation`

**Year-End Summary** (per-broker)
- `total_dividends_received`
- `total_interest_received`
- `total_realized_gain_loss`
- `total_management_fees`

### W-2 (employer)

Future scope. Not in inbox yet. When added: `tax_form_type: "W-2"` with
boxes 1, 2, 3, 4, 5, 6, 12 codes, 14 entries.

### 1098 (mortgage interest)

Future scope. Mortgage statements already capture interest paid YTD.

## Identifying a tax form vs. a regular statement

Triggers (LLM should recognize any of these):
- Header contains "1099" / "Form 1099" / "TAX YEAR <YYYY>" / "FORM 1099 COMPOSITE"
- Filename contains "1099", "tax", "year-end summary", "year end"
- `Date Prepared` line near the top instead of a "Statement Period"

If recognized, emit:
```json
{
  "statements": [{
    "institution": "<slug>",
    "account_last4": "...",
    "account_subname": "...",
    "account_type": "tax_document",
    "period_start": "<tax_year>-01-01",
    "period_end": "<tax_year>-12-31",
    "issue_date": "<Date Prepared>",
    "tax_form": { "form_type": "1099-Composite", "tax_year": <year>, ... }
  }],
  "transactions": []
}
```

## Quirks

- Schwab and Fidelity 1099 composites often re-state amounts in three
  places: a top "Year-End Summary", per-form details, and a state-tax
  appendix. Use the per-form numbers as authoritative; the summary may
  round or omit small entries.
- Some 1099-DIVs print "Total Capital Gain Distr." separately from
  "Unrecaptured Sec 1250 Gain". We track both under `box_2a` and
  `box_2b` respectively if printed.
- ADR fees, foreign tax credits, and section 199A dividends are commonly
  missed — capture them; they affect tax-prep accuracy.
- 1099-B with "noncovered" lots means cost basis is NOT reported to IRS;
  the user must self-report. Flag `noncovered: true` per lot when
  detail-level extraction is enabled.

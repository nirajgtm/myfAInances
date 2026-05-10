# Charles Schwab

Brokerage. The "Schwab One®" taxable brokerage account is the typical
product. Schwab also services Solo 401(k), IRAs, and a checking/savings
sweep, each as separate accounts under the same client login.

## Statement formats

- **Monthly brokerage statement** — PDF. Header `Schwab One® Account of <NAME>`,
  account number `XXXX-XXXX` (8 digits, hyphen between halves), statement
  period `<Month D-D, YYYY>`. Account Summary at top with Beginning + Ending
  Account Value plus a 12-month line chart of value.
- **1099 Composite & Year-End Summary** — PDF, annual. Combines 1099-DIV,
  1099-INT, 1099-B, 1099-MISC, plus a year-end summary. Header
  `FORM 1099 COMPOSITE & YEAR-END SUMMARY` with `TAX YEAR <YYYY>` and
  `Date Prepared: <date>`. See `extraction/tax-forms.md` for handling.

## Account type

`brokerage` for Schwab One. Use `account_type: tax_document` for the
1099 composite (no transactions, populates `tax_form` block).

## Fields populated

`brokerage` block: `as_of_date`, `portfolio_value`, `cost_basis`,
`unrealized_gain`, `cash_balance`, `dividends_period`, `dividends_ytd`,
`fees_period`, `holdings[]`. Holdings have ticker, name, shares, price,
value, and Schwab usually prints cost basis + unrealized gain per lot —
capture them.

## Transactions

Schwab statements list every dividend, interest credit, sweep deposit,
buy/sell, and fee. Sign convention:
- Dividends and interest → `dividend` / `interest` type, positive.
- Buys → `debit`, negative (cash leaving the account into a position).
- Sells → `credit`, positive.
- Sweep deposits/withdrawals between Schwab and a linked bank →
  `transfer`, signed appropriately.
- Fees (e.g., wire fees, ADR fees) → `fee`, negative.

## Quirks

- Account number format `XXXX-XXXX` (8 digits with a hyphen between halves);
  preserve the hyphen in `last4`-style fields. Use the last 4 of the second
  half as `last4` for legacy compatibility.
- The 12-month value chart at the top of monthly statements is decorative —
  ignore it for extraction; the YTD figures appear in the Account Summary
  text block.
- Dividends often print with the security's CUSIP and qualifier
  (e.g., `QUALIFIED DIVIDEND`). Capture the qualified flag in
  `extra: {"qualified": true}` so 1099-DIV reconciliation is easy later.
- Statements may include holdings split by section: Equities, Mutual
  Funds, Cash & Money Market, Fixed Income. Aggregate into a single
  `holdings[]` array; tag `asset_class` per section.
- Schwab sometimes reissues a corrected 1099 mid-year; filename is the
  same but `Date Prepared` differs. Treat the latest by issue date as
  authoritative; older versions get archived.

## Quirks observed

- Schwab 1099 Composite shows per-payer dividend detail on per-security
  rows in the Year-End Summary "Detail Information of Dividends and
  Distributions" section, separate from the 1099-DIV totals box.
- Schwab 1099 Composite "Date Prepared" is the form-issue date;
  `period_start`/`period_end` map to the tax year (Jan 1 – Dec 31).
- Schwab 1099 Composite breaks dividends into "Paid in <year>" vs
  "Paid/Adjusted in <year+1> for <year>" columns to capture spillover
  dividends declared in the prior year but paid in January of the next.
- Schwab monthly statement Account Summary shows period and YTD columns
  side-by-side; on the first month of the year both equal.
- Schwab statement masks account number on inner pages (only last digit
  visible) while page 1 shows the full account number.
- Schwab statement period uses format "Month D-D, YYYY" (single month,
  hyphen-separated days).
- Schwab Asset Allocation rounds cash to "<1%" when below 1% — but the
  full numeric value is preserved in the cash row of the table.
- Schwab Positions-Summary table uses an additive layout:
  Beginning + Transfers + DivReinvested + CashActivity + ChangeInMarketValue
  = Ending.
- Schwab StockPlanActivity rows show total dollar amount in the
  "Price/Rate per Share" column (not actual price/share) when transferring
  multiple lots; sum of column matches printed Total Transactions value.
- Schwab "Transfer of Securities" captures inbound RSU vests as Other
  Activity — non-cash; Beginning Cash equals Ending Cash even when
  securities were transferred in.
- Schwab YTD Dividends and Interest can remain $0 well into the year for
  portfolios concentrated in non-dividend-paying or single-equity
  holdings.
- Schwab statement shows Market Appreciation/(Depreciation) in Account
  Summary tracking unrealized P&L change separate from realized gains.
- Schwab Transaction Details Description column may duplicate the
  share-class qualifier (e.g. "CLASS CLASS A") for dividend rows — PDF
  text-extraction artifact, not a real value.
- Schwab quiet-month statements (no deposits/withdrawals/dividends/
  transfers) emit zero transactions but still produce a balance-update
  statement record with period beginning + ending values.

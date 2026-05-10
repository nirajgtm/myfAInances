# DB Schema

Canonical shape for every JSON file under `db/`. Treat this as the contract: future UI, migrations, and v2 features depend on it.

## Design intent: migration-ready JSON

The DB is JSON files today, but the schema is shaped so a future SQL migration is mechanical:

- **Each file = one table.** `transactions.json` -> `transactions`, `statements.json` -> `statements`, etc. No file holds two collections.
- **Stable string IDs everywhere.** `txn_<sha8>`, `stmt_<institution>_<account>_<period>`, `anom_<txn_id>_<flag>`, etc. These become primary keys verbatim.
- **Foreign keys by ID, not by content.** Transactions reference `account_id` and `statement_id`; anomalies reference `txn_id`; subscriptions reference `merchant_canonical`. No row reaches into another row's body.
- **Embedded sub-objects are SQL-friendly JSON columns.** `statements.credit_card`, `statements.brokerage`, `statements.loan` are nullable nested objects. In SQLite they map to JSON columns; in Postgres to `jsonb`. They are NOT a separate row in disguise.
- **Derived state is rebuildable.** `merchants.json`, `subscriptions.json`, `anomalies.json`, and `reports/<period>.json` can be regenerated from `transactions.json` + `categories.json`. They are read caches, not authoritative state.
- **`anomaly_flags` on a transaction is a denormalized projection.** The authoritative store is `anomalies.json` (one row per `(txn_id, flag)`). The array on the transaction is for fast read; in SQL it would be a view, not a column.
- **Timestamps are ISO 8601 UTC with `Z`.** Maps directly to `TIMESTAMP WITH TIME ZONE`.
- **Amounts are signed numbers from the cardholder's perspective.** Outflow negative, inflow positive. No separate `debit_amount`/`credit_amount` columns. Maps to `NUMERIC(12,2)`.

## Future SQL migration sketch

When the row count gets uncomfortable for JSON (~100k+ transactions), the migration is roughly:

```
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  institution TEXT NOT NULL,
  type TEXT NOT NULL,
  last4 TEXT,
  nickname TEXT,
  currency TEXT DEFAULT 'USD',
  metadata JSON
);

CREATE TABLE statements (
  id TEXT PRIMARY KEY,
  institution TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  beginning_balance NUMERIC(12,2),
  ending_balance NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  source_format TEXT,
  source_filename TEXT,
  source_file_hash TEXT,
  ingested_at TIMESTAMP WITH TIME ZONE,
  credit_card JSON,
  brokerage JSON,
  loan JSON,
  UNIQUE(institution, account_id, period_start, period_end)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  statement_id TEXT REFERENCES statements(id),
  source TEXT NOT NULL,
  date_posted DATE NOT NULL,
  date_transaction DATE,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  is_foreign BOOLEAN,
  fx_rate NUMERIC,
  description_raw TEXT NOT NULL,
  description_normalized TEXT,
  merchant_canonical TEXT,
  type TEXT,
  category TEXT REFERENCES categories(id),
  category_confidence NUMERIC,
  categorized_by TEXT,
  tax_tag TEXT,
  transfer_pair_id TEXT REFERENCES transactions(id),
  subscription_id TEXT REFERENCES subscriptions(id),
  balance_after NUMERIC(12,2),
  ingested_at TIMESTAMP WITH TIME ZONE,
  source_file_hash TEXT
);

CREATE INDEX idx_txn_account_date ON transactions(account_id, date_posted);
CREATE INDEX idx_txn_category ON transactions(category);
CREATE INDEX idx_txn_merchant ON transactions(merchant_canonical);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent TEXT REFERENCES categories(id),
  aliases JSON,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  frozen BOOLEAN DEFAULT FALSE,
  example_merchants JSON,
  merged_into TEXT REFERENCES categories(id)
);

CREATE TABLE anomalies (
  id TEXT PRIMARY KEY,
  txn_id TEXT NOT NULL REFERENCES transactions(id),
  flag TEXT NOT NULL,
  amount NUMERIC(12,2),
  merchant TEXT,
  reason TEXT,
  confidence NUMERIC,
  surfaced_at TIMESTAMP WITH TIME ZONE,
  reviewed_by_user BOOLEAN DEFAULT FALSE,
  user_action TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(txn_id, flag)
);

CREATE TABLE merchants (
  canonical_name TEXT PRIMARY KEY,
  raw_descriptions JSON,
  categories_seen JSON,
  first_seen DATE,
  last_seen DATE,
  charge_count INTEGER
);

CREATE TABLE processed_files (
  file_hash TEXT PRIMARY KEY,
  statement_id TEXT REFERENCES statements(id),
  filename TEXT,
  ingested_at TIMESTAMP WITH TIME ZONE
);
```

Subscriptions, holdings, and reports follow the same pattern. Until then we operate on the JSON files; the shape stays compatible.

## db/processed.json

Object keyed by file SHA-256.

```
{
  "<sha256>": {
    "statement_id": "stmt_...",
    "filename": "statement-2026-04.pdf",
    "ingested_at": "<ISO timestamp UTC>"
  }
}
```

## db/statements.json

Array of statement records.

```
{
  "id": "stmt_<institution>_<account_id>_<period_end>",
  "institution": "<issuer-slug>",
  "account_id": "<issuer-slug>_<product-slug>",
  "period_start": "2026-04-01",
  "period_end": "2026-04-30",
  "issue_date": "2026-05-01",
  "beginning_balance": 1234.56,
  "ending_balance": 2345.67,
  "currency": "USD",
  "source_format": "pdf",
  "source_filename": "statement-2026-04.pdf",
  "source_file_hash": "abc123...",
  "ingested_at": "<ISO timestamp UTC>",

  "account_type": "credit_card",        // matches the account's type; lets readers fan out to the right block

  "credit_card": {                      // populated when account_type == credit_card
    "credit_limit": 10000,
    "available_credit": 7654.33,
    "min_payment_due": 35.00,
    "payment_due_date": "2026-05-25",
    "apr_purchases": 22.99,
    "apr_cash": 27.99,
    "apr_balance_transfer": 22.99,
    "rewards_balance": 12345,
    "rewards_earned": 234,
    "rewards_redeemed": 0,
    "interest_charge_purchases": 0,
    "interest_charge_cash": 0
  },

  "brokerage": {                        // populated for taxable brokerage accounts
    "as_of_date": "2026-04-30",
    "portfolio_value": 123456.78,
    "cost_basis": 100000.00,
    "unrealized_gain": 23456.78,
    "cash_balance": 1234.56,
    "dividends_period": 234.56,
    "dividends_ytd": 1234.56,
    "fees_period": 0.00,
    "holdings": [
      { "symbol": "<TICKER>", "name": "<security name>",
        "shares": 100.5, "price": 245.67, "value": 24690.84,
        "cost_basis": 22000.00, "unrealized_gain": 2690.84,
        "asset_class": "equity" }
    ]
  },

  "retirement": {                       // populated for IRA / 401k / 403b / SEP / HSA
    "as_of_date": "2026-04-30",
    "subtype": "traditional_ira",       // traditional_ira | roth_ira | 401k | 403b | sep_ira | hsa
    "balance": 33591.11,
    "vested_balance": 33591.11,
    "ytd_contributions_employee": 5000.00,
    "ytd_contributions_employer": 2500.00,
    "ytd_contributions_total": 7500.00,
    "annual_contribution_limit": 23000.00,
    "ytd_distributions": 0.00,
    "loan_balance": null,
    "vesting_schedule": "graded 4yr",
    "plan_name": "<Employer Name> 401(k)",
    "plan_sponsor": "<Employer Inc.>",
    "plan_id": "<plan-id>",
    "rmd_required": false,
    "rmd_amount": null,
    "beneficiaries": ["Spouse — 100%"],
    "holdings": [
      { "symbol": null, "name": "<fund name>",
        "shares": null, "price": null, "value": 25193.00,
        "allocation_pct": 75.0 }
    ]
  },

  "loan": {                             // populated for mortgage / auto / student / personal / heloc
    "loan_type": "mortgage",
    "principal_balance": 387654.32,
    "original_principal": 450000.00,
    "interest_rate": 6.125,
    "rate_type": "fixed",
    "monthly_payment": 2734.56,
    "principal_paid_period": 543.21,
    "interest_paid_period": 1976.54,
    "principal_paid_ytd": 2150.00,
    "interest_paid_ytd": 7900.00,
    "escrow_balance": 4321.00,
    "next_payment_date": "2026-06-01",
    "payoff_date": "2052-04-01",
    "remaining_term_months": 312
  },

  "utility": {                          // PG&E, water, sewer, internet, phone, cable
    "service_type": "combined",         // electric | gas | water | sewer | trash | internet | phone | tv | combined
    "service_address": "123 MAIN ST APT 4, ANYTOWN CA",
    "previous_balance": 132.88,
    "payments_received": 132.88,
    "current_charges": 145.32,
    "amount_due": 145.32,
    "due_date": "2026-05-20",
    "auto_pay_enrolled": true,
    "usage": {
      "electric_kwh": 234,
      "electric_cost": 56.78,
      "gas_therms": 12.5,
      "gas_cost": 88.54,
      "water_gallons": null,
      "average_daily_kwh": 7.8,
      "vs_prior_period_pct": -8.5,
      "rate_plan": "E-1",
      "tier_breakdown": []
    }
  },

  "toll": {                             // FasTrak / EZPass / similar
    "balance": 23.45,
    "auto_replenish_threshold": 10.00,
    "auto_replenish_amount": 25.00,
    "tag_count": 1,
    "trips_period": 12,
    "tolls_period": 24.50,
    "fees_period": 0.00,
    "violations_count": 0,
    "violations_amount": 0.00
  },

  "insurance": {                        // life / health / auto / home / disability / umbrella
    "policy_type": "term_life",
    "policy_number": "ABC-1234567",
    "cash_value": 0.00,
    "death_benefit": 500000.00,
    "premium_paid_period": 45.00,
    "premium_paid_ytd": 180.00,
    "next_premium_due": 45.00,
    "next_premium_date": "2026-06-01"
  },

  "tax_form": {                         // 1099 composite, 1099-DIV/INT/B, W-2, etc.
    "form_type": "1099-Composite",
    "tax_year": 2025,
    "issuer": "Charles Schwab",
    "div_ordinary": 1234.56,
    "div_qualified": 1100.00,
    "div_capital_gain_distr": 0,
    "div_section_199a": 12.34,
    "div_foreign_tax_paid": 5.67,
    "int_income": 234.56,
    "int_us_treasury": 0,
    "int_tax_exempt": 0,
    "b_total_proceeds": 5000.00,
    "b_total_cost_basis": 4500.00,
    "b_total_gain_loss": 500.00,
    "b_short_term_gain": 100.00,
    "b_long_term_gain": 400.00,
    "fed_tax_withheld": 0,
    "summary_total_dividends": 1234.56,
    "summary_total_interest": 234.56,
    "summary_total_realized_gain_loss": 500.00,
    "summary_total_fees": 12.50
  }
}
```

Every type-specific block is nullable — only the block that matches `account_type` is populated for a given statement. Readers can fan out via the `account_type` discriminator without scanning every block.
```

## db/transactions.json

Array of transaction records. Insert order does not matter; readers sort.

```
{
  "id": "txn_<sha8_of_key>",
  "account_id": "<issuer-slug>_<product-slug>",
  "statement_id": "stmt_<issuer-slug>_<product-slug>_2026-04-30",
  "source": "statement",                // statement | manual
  "source_format": "pdf",
  "date_posted": "2026-04-15",
  "date_transaction": "2026-04-14",
  "amount": -42.17,                     // negative = outflow, positive = inflow
  "currency": "USD",
  "fx_rate": null,
  "is_foreign": false,
  "description_raw": "STARBUCKS STORE #4521 SAN FRANCISCO CA",
  "description_normalized": "STARBUCKS STORE 4521 SAN FRANCISCO CA",
  "merchant_canonical": "<merchant>",
  "type": "debit",                      // debit | credit | fee | interest | transfer | check | dividend
  "check_number": null,
  "reference_id": null,
  "category": "coffee",                 // category id, nullable
  "category_confidence": 0.94,
  "categorized_by": "rule",             // rule | alias | ai | manual | null
  "tax_tag": null,                      // interest | dividend | capgain | mortgage_int | charity | hsa | null
  "transfer_pair_id": null,
  "balance_after": 1192.39,
  "subscription_id": null,
  "anomaly_flags": [],
  "ingested_at": "<ISO timestamp UTC>",
  "source_file_hash": "abc123..."
}
```

## db/categories.json

Array of category records.

```
{
  "id": "coffee",
  "name": "Coffee",
  "parent": "food",
  "aliases": ["coffee shops", "cafe"],
  "created_by": "seed",                 // seed | user | ai
  "created_at": "<ISO timestamp UTC>",
  "frozen": false,                      // if true, AI cannot create siblings with similar names
  "example_merchants": ["<merchant-1>", "<merchant-2>"]
}
```

## db/subscriptions.json

```
{
  "id": "sub_<merchant-slug>",
  "merchant_canonical": "<merchant>",
  "category": "<category>",
  "cadence": "monthly",                 // monthly | annual | other
  "median_amount": 15.49,
  "current_amount": 17.99,
  "first_seen": "2024-03-12",
  "last_seen": "2026-04-12",
  "charge_count_12mo": 12,
  "monthly_cost": 17.99,
  "annual_cost": 215.88,
  "last_price_change": { "date": "2026-03-12", "delta_pct": 16.1 },
  "suggestion_tags": ["recent_price_increase", "overlap_streaming"],
  "suggestion_reason": "<short, human-readable reason for surfacing the suggestion>",
  "status": "active"                    // active | inactive | user_muted
}
```

## db/anomalies.json

```
{
  "id": "anom_...",
  "txn_id": "txn_...",
  "flag": "outlier_amount",             // see flags list in features/anomalies.md
  "amount": 487.32,
  "merchant": "<merchant>",
  "reason": "2.4 stddev above 6-month mean for this merchant",
  "confidence": 0.86,
  "surfaced_at": "<ISO timestamp UTC>",
  "reviewed_by_user": false,
  "user_action": null                   // kept | dismissed | investigated
}
```

## db/merchants.json

```
{
  "canonical_name": "<merchant>",
  "raw_descriptions": ["STARBUCKS STORE #4521", "STARBUCKS COM ORDER"],
  "categories_seen": { "coffee": 47, "food": 2 },
  "first_seen": "2024-01-15",
  "last_seen": "2026-04-30",
  "charge_count": 49
}
```

## db/reports/<YYYY-MM>.json

See `features/reporting.md` for the full report shape.

## Atomic writes

Always: read whole file, mutate in memory, write to `<file>.tmp` in same directory, fsync, `rename` over target. Acquire `db/.lock` (advisory file lock) for the duration of any multi-file write.

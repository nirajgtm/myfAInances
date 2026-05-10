// Talks to the FastAPI backend. Vite dev server proxies /api -> http://127.0.0.1:8000.
// In production (frontend served by backend) the same path resolves natively.

export type Money = number;

export interface AppState {
  counts: { statements: number; transactions: number; categories: number; subscriptions: number; anomalies: number; merchants: number };
  periods: string[];
  accounts: { id: string; institution: string; type: string; last4: string; nickname: string; credit_limit?: number; card_product?: string; currency?: string; login_url?: string; notes?: string }[];
  latest_period: string | null;
}

export interface CategorySpend {
  category_id: string;
  name: string;
  amount: Money;
  txn_count: number;
  pct_of_total: number;
}

export interface MerchantRollup {
  merchant: string;
  amount: Money;
  txn_count: number;
  category: string | null;
}

export interface ReportSummary {
  total_income: Money;
  total_spend: Money;
  net_cashflow: Money;
  savings_rate: number | null;
  txn_count: number;
}

export interface Anomaly {
  id: string;
  txn_id: string;
  flag: string;
  amount: Money;
  merchant: string | null;
  reason: string | null;
  confidence: number;
  reviewed_by_user?: boolean;
  user_action?: string | null;
}

export interface Transaction {
  id: string;
  account_id: string;
  statement_id: string;
  date_posted: string;
  date_transaction: string;
  amount: Money;
  description_raw: string;
  description_normalized: string;
  merchant_canonical: string | null;
  type: string;
  category: string | null;
  category_confidence: number;
  categorized_by: string | null;
  is_foreign?: boolean;
  anomaly_flags: string[];
  subscription_candidate?: boolean;
  merchant_city?: string | null;
  merchant_state?: string | null;
  merchant_country?: string | null;
  merchant_phone?: string | null;
  payment_method?: string | null;
  transaction_time?: string | null;
  original_currency?: string | null;
  original_amount?: number | null;
  authorization_code?: string | null;
  rewards_earned?: number | null;
  extra?: Record<string, any>;
  order_id?: string | null;
}

export interface Report {
  version: number;
  generated_at: string;
  period: { start: string; end: string; month: string };
  accounts_included: string[];
  summary: ReportSummary;
  spend_by_category: CategorySpend[];
  top_merchants_by_amount: MerchantRollup[];
  top_merchants_by_frequency: MerchantRollup[];
  subscriptions: {
    active_count: number;
    monthly_cost_total: number;
    annual_cost_total: number;
    cancellation_candidates: any[];
    pending_candidates: { txn_id: string; merchant: string | null; amount: number; date: string; note: string }[];
  };
  anomalies: Anomaly[];
  categories_added_this_period: any[];
  credit: any[];
  data_quality: { uncategorized_count: number; missing_statements: any[]; balance_mismatches: any[] };
  narrative: string;
}

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${path}`);
  return r.json();
}

export interface CardSummary {
  id: string;
  nickname: string;
  annual_fee: number;
  points_value_cents: number | null;
}

export interface CategoryOffer {
  card_id: string;
  card_nickname: string;
  rate: number;
  unit: string;
  scope: string | null;
  effective_cents_per_dollar: number;
}

export interface CategoryReward {
  match: string;
  scope: string | null;
  best_rate: number;
  best_unit: string;
  best_card_id: string;
  best_card_nickname: string;
  effective_cents_per_dollar: number;
  all_offers: CategoryOffer[];
}

export interface Perk {
  name: string;
  group: string | null;
  annual: boolean;
  description?: string | null;
  how_to_use_url?: string | null;
  providers: { id: string; nickname: string }[];
}

export interface Benefits {
  cards: CardSummary[];
  category_rewards: CategoryReward[];
  perks: Perk[];
  annual_fees_total: number;
}

export interface RecommendationItem {
  txn_id: string;
  date: string;
  merchant: string | null;
  amount: number;
  category: string | null;
  used_card_id: string;
  used_card_nickname: string;
  better_card_id: string;
  better_card_nickname: string;
  missed_dollars: number;
}

export interface Recommendations {
  period: string | null;
  single_card_mode: boolean;
  items: RecommendationItem[];
  total_missed_dollars: number;
}

export interface AmazonOrder {
  order_id: string;
  vendor: string;
  date_placed: string;
  total: number;
  items: { name: string; quantity?: number; price?: number | null }[];
  ship_to?: string | null;
  delivered_on?: string | null;
  payment_card_last4?: string | null;
  matched_txn_id?: string | null;
}

export interface Subscription {
  id: string;
  merchant_canonical: string;
  category: string | null;
  cadence: "monthly" | "quarterly" | "annual" | string;
  median_amount: number;
  current_amount: number;
  first_seen: string;
  last_seen: string;
  charge_count: number;
  charge_count_12mo: number;
  monthly_cost: number;
  annual_cost: number;
  last_price_change: { date: string; delta_pct: number } | null;
  primary_card_id: string;
  card_counts: Record<string, number>;
  txn_ids: string[];
  suggestion_tags: string[];
  suggestion_reason: string;
  status: "active" | "inactive" | "user_muted" | string;
}

export interface Holding {
  symbol: string | null;
  name: string;
  shares?: number | null;
  price?: number | null;
  value: number;
  cost_basis?: number | null;
  unrealized_gain?: number | null;
  asset_class?: string | null;
  allocation_pct?: number | null;
}

export interface BrokerageBlock {
  as_of_date: string | null;
  portfolio_value: number | null;
  cost_basis: number | null;
  unrealized_gain: number | null;
  cash_balance: number | null;
  dividends_period: number | null;
  dividends_ytd: number | null;
  fees_period: number | null;
  holdings: Holding[];
}

export interface RetirementBlock {
  as_of_date: string | null;
  subtype: "traditional_ira" | "roth_ira" | "401k" | "403b" | "sep_ira" | "hsa" | string;
  balance: number | null;
  vested_balance: number | null;
  ytd_contributions_employee: number | null;
  ytd_contributions_employer: number | null;
  ytd_contributions_total: number | null;
  annual_contribution_limit: number | null;
  ytd_distributions: number | null;
  loan_balance: number | null;
  vesting_schedule: string | null;
  plan_name: string | null;
  plan_sponsor: string | null;
  plan_id: string | null;
  rmd_required: boolean | null;
  rmd_amount: number | null;
  beneficiaries: string[];
  holdings: Holding[];
}

export interface LoanBlock {
  loan_type: "mortgage" | "auto" | "student" | "personal" | "heloc" | "other";
  principal_balance: number | null;
  original_principal: number | null;
  interest_rate: number | null;
  rate_type: "fixed" | "variable" | null;
  monthly_payment: number | null;
  principal_paid_period: number | null;
  interest_paid_period: number | null;
  principal_paid_ytd: number | null;
  interest_paid_ytd: number | null;
  escrow_balance: number | null;
  next_payment_date: string | null;
  payoff_date: string | null;
  remaining_term_months: number | null;
}

export interface UtilityBlock {
  service_type: string;
  service_address: string | null;
  previous_balance: number | null;
  payments_received: number | null;
  current_charges: number | null;
  amount_due: number | null;
  due_date: string | null;
  auto_pay_enrolled: boolean | null;
  usage: {
    electric_kwh?: number | null;
    electric_cost?: number | null;
    gas_therms?: number | null;
    gas_cost?: number | null;
    water_gallons?: number | null;
    average_daily_kwh?: number | null;
    average_daily_therms?: number | null;
    vs_prior_period_pct?: number | null;
    rate_plan?: string | null;
    tier_breakdown?: unknown;
  } | null;
}

export interface TollBlock {
  balance: number | null;
  auto_replenish_threshold: number | null;
  auto_replenish_amount: number | null;
  tag_count: number | null;
  trips_period: number | null;
  tolls_period: number | null;
  fees_period: number | null;
  violations_count: number | null;
  violations_amount: number | null;
}

export interface InsuranceBlock {
  policy_type: string;
  policy_number: string | null;
  cash_value: number | null;
  death_benefit: number | null;
  premium_paid_period: number | null;
  premium_paid_ytd: number | null;
  next_premium_due: number | null;
  next_premium_date: string | null;
}

export interface Insight {
  id: string;
  severity: "info" | "low" | "medium" | "high";
  category: "anomaly" | "subscription" | "utilization" | "contribution" | "perk" | "tax" | "spending" | "fee" | "other";
  title: string;
  body: string;
  account_id?: string | null;
  txn_id?: string | null;
  action_label?: string | null;
  action_url?: string | null;
}

export interface TaxFormBlock {
  form_type: string;
  tax_year: number;
  issuer?: string | null;
  div_ordinary?: number | null;
  div_qualified?: number | null;
  div_capital_gain_distr?: number | null;
  div_section_199a?: number | null;
  div_nondividend?: number | null;
  div_foreign_tax_paid?: number | null;
  int_income?: number | null;
  int_us_treasury?: number | null;
  int_tax_exempt?: number | null;
  int_early_withdrawal_penalty?: number | null;
  b_total_proceeds?: number | null;
  b_total_cost_basis?: number | null;
  b_total_gain_loss?: number | null;
  b_short_term_proceeds?: number | null;
  b_short_term_basis?: number | null;
  b_short_term_gain?: number | null;
  b_long_term_proceeds?: number | null;
  b_long_term_basis?: number | null;
  b_long_term_gain?: number | null;
  misc_other_income?: number | null;
  misc_nonemployee_comp?: number | null;
  fed_tax_withheld?: number | null;
  state_tax_withheld?: number | null;
  summary_total_dividends?: number | null;
  summary_total_interest?: number | null;
  summary_total_realized_gain_loss?: number | null;
  summary_total_fees?: number | null;
}

export interface TaxFormRecord {
  statement_id: string;
  account_id: string;
  institution: string;
  issue_date: string | null;
  period_start: string;
  period_end: string;
  tax_year: number;
  form_type: string;
  form: TaxFormBlock;
}

export interface AccountSummary {
  account_id: string;
  account_type: string | null;
  balance: number | null;
  credit_limit: number | null;
  available_credit: number | null;
  min_payment_due: number | null;
  payment_due_date: string | null;
  last_activity: string | null;
  txn_count_12mo: number;
  monthly_activity: { month: string; count: number }[];
  statement_months: string[];
  latest_statement_period_end: string | null;
  brokerage: BrokerageBlock | null;
  retirement: RetirementBlock | null;
  loan: LoanBlock | null;
  utility: UtilityBlock | null;
  toll: TollBlock | null;
  insurance: InsuranceBlock | null;
}

export const api = {
  state: () => jget<AppState>("/api/state"),
  accountSummaries: () => jget<AccountSummary[]>("/api/account-summaries"),
  taxForms: () => jget<TaxFormRecord[]>("/api/tax-forms"),
  insights: () => jget<Insight[]>("/api/insights"),
  report: (period: string) => jget<Report>(`/api/reports/${period}`),
  reports: () => jget<{ period: string; summary: ReportSummary; narrative: string }[]>("/api/reports"),
  transactions: (period: string) => jget<Transaction[]>(`/api/transactions?period=${period}`),
  benefits: () => jget<Benefits>("/api/benefits"),
  recommendations: (period: string) => jget<Recommendations>(`/api/recommendations?period=${period}`),
  subscriptions: () => jget<Subscription[]>("/api/subscriptions"),
  transactionOrder: (txn_id: string) => jget<AmazonOrder | null>(`/api/transactions/${txn_id}/order`),
  uploadFiles: async (files: File[]): Promise<{ saved: { filename: string; stored_at: string; bytes: number }[]; rejected: { filename: string; reason: string }[]; total: number }> => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    const r = await fetch(`/api/upload`, { method: "POST", body: fd });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  triggerIngest: async (): Promise<{ ok: boolean; exit_code: number; stdout_tail: string; stderr_tail: string }> => {
    const r = await fetch(`/api/ingest`, { method: "POST" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  ingestStatus: async (): Promise<{ active: boolean; started_at?: string }> => {
    const r = await fetch(`/api/ingest/status`);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  dismissSubscription: async (id: string) => {
    const r = await fetch(`/api/subscriptions/dismiss/${encodeURIComponent(id)}`, { method: "POST" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  includeSubscription: async (merchant: string, cadence: "monthly" | "quarterly" | "annual" = "monthly") => {
    const r = await fetch(`/api/subscriptions/include`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant, action: "include", cadence }),
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  updateAccount: async (id: string, patch: { nickname?: string; login_url?: string; notes?: string }) => {
    const r = await fetch(`/api/accounts/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  reviewAnomaly: async (id: string, action: "kept" | "dismissed" | "investigated") => {
    const r = await fetch(`/api/anomalies/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
};

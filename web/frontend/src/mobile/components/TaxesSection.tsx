// Wealth tab — taxes section. One card per tax-year with totals from the
// 1099 composite. Tappable rows open the source statement (account detail
// → activity tab). Fed/state withholding shown when present.

import { TaxFormRecord, AppState } from "../../shared/lib/api";
import { fmtMoney } from "../../shared/lib/format";
import { Receipt } from "lucide-react";

interface Props {
  forms: TaxFormRecord[];
  accounts: AppState["accounts"];
  onSelectAccount?: (id: string) => void;
}

export function TaxesSection({ forms, accounts, onSelectAccount }: Props) {
  if (forms.length === 0) return null;

  // Group by tax year, then by account.
  const byYear = new Map<number, TaxFormRecord[]>();
  for (const f of forms) {
    const arr = byYear.get(f.tax_year) || [];
    arr.push(f);
    byYear.set(f.tax_year, arr);
  }

  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ marginBottom: 8, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: 7, background: "var(--bg-mute)", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Receipt size={13} strokeWidth={2} />
        </span>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Taxes</div>
        <span style={{ fontSize: 11, color: "var(--text-3)", background: "var(--bg-mute)", padding: "1px 7px", borderRadius: 999, fontWeight: 600 }}>
          {forms.length}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {years.map((year) => (
          <YearCard
            key={year}
            year={year}
            forms={byYear.get(year)!}
            accounts={accounts}
            onSelectAccount={onSelectAccount}
          />
        ))}
      </div>
    </div>
  );
}

function YearCard({ year, forms, accounts, onSelectAccount }: { year: number; forms: TaxFormRecord[]; accounts: AppState["accounts"]; onSelectAccount?: (id: string) => void }) {
  // Roll up totals across all forms in this year (e.g., Schwab + Fidelity).
  let divTotal = 0;
  let intTotal = 0;
  let realizedTotal = 0;
  let withheldTotal = 0;
  let hasGain = false;
  let hasInt = false;
  let hasWithheld = false;

  for (const f of forms) {
    const tf = f.form;
    const div = tf.summary_total_dividends ?? tf.div_ordinary ?? 0;
    divTotal += div;
    const intr = tf.summary_total_interest ?? tf.int_income ?? 0;
    if (intr) hasInt = true;
    intTotal += intr;
    const gain = tf.summary_total_realized_gain_loss ?? tf.b_total_gain_loss ?? 0;
    if (gain) hasGain = true;
    realizedTotal += gain;
    const wh = (tf.fed_tax_withheld ?? 0) + (tf.state_tax_withheld ?? 0);
    if (wh) hasWithheld = true;
    withheldTotal += wh;
  }

  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 16, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>Tax year {year}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>
          {forms.length} form{forms.length === 1 ? "" : "s"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Tile label="Dividends" value={divTotal} positive />
        {hasInt && <Tile label="Interest" value={intTotal} positive />}
        {hasGain && <Tile label="Realized G/L" value={realizedTotal} positive={realizedTotal >= 0} colorByValue />}
        {hasWithheld && <Tile label="Withheld" value={withheldTotal} />}
      </div>

      {/* Per-form list (clickable into the account) */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {forms.map((f) => {
          const a = accounts.find((x) => x.id === f.account_id);
          return (
            <button
              key={f.statement_id}
              onClick={() => onSelectAccount?.(f.account_id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                background: "var(--bg)",
                border: "0.5px solid var(--line)",
                borderRadius: 10,
                cursor: onSelectAccount ? "pointer" : "default",
                color: "inherit",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                <span style={{ fontWeight: 600 }}>{a?.nickname || f.account_id}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                  {f.form_type}
                  {f.issue_date && ` · prepared ${f.issue_date}`}
                </span>
              </div>
              <span style={{ color: "var(--text-3)", fontSize: 11 }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tile({ label, value, positive, colorByValue }: { label: string; value: number; positive?: boolean; colorByValue?: boolean }) {
  const color = colorByValue
    ? value >= 0 ? "var(--positive)" : "var(--negative)"
    : positive ? "var(--positive)" : "var(--text)";
  return (
    <div style={{ padding: 10, background: "var(--bg)", borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div className="num-display" style={{ fontSize: 18, fontWeight: 500, marginTop: 2, color }}>
        {(value >= 0 ? "" : "-")}{fmtMoney(value, { decimals: 0, abs: true })}
      </div>
    </div>
  );
}

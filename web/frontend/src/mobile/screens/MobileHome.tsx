// Mobile home — period summary hero, cashflow row, alerts, recent activity.
// Adapted from the design's MobileHome with our actual data: no net-worth (no checking yet),
// so the hero shows period spending instead.

import { Report, AppState, Transaction, Benefits, Recommendations, AccountSummary, Insight } from "../../shared/lib/api";
import { UploadStatus } from "../../shared/lib/upload";
import { fmtMoney, todayPretty, categorySoft, fmtMonth } from "../../shared/lib/format";
import { Sparkline } from "../../shared/primitives/Sparkline";
import { UpcomingPayments } from "../components/UpcomingPayments";
import { InsightsFeed } from "../components/InsightsFeed";
import { UploadDropzone } from "../components/UploadDropzone";

interface Props {
  state: AppState;
  report: Report;
  transactions: Transaction[];
  benefits: Benefits | null;
  recommendations: Recommendations | null;
  accountSummaries: AccountSummary[];
  insights: Insight[];
  uploadStatus: UploadStatus;
  onUploadFiles: (files: FileList | null) => void;
  onSelectTxn?: (t: Transaction) => void;
  onSelectAccount?: (id: string) => void;
  onSelectAlert?: (a: import("../../shared/lib/api").Anomaly) => void;
}

export function MobileHome({ state, report, transactions, benefits, recommendations, accountSummaries, insights, uploadStatus, onUploadFiles, onSelectTxn, onSelectAccount }: Props) {
  const s = report.summary;
  const spendAbs = Math.abs(s.total_spend);

  // Cashflow trend placeholder: build from transactions sorted by date, cumulative.
  const trend = buildCumulativeTrend(transactions);

  return (
    <div
      className="app-root"
      style={{
        height: "100%",
        background: "var(--bg)",
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Greeting (filter bar + settings live above this in App.tsx) */}
      <div style={{ padding: "8px 20px 8px" }}>
        <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500 }}>{todayPretty()}</div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 2 }}>
          {greeting()}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 16px 100px" }}>
        {/* Hero: period spending */}
        <div
          style={{
            background: "var(--bg-elev)",
            borderRadius: "var(--r-xl)",
            padding: 22,
            boxShadow: "var(--shadow-md)",
            marginTop: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {fmtMonth(report.period.month)} spending
          </div>
          <div className="num-display" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-0.04em", marginTop: 6, lineHeight: 1 }}>
            {fmtMoney(spendAbs, { decimals: 2 })}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
            {s.txn_count} transaction{s.txn_count === 1 ? "" : "s"} - {state.accounts.length} account{state.accounts.length === 1 ? "" : "s"}
          </div>
          {trend.length >= 2 && (
            <div style={{ marginTop: 14, marginLeft: -6, marginRight: -6 }}>
              <Sparkline data={trend} width={320} height={56} color="var(--accent)" strokeWidth={2} />
            </div>
          )}
        </div>

        {/* Cashflow row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <CashCard label={`In - ${monthLabel(report.period.month)}`} value={s.total_income} positive />
          <CashCard label={`Out - ${monthLabel(report.period.month)}`} value={Math.abs(s.total_spend)} />
        </div>

        {/* Drag-drop upload — primary way to add new data */}
        <UploadDropzone status={uploadStatus} onFiles={onUploadFiles} />

        {/* Upcoming card payments */}
        <UpcomingPayments accounts={state.accounts} summaries={accountSummaries} onSelectCard={onSelectAccount} />

        {/* Insights feed (replaces Recent activity + Needs attention) */}
        <InsightsFeed
          insights={insights}
          state={state}
          allTransactions={transactions}
          onSelectAccount={onSelectAccount}
          onSelectTxn={onSelectTxn}
        />
      </div>
    </div>
  );
}

function CashCard({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "var(--shadow-sm)" }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        className="num-display"
        style={{
          fontSize: 22,
          fontWeight: 500,
          marginTop: 4,
          color: positive ? "var(--positive)" : "var(--text)",
        }}
      >
        {fmtMoney(value, { decimals: 0, abs: true })}
      </div>
    </div>
  );
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div
      style={{
        marginTop: 18,
        marginBottom: 8,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "0 4px",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      {right && <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>{right}</div>}
    </div>
  );
}

function buildCumulativeTrend(txns: Transaction[]): number[] {
  // Cumulative running balance across the period (positive direction = spending).
  const sorted = [...txns]
    .filter((t) => t.type !== "transfer")
    .sort((a, b) => a.date_posted.localeCompare(b.date_posted));
  let total = 0;
  return sorted.map((t) => {
    total += Math.abs(t.amount);
    return total;
  });
}

function severityFor(flag: string): "high" | "medium" | "low" {
  if (flag === "large_txn" || flag === "card_test" || flag === "dup_billing" || flag === "unwanted_merchant") return "high";
  if (flag === "fee" || flag === "outlier_amount" || flag === "free_trial_jump" || flag === "round_number_large") return "medium";
  return "low";
}

function prettyFlag(flag: string): string {
  return {
    large_txn: "Unusually large transaction",
    fee: "Fee charged",
    foreign: "Foreign transaction",
    new_merchant: "New merchant",
    outlier_amount: "Outlier amount",
    dup_billing: "Possible duplicate billing",
    card_test: "Card-test pattern",
    late_night: "Late-night spending",
    round_number_large: "Large round-number charge",
    free_trial_jump: "Free trial converted to paid",
    unwanted_merchant: "Merchant on your block list",
  }[flag] ?? flag;
}

function prettyCategory(id: string | null): string {
  if (!id) return "Uncategorized";
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtMonthAndDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

function monthLabel(period: string): string {
  const [, m] = period.split("-").map((s) => parseInt(s, 10));
  return new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "short" });
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

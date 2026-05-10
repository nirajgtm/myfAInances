// Home tab — synthesized insights/suggestions feed. Replaces "Recent
// activity". Pulls from /api/insights which fans out anomalies,
// subscriptions, utilization, retirement contribution pace, new tax
// forms, annual fee reminders, and spending category outliers.

import { useState } from "react";
import { Insight, AppState, Transaction } from "../../shared/lib/api";
import {
  AlertTriangle, AlertCircle, Receipt, TrendingUp, CreditCard,
  PiggyBank, Repeat, Sparkles, type LucideIcon,
} from "lucide-react";

interface Props {
  insights: Insight[];
  state: AppState;
  allTransactions: Transaction[];
  onSelectAccount?: (id: string) => void;
  onSelectTxn?: (t: Transaction) => void;
}

const ICONS: Record<Insight["category"], LucideIcon> = {
  anomaly: AlertTriangle,
  subscription: Repeat,
  utilization: CreditCard,
  contribution: PiggyBank,
  perk: Sparkles,
  tax: Receipt,
  spending: TrendingUp,
  fee: AlertCircle,
  other: Sparkles,
};

const SEVERITY_COLOR: Record<Insight["severity"], string> = {
  high: "var(--negative)",
  medium: "var(--warning)",
  low: "var(--accent)",
  info: "var(--text-3)",
};

const SEVERITY_BG: Record<Insight["severity"], string> = {
  high: "rgba(181,58,44,0.10)",
  medium: "rgba(192,138,26,0.12)",
  low: "var(--accent-soft)",
  info: "var(--bg-mute)",
};

export function InsightsFeed({ insights, state, allTransactions, onSelectAccount, onSelectTxn }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (insights.length === 0) {
    return (
      <>
        <SectionHeader title="What we noticed" right="all clear" />
        <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 18, boxShadow: "var(--shadow-sm)", textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>
          Nothing to flag right now. Your spending, subscriptions, and credit utilization are all on autopilot.
        </div>
      </>
    );
  }

  const visible = expanded ? insights : insights.slice(0, 2);
  const hidden = insights.length - visible.length;

  return (
    <>
      <SectionHeader title="What we noticed" right={`${insights.length} item${insights.length === 1 ? "" : "s"}`} />
      <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
        {visible.map((it, i) => {
          const Icon = ICONS[it.category] ?? Sparkles;
          const onClick = () => {
            if (it.txn_id) {
              const t = allTransactions.find((x) => x.id === it.txn_id);
              if (t) onSelectTxn?.(t);
              return;
            }
            if (it.account_id) onSelectAccount?.(it.account_id);
          };
          const tint = SEVERITY_COLOR[it.severity];
          const bg = SEVERITY_BG[it.severity];
          return (
            <button
              key={it.id}
              onClick={onClick}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                padding: "12px 14px",
                gap: 12,
                borderTop: i ? "0.5px solid var(--line)" : "none",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                color: "inherit",
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: bg,
                  color: tint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <Icon size={15} strokeWidth={2} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {it.title}
                  </div>
                  {it.severity !== "info" && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: tint, background: bg, padding: "1px 5px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {it.severity}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3, lineHeight: 1.45 }}>
                  {it.body}
                </div>
              </div>
              <span style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6, flexShrink: 0 }}>›</span>
            </button>
          );
        })}
      </div>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "10px 0",
            background: "var(--bg-elev)",
            color: "var(--text-2)",
            border: "0.5px solid var(--line)",
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Show {hidden} more
        </button>
      )}
      {expanded && insights.length > 2 && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "10px 0",
            background: "transparent",
            color: "var(--text-3)",
            border: "0.5px solid var(--line)",
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Show less
        </button>
      )}
    </>
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

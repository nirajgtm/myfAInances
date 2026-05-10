// Mobile alerts — anomaly events with severity color bar (matches the design's MobileAlerts).
// Wires the read-only review action via the FastAPI backend.

import { useState } from "react";
import { Anomaly, api } from "../../shared/lib/api";
import { fmtMoney } from "../../shared/lib/format";

interface Props {
  anomalies: Anomaly[];
  onMutate?: () => void;  // refetch parent state after action
}

export function MobileAlerts({ anomalies, onMutate }: Props) {
  const visible = anomalies.filter((a) => !a.reviewed_by_user);

  return (
    <div className="app-root" style={{ height: "100%", background: "var(--bg)", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px 6px" }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Alerts</div>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>
          {visible.length === 0
            ? "Nothing needs review."
            : `${visible.length} item${visible.length === 1 ? "" : "s"} need${visible.length === 1 ? "s" : ""} a look`}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px 100px" }}>
        {visible.length === 0 && (
          <div
            style={{
              padding: 28,
              textAlign: "center",
              color: "var(--text-3)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            All clear. Anomalies you've reviewed don't appear here.
          </div>
        )}

        {visible.map((a) => (
          <AnomalyCard key={a.id} a={a} onAction={onMutate} />
        ))}
      </div>
    </div>
  );
}

function severityFor(flag: string): "high" | "medium" | "low" {
  if (flag === "large_txn" || flag === "card_test" || flag === "dup_billing" || flag === "unwanted_merchant") return "high";
  if (flag === "fee" || flag === "outlier_amount" || flag === "free_trial_jump" || flag === "round_number_large") return "medium";
  return "low";
}

function sevColor(sev: "high" | "medium" | "low"): string {
  return sev === "high" ? "var(--negative)" : sev === "medium" ? "var(--warning)" : "var(--text-3)";
}

function sevSoft(sev: "high" | "medium" | "low"): string {
  return sev === "high" ? "rgba(181,58,44,0.12)" : sev === "medium" ? "rgba(192,138,26,0.16)" : "var(--bg-mute)";
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

function AnomalyCard({ a, onAction }: { a: Anomaly; onAction?: () => void }) {
  const [busy, setBusy] = useState(false);
  const sev = severityFor(a.flag);

  async function review(action: "kept" | "dismissed" | "investigated") {
    if (busy) return;
    setBusy(true);
    try {
      await api.reviewAnomaly(a.id, action);
      onAction?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        borderRadius: "var(--r-lg)",
        padding: 16,
        marginBottom: 10,
        boxShadow: "var(--shadow-sm)",
        borderLeft: `3px solid ${sevColor(sev)}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 7px",
                background: sevSoft(sev),
                color: sevColor(sev),
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {sev}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
              confidence {(a.confidence * 100).toFixed(0)}%
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {prettyFlag(a.flag)}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{a.merchant ?? "-"}</div>
        </div>
        <div className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {fmtMoney(a.amount, { decimals: 2 })}
        </div>
      </div>
      {a.reason && (
        <div
          style={{
            fontSize: 13,
            color: "var(--text-2)",
            marginTop: 10,
            padding: 11,
            background: "var(--bg-sunken)",
            borderRadius: 10,
            lineHeight: 1.4,
          }}
        >
          {a.reason}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => review("dismissed")}
          disabled={busy}
          style={{
            flex: 1,
            padding: "9px 0",
            background: "var(--bg-mute)",
            color: "var(--text)",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Dismiss
        </button>
        <button
          onClick={() => review("investigated")}
          disabled={busy}
          style={{
            flex: 1,
            padding: "9px 0",
            background: "var(--text)",
            color: "var(--bg)",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Investigate
        </button>
      </div>
    </div>
  );
}

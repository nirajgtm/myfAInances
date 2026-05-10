// Mobile spending — donut + category bars + card pills + click-to-drill.

import { useMemo, useState } from "react";
import { Report, Transaction, AppState } from "../../shared/lib/api";
import { fmtMoney, categoryColor } from "../../shared/lib/format";
import { getCategoryIcon } from "../../shared/lib/categoryIcon";
import { Donut } from "../../shared/primitives/Donut";
import { HBar } from "../../shared/primitives/HBar";
import { CardPill } from "../../shared/primitives/CardPill";
import { SpendingInsights } from "../components/SpendingInsights";
import { SubscriptionsList } from "../components/SubscriptionsList";

type Pill = "categories" | "insights" | "subs";

interface Props {
  report: Report;
  transactions: Transaction[];
  allTransactions: Transaction[];
  state: AppState;
  onSelectTxn?: (t: Transaction) => void;
}

export function MobileSpending({ report, transactions, allTransactions, state, onSelectTxn }: Props) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [pill, setPill] = useState<Pill>("categories");

  // Compute spending from filtered transactions (respects global card+period filter).
  // Falls back to report when transactions list is the same as report's period.
  const cats = useMemo(() => {
    const buckets: Record<string, { category_id: string; name: string; amount: number; txn_count: number; cards: Record<string, number> }> = {};
    for (const t of transactions) {
      if (t.amount >= 0 || t.type === "transfer") continue;
      const cid = t.category || "uncategorized";
      const b = buckets[cid] = buckets[cid] || { category_id: cid, name: prettyCategory(cid), amount: 0, txn_count: 0, cards: {} };
      b.amount += t.amount;
      b.txn_count += 1;
      b.cards[t.account_id] = (b.cards[t.account_id] || 0) + 1;
    }
    return Object.values(buckets).sort((a, b) => a.amount - b.amount);
  }, [transactions]);

  const total = cats.reduce((s, x) => s + Math.abs(x.amount), 0);
  const max = cats.length ? Math.max(...cats.map((c) => Math.abs(c.amount))) : 0;
  const segments = cats.map((c) => ({ value: Math.abs(c.amount), color: categoryColor(c.category_id) }));

  // Pretty category id for display
  function prettyCategory(id: string): string {
    return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="app-root" style={{ height: "100%", background: "var(--bg)", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px 6px" }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Spending</div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px 100px" }}>
        <PillBar active={pill} onChange={setPill} />

        {pill === "categories" && cats.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
            No spending in this period.
          </div>
        )}

        {pill === "categories" && cats.length > 0 && (
          <>
        {/* Donut card */}
        <div
          style={{
            background: "var(--bg-elev)",
            borderRadius: "var(--r-xl)",
            padding: 20,
            boxShadow: "var(--shadow-md)",
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
            <Donut segments={segments} size={140} thickness={18} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-3)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {report.period.month.slice(5, 7) + "/" + report.period.month.slice(2, 4)}
              </div>
              <div className="num-display" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.03em", marginTop: 2 }}>
                {fmtMoney(total, { decimals: 0, abs: true })}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            {cats.slice(0, 5).map((c) => {
              const pct = ((Math.abs(c.amount) / total) * 100).toFixed(0);
              const Icon = getCategoryIcon(c.category_id);
              return (
                <div key={c.category_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      background: `${categoryColor(c.category_id)}1a`,
                      color: categoryColor(c.category_id),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={11} strokeWidth={2} />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      color: "var(--text-2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.name}
                  </span>
                  <span className="num" style={{ fontSize: 11, color: "var(--text-3)" }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bars list with card pills + click-to-expand drilldown */}
        <div
          style={{
            background: "var(--bg-elev)",
            borderRadius: "var(--r-lg)",
            padding: 18,
            boxShadow: "var(--shadow-sm)",
            marginTop: 12,
          }}
        >
          {cats.map((c, i) => {
            const cardEntries = Object.entries(c.cards).sort((a, b) => b[1] - a[1]);
            const isExpanded = expandedCat === c.category_id;
            const drilldownTxns = isExpanded
              ? transactions.filter((t) => (t.category || "uncategorized") === c.category_id && t.amount < 0)
              : [];
            const Icon = getCategoryIcon(c.category_id);
            return (
              <div key={c.category_id} style={{ marginTop: i ? 16 : 0 }}>
                <button
                  onClick={() => setExpandedCat(isExpanded ? null : c.category_id)}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 7,
                          background: `${categoryColor(c.category_id)}1f`,
                          color: categoryColor(c.category_id),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={14} strokeWidth={2} />
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{c.txn_count}</span>
                    </div>
                    <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>
                      {fmtMoney(Math.abs(c.amount), { decimals: 2, abs: true })}
                    </span>
                  </div>
                  <HBar value={Math.abs(c.amount)} max={max} color={categoryColor(c.category_id)} height={5} />
                  {/* Card pills row */}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                    {cardEntries.map(([cardId, count]) => {
                      const a = state.accounts.find((x) => x.id === cardId);
                      if (!a) return null;
                      return (
                        <span key={cardId} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <CardPill id={cardId} name={a.nickname} />
                          <span style={{ fontSize: 10, color: "var(--text-3)" }}>{count}</span>
                        </span>
                      );
                    })}
                  </div>
                </button>
                {/* Drilldown */}
                {isExpanded && drilldownTxns.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      background: "var(--bg)",
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    {drilldownTxns.slice(0, 10).map((t, j) => (
                      <button
                        key={t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTxn?.(t);
                        }}
                        style={{
                          width: "100%",
                          padding: "9px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 10,
                          borderTop: j ? "0.5px solid var(--line)" : "none",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          color: "inherit",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.merchant_canonical || t.description_normalized}
                        </span>
                        <span className="num" style={{ fontWeight: 600, flexShrink: 0 }}>
                          {fmtMoney(Math.abs(t.amount), { decimals: 2, abs: true })}
                        </span>
                      </button>
                    ))}
                    {drilldownTxns.length > 10 && (
                      <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
                        + {drilldownTxns.length - 10} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
          </>
        )}

        {pill === "insights" && (
          <SpendingInsights
            report={report}
            transactions={transactions}
            allTransactions={allTransactions}
            defaultExpanded
          />
        )}

        {pill === "subs" && (
          <SubscriptionsList transactions={transactions} state={state} onSelectTxn={onSelectTxn} />
        )}
      </div>
    </div>
  );
}

function PillBar({ active, onChange }: { active: Pill; onChange: (p: Pill) => void }) {
  const items: { id: Pill; label: string }[] = [
    { id: "categories", label: "Categories" },
    { id: "insights", label: "Insights" },
    { id: "subs", label: "Subscriptions" },
  ];
  return (
    <div
      className="no-scrollbar"
      style={{
        display: "inline-flex",
        background: "var(--bg-mute)",
        borderRadius: 999,
        padding: 3,
        marginBottom: 14,
        maxWidth: "100%",
        overflowX: "auto",
      }}
    >
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            style={{
              flexShrink: 0,
              padding: "7px 14px",
              borderRadius: 999,
              border: "none",
              background: isActive ? "var(--bg-elev)" : "transparent",
              color: isActive ? "var(--text)" : "var(--text-3)",
              fontSize: 12.5,
              fontWeight: isActive ? 600 : 500,
              cursor: "pointer",
              boxShadow: isActive ? "var(--shadow-sm)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

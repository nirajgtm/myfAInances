// Mobile transactions feed grouped by day (matches the design's MobileTransactions).

import { useState, useMemo } from "react";
import { Transaction, AppState } from "../../shared/lib/api";
import { fmtMoney, categoryColor } from "../../shared/lib/format";
import { MerchantIcon } from "../../shared/primitives/MerchantIcon";
import { CardPill } from "../../shared/primitives/CardPill";
import { matchesQuery } from "../../shared/lib/search";
import { aliasesFor } from "../../shared/lib/aliases";
import { mapsUrlForTxn } from "../../shared/lib/maps";
import { MapPin } from "lucide-react";

interface Props {
  transactions: Transaction[];
  state?: AppState | null;
  onSelectTxn?: (t: Transaction) => void;
}

export function MobileTransactions({ transactions, state, onSelectTxn }: Props) {
  const [query, setQuery] = useState("");

  // Filter by search across many fields
  const visible = useMemo(() => {
    if (!query.trim()) return transactions;
    const accountById = new Map((state?.accounts ?? []).map((a) => [a.id, a]));
    return transactions.filter((t) => {
      const a = accountById.get(t.account_id);
      return matchesQuery(query, [
        t.merchant_canonical,
        t.description_raw,
        t.description_normalized,
        t.category,
        aliasesFor(t.category),
        t.type,
        t.merchant_city,
        t.merchant_state,
        t.merchant_country,
        t.payment_method,
        a?.nickname,
        a?.institution,
        a?.last4,
        Math.abs(t.amount).toFixed(2),
        t.date_posted,
      ]);
    });
  }, [query, transactions, state]);

  const groups = groupByDate(visible);
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  return (
    <div className="app-root" style={{ height: "100%", background: "var(--bg)", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px 6px" }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Activity</div>
      </div>

      {/* Search bar */}
      <div style={{ padding: "8px 16px 4px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 12px",
            background: "var(--bg-mute)",
            borderRadius: 12,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-3)" strokeWidth="1.8">
            <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchant, card, amount, city..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--text)",
              fontFamily: "inherit",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-3)",
                cursor: "pointer",
                fontSize: 13,
                padding: "0 4px",
              }}
            >
              ×
            </button>
          )}
        </div>
        {query && (
          <div style={{ fontSize: 11, color: "var(--text-3)", padding: "6px 4px 0" }}>
            {visible.length} of {transactions.length} match
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px 100px" }}>
        {dates.map((date) => {
          const items = groups[date];
          const total = items.reduce((s, t) => s + t.amount, 0);
          return (
            <div key={date} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px 8px", alignItems: "baseline" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>
                  {fmtDate(date)}
                </div>
                <div className="num" style={{ fontSize: 12, color: "var(--text-3)" }}>
                  {fmtMoney(total, { sign: total > 0, decimals: 2 })}
                </div>
              </div>
              <div
                style={{
                  background: "var(--bg-elev)",
                  borderRadius: "var(--r-lg)",
                  boxShadow: "var(--shadow-sm)",
                  overflow: "hidden",
                }}
              >
                {items.map((t, i) => {
                  const acct = state?.accounts.find((a) => a.id === t.account_id);
                  const mapsUrl = mapsUrlForTxn(t);
                  return (
                  <button
                    key={t.id}
                    onClick={() => onSelectTxn?.(t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "11px 14px",
                      gap: 12,
                      borderTop: i ? "0.5px solid var(--line)" : "none",
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "inherit",
                    }}
                  >
                    <MerchantIcon
                      label={t.merchant_canonical}
                      color={categoryColor(t.category)}
                      size={34}
                      radius={10}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          letterSpacing: "-0.01em",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.merchant_canonical ?? t.description_normalized}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-3)",
                          marginTop: 3,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {acct && <CardPill id={acct.id} name={acct.nickname} />}
                        <span className="cat-dot" style={{ background: categoryColor(t.category) }} />
                        <span>{prettyCategory(t.category)}</span>
                        {t.subscription_candidate ? <span>- subscription</span> : null}
                      </div>
                    </div>
                    {mapsUrl && (
                      <span
                        role="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(mapsUrl, "_blank", "noopener,noreferrer");
                        }}
                        title={t.merchant_city ? `Open ${t.merchant_canonical || ""} in Maps (${t.merchant_city}${t.merchant_state ? ", " + t.merchant_state : ""})` : "Open in Maps"}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          background: "var(--bg-mute)",
                          color: "var(--text-3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          cursor: "pointer",
                        }}
                      >
                        <MapPin size={12} strokeWidth={2} />
                      </span>
                    )}
                    <div
                      className="num"
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: t.amount > 0 ? "var(--positive)" : "var(--text)",
                      }}
                    >
                      {fmtMoney(t.amount, { sign: t.amount > 0, decimals: 2 })}
                    </div>
                  </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupByDate(txns: Transaction[]): Record<string, Transaction[]> {
  const out: Record<string, Transaction[]> = {};
  for (const t of txns) {
    (out[t.date_posted] = out[t.date_posted] || []).push(t);
  }
  return out;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function prettyCategory(id: string | null): string {
  if (!id) return "Uncategorized";
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

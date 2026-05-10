// Mobile subscriptions/recurring view backed by db/subscriptions.json.
// Each row shows the primary card, cadence, monthly cost, and any flags
// (price increase, overlap). Tap to open the latest transaction in the detail sheet.

import { useEffect, useState } from "react";
import { Transaction, AppState, Subscription, api } from "../../shared/lib/api";
import { fmtMoney, categoryColor, initialFor, cardShortName } from "../../shared/lib/format";
import { MerchantIcon } from "../../shared/primitives/MerchantIcon";
import { CardPill } from "../../shared/primitives/CardPill";

interface Props {
  report: any;
  transactions: Transaction[];
  state: AppState;
  onSelectTxn?: (t: Transaction) => void;
}

export function MobileSubscriptions({ transactions, state, onSelectTxn }: Props) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.subscriptions().then((s) => { setSubs(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Filter by selected cards: show subs whose primary_card_id is among any txn we currently see
  const visibleAccountIds = new Set(transactions.map((t) => t.account_id));
  const filtered = subs.filter((s) => {
    if (visibleAccountIds.size === 0) return true;
    return Object.keys(s.card_counts || {}).some((id) => visibleAccountIds.has(id));
  });

  const active = filtered.filter((s) => s.status === "active");
  const monthlyTotal = active.reduce((sum, s) => sum + s.monthly_cost, 0);
  const annualTotal = active.reduce((sum, s) => sum + s.annual_cost, 0);
  const candidates = active.filter((s) => s.suggestion_tags.length > 0);

  return (
    <div className="app-root" style={{ height: "100%", background: "var(--bg)", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px 6px" }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Recurring</div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px 100px" }}>
        {/* Hero */}
        <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-xl)", padding: 22, boxShadow: "var(--shadow-md)" }}>
          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Annualized
          </div>
          <div className="num-display" style={{ fontSize: 38, fontWeight: 500, letterSpacing: "-0.04em", marginTop: 4, lineHeight: 1 }}>
            {fmtMoney(annualTotal, { decimals: 0, abs: true })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
            <Stat label="Monthly" value={fmtMoney(monthlyTotal, { decimals: 2, abs: true })} />
            <Stat label="Active" value={String(active.length)} />
          </div>
        </div>

        {loading && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            Loading subscriptions...
          </div>
        )}

        {!loading && active.length === 0 && (
          <div style={{ marginTop: 24, padding: 24, background: "var(--bg-elev)", borderRadius: "var(--r-lg)", textAlign: "center", color: "var(--text-3)", fontSize: 13, lineHeight: 1.5 }}>
            No active recurring patterns yet. We need 2+ statements per merchant to confirm a subscription.
          </div>
        )}

        {/* Cancellation candidates first */}
        {candidates.length > 0 && (
          <>
            <SectionLabel text={`Worth a look - ${candidates.length}`} accent />
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {candidates.map((s, i) => (
                <SubRow
                  key={s.id}
                  sub={s}
                  state={state}
                  isFirst={i === 0}
                  onClick={() => {
                    const t = transactions.find((tx) => s.txn_ids.includes(tx.id));
                    if (t && onSelectTxn) onSelectTxn(t);
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* All active */}
        {active.length > 0 && (
          <>
            <SectionLabel text={`Active - ${active.length}`} />
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {active.map((s, i) => (
                <SubRow
                  key={s.id}
                  sub={s}
                  state={state}
                  isFirst={i === 0}
                  onClick={() => {
                    const t = transactions.find((tx) => s.txn_ids.includes(tx.id));
                    if (t && onSelectTxn) onSelectTxn(t);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, padding: "10px 0 0", borderTop: "1px solid var(--line)" }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function SectionLabel({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: accent ? "var(--accent)" : "var(--text-3)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        margin: "20px 4px 8px",
      }}
    >
      {text}
    </div>
  );
}

function SubRow({ sub, state, isFirst, onClick }: { sub: Subscription; state: AppState; isFirst: boolean; onClick?: () => void }) {
  const acct = state.accounts.find((a) => a.id === sub.primary_card_id);
  const cadenceLabel = sub.cadence === "monthly" ? "/mo" : sub.cadence === "annual" ? "/yr" : "/qtr";
  const flags = sub.suggestion_tags;
  const hasPriceUp = flags.includes("recent_price_increase");

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        color: "inherit",
        padding: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 14px",
          gap: 12,
          borderTop: isFirst ? "none" : "0.5px solid var(--line)",
        }}
      >
        <MerchantIcon
          icon={initialFor(sub.merchant_canonical)}
          label={sub.merchant_canonical}
          color={categoryColor(sub.category)}
          size={36}
          radius={10}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>{sub.merchant_canonical}</span>
            {hasPriceUp && (
              <span
                style={{
                  fontSize: 9.5,
                  color: "var(--warning)",
                  background: "rgba(192,138,26,0.16)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                +{sub.last_price_change?.delta_pct.toFixed(0)}%
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
            {acct && <CardPill id={acct.id} name={acct.nickname} />}
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              {sub.charge_count_12mo}x in last 12mo
            </span>
          </div>
          {sub.suggestion_reason && (
            <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4, lineHeight: 1.35 }}>
              {sub.suggestion_reason}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>
            {fmtMoney(sub.current_amount, { decimals: 2, abs: true })}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>{cadenceLabel}</div>
        </div>
      </div>
    </button>
  );
}

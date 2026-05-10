// Bottom-sheet card detail. Opens when a credit card row is tapped.
// Sections: header (avatar + name + last4 + tags), balance / utilization,
// card-specific perks (filtered from global perks), category rewards
// for this card, statement coverage, and recent transactions.

import { useEffect, useState } from "react";
import {
  AppState,
  AccountSummary,
  Benefits,
  Transaction,
  Perk,
  Subscription,
} from "../../shared/lib/api";
import { fmtMoney, cardColor, cardSoft, fmtMonthShort } from "../../shared/lib/format";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { getPerkIcon, getPerkTint } from "../../shared/lib/perkIcon";
import { getCategoryIcon } from "../../shared/lib/categoryIcon";

interface Props {
  account: AppState["accounts"][number] | null;
  summary: AccountSummary | null;
  benefits: Benefits | null;
  transactions: Transaction[]; // pre-filtered to this account is fine; we filter again to be safe
  subscriptions?: Subscription[];
  isPrimary: boolean;
  isDormant: boolean;
  onClose: () => void;
  onSelectTxn?: (t: Transaction) => void;
  onSelectPerk?: (p: Perk) => void;
}

export function CardDetailSheet({
  account,
  summary,
  benefits,
  transactions,
  subscriptions,
  isPrimary,
  isDormant,
  onClose,
  onSelectTxn,
  onSelectPerk,
}: Props) {
  const [tab, setTab] = useState<"overview" | "perks" | "activity">("overview");

  useEffect(() => {
    if (account) setTab("overview");
  }, [account?.id]);

  if (!account || !summary) return null;

  const color = cardColor(account.id);
  const soft = cardSoft(account.id);
  const balance = summary.balance ?? 0;
  const limit = summary.credit_limit ?? 0;
  const utilization = limit > 0 ? (balance / limit) * 100 : 0;
  const sev = utilization < 30 ? "ok" : utilization < 75 ? "warn" : "high";
  const utilColor =
    sev === "ok" ? "var(--positive)" : sev === "warn" ? "var(--warning)" : "var(--negative)";

  const myPerks = (benefits?.perks || []).filter((p) =>
    p.providers.some((pr) => pr.id === account.id)
  );
  const myRewards = (benefits?.category_rewards || []).filter(
    (r) => r.best_card_id === account.id
  );
  const myTxns = transactions
    .filter((t) => t.account_id === account.id)
    .slice(0, 25);
  const mySubs = (subscriptions || []).filter((s) => s.primary_card_id === account.id);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 80, animation: "fadeIn 0.2s ease" }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--bg)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "92vh",
          overflowY: "auto",
          zIndex: 90,
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          animation: "slideUp 0.25s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--bg-mute)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "14px 20px 10px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 11,
              background: soft,
              color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {avatarLetters(account.nickname)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
                {account.nickname}
              </div>
              {isPrimary && <Tag label="PRIMARY" color="var(--accent)" outlined />}
              {isDormant && <Tag label="DORMANT" color="var(--text-3)" />}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
              {prettyInstitution(account.institution)} · {account.last4 ? `•••• ${account.last4}` : "virtual"}
              {account.card_product && ` · ${account.card_product}`}
            </div>
          </div>
        </div>

        {/* Balance / utilization card */}
        <div style={{ padding: "0 16px" }}>
          <div
            style={{
              background: "var(--bg-elev)",
              borderRadius: "var(--r-lg)",
              padding: 16,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div className="num-display" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>
                {fmtMoney(balance, { decimals: 2, abs: true })}
              </div>
              {limit > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  of ${limit.toLocaleString()} limit
                </div>
              )}
            </div>
            {limit > 0 && (
              <>
                <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: "var(--bg-mute)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.min(100, utilization)}%`,
                      height: "100%",
                      background: utilColor,
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
                  <span>{utilization.toFixed(0)}% utilized</span>
                  {summary.available_credit != null && (
                    <span>${summary.available_credit.toLocaleString()} available</span>
                  )}
                </div>
              </>
            )}
            {summary.payment_due_date && summary.min_payment_due != null && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--line)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-3)" }}>Min payment due</span>
                <span>
                  <span className="num" style={{ fontWeight: 600 }}>${summary.min_payment_due.toLocaleString()}</span>
                  <span style={{ color: "var(--text-3)", marginLeft: 6 }}>by {summary.payment_due_date}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Activity heatmap */}
        <div style={{ padding: "14px 16px 0" }}>
          <SectionHeader>12-month activity</SectionHeader>
          <div
            style={{
              background: "var(--bg-elev)",
              borderRadius: "var(--r-lg)",
              padding: 14,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <ActivityHeatmap monthly={summary.monthly_activity} color={color} size={14} gap={5} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-3)", marginTop: 6 }}>
              <span>{fmtMonthShort(summary.monthly_activity[0]?.month || "")}</span>
              <span>{summary.txn_count_12mo} txns total</span>
              <span>{fmtMonthShort(summary.monthly_activity[summary.monthly_activity.length - 1]?.month || "")}</span>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ padding: "14px 16px 0", display: "flex", gap: 6 }}>
          {(["overview", "perks", "activity"] as const).map((t) => {
            const isActive = tab === t;
            const label = t === "overview" ? "Rewards" : t === "perks" ? `Perks (${myPerks.length})` : `Activity (${myTxns.length})`;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  background: isActive ? "var(--text)" : "var(--bg-elev)",
                  color: isActive ? "var(--bg)" : "var(--text-2)",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "12px 16px 8px" }}>
          {tab === "overview" && (
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {myRewards.length === 0 && (
                <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>
                  No category rewards on file. Try refreshing benefits.
                </div>
              )}
              {myRewards.map((r, i) => {
                const Icon = getCategoryIcon(r.match === "*" ? "uncategorized" : r.match);
                return (
                  <div key={r.match + (r.scope || "")} style={{ padding: "10px 14px 12px", borderTop: i ? "0.5px solid var(--line)" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: `color-mix(in srgb, ${color} 14%, transparent)`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={14} strokeWidth={2} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {r.match === "*" ? "All purchases" : r.match.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </div>
                      {r.scope && (
                        <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>{r.scope}</div>
                      )}
                    </div>
                    <div className="num" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>
                      <div>
                        {r.best_rate}{r.best_unit}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 500 }}>
                        {r.effective_cents_per_dollar}c per $
                      </div>
                    </div>
                  </div>
                );
              })}
              {mySubs.length > 0 && (
                <div style={{ padding: "12px 14px", borderTop: "0.5px solid var(--line)", fontSize: 12, color: "var(--text-3)" }}>
                  Pays for {mySubs.length} subscription{mySubs.length === 1 ? "" : "s"}: {mySubs.map((s) => s.merchant_canonical || "unknown").join(", ")}
                </div>
              )}
            </div>
          )}

          {tab === "perks" && (
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {myPerks.length === 0 && (
                <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>
                  No perks researched for this card yet.
                </div>
              )}
              {myPerks.map((p, i) => {
                const Icon = getPerkIcon(p);
                const tint = getPerkTint(p);
                return (
                  <button
                    key={p.name}
                    onClick={() => onSelectPerk?.(p)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderTop: i ? "0.5px solid var(--line)" : "none",
                      background: "transparent",
                      border: "none",
                      textAlign: "left",
                      color: "inherit",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={14} strokeWidth={2} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500 }}>
                      {p.name}
                    </div>
                    {p.annual && (
                      <span style={{ fontSize: 9, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 5px", borderRadius: 4, fontWeight: 600, textTransform: "uppercase" }}>
                        annual
                      </span>
                    )}
                    <span style={{ color: "var(--text-3)", fontSize: 11 }}>›</span>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "activity" && (
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {myTxns.length === 0 && (
                <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>No transactions in current filter.</div>
              )}
              {myTxns.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => onSelectTxn?.(t)}
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderTop: i ? "0.5px solid var(--line)" : "none",
                    background: "transparent",
                    border: "none",
                    textAlign: "left",
                    color: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.merchant_canonical || t.description_normalized}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                      {t.date_posted}
                      {t.category && ` · ${t.category.replace(/_/g, " ")}`}
                    </div>
                  </div>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, color: t.amount > 0 ? "var(--positive)" : "var(--text)" }}>
                    {fmtMoney(t.amount, { sign: t.amount > 0, decimals: 2 })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "8px 16px 16px" }}>
          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "11px 0",
              background: "var(--text)",
              color: "var(--bg)",
              borderRadius: 12,
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--text-3)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 8,
        padding: "0 4px",
      }}
    >
      {children}
    </div>
  );
}

function Tag({ label, color, outlined }: { label: string; color: string; outlined?: boolean }) {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: outlined ? color : "var(--text-2)",
        background: outlined ? "transparent" : "var(--bg-mute)",
        border: outlined ? `1px solid ${color}` : "none",
        padding: "1px 6px",
        borderRadius: 4,
      }}
    >
      {label}
    </span>
  );
}

function avatarLetters(name: string): string {
  const cleaned = name.replace(/Mastercard|Visa|Card|Credit/gi, "").trim();
  const word = cleaned.split(/\s+/).find((w) => w.length >= 3) || cleaned;
  return word.slice(0, 2).toUpperCase();
}

function prettyInstitution(slug: string): string {
  return slug.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

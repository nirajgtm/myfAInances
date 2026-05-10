// Generic account detail bottom sheet. Handles every account type by switching
// tabs based on the type-specific block returned in account-summaries:
//   credit_card  → Rewards | Perks | Activity
//   401k/ira/hsa → Holdings | Contributions | Activity
//   brokerage    → Holdings | Performance | Activity
//   loan/mortgage→ Amortization | Activity
//   utility      → Usage | Activity
//   toll         → Trips | Activity
//   insurance    → Premiums | Activity
//   checking/savings/other → Activity only
//
// Header always shows balance + (if set) a "Log in →" button that opens
// the institution's login URL in a new tab.

import { useEffect, useState } from "react";
import {
  AppState,
  AccountSummary,
  Benefits,
  Transaction,
  Perk,
  Subscription,
  Holding,
  api,
} from "../../shared/lib/api";
import { fmtMoney, cardColor, cardSoft, fmtMonthShort } from "../../shared/lib/format";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { getPerkIcon, getPerkTint } from "../../shared/lib/perkIcon";
import { getCategoryIcon } from "../../shared/lib/categoryIcon";

interface Props {
  account: AppState["accounts"][number] | null;
  summary: AccountSummary | null;
  benefits: Benefits | null;
  transactions: Transaction[];
  subscriptions?: Subscription[];
  isPrimary: boolean;
  isDormant: boolean;
  onClose: () => void;
  onSelectTxn?: (t: Transaction) => void;
  onSelectPerk?: (p: Perk) => void;
  onSelectHolding?: (h: Holding) => void;
  onAccountChanged?: () => void;
}

type TabKey = "rewards" | "perks" | "holdings" | "contributions" | "performance" | "amortization" | "usage" | "trips" | "premiums" | "activity";

export function AccountDetailSheet({
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
  onSelectHolding,
  onAccountChanged,
}: Props) {
  const [tab, setTab] = useState<TabKey>("activity");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!account) return;
    setTab(defaultTabFor(account.type));
    setEditing(false);
  }, [account?.id]);

  if (!account || !summary) return null;

  const color = cardColor(account.id);
  const soft = cardSoft(account.id);
  const tabs = tabsFor(account.type, summary, benefits);

  const myTxns = transactions
    .filter((t) => t.account_id === account.id)
    .slice(0, 30);
  const mySubs = (subscriptions || []).filter((s) => s.primary_card_id === account.id);
  const myPerks = (benefits?.perks || []).filter((p) =>
    p.providers.some((pr) => pr.id === account.id)
  );
  const myRewards = (benefits?.category_rewards || []).filter(
    (r) => r.best_card_id === account.id
  );

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
              {prettyInstitution(account.institution)} · {prettyType(account.type)}
              {account.last4 && ` · •••• ${account.last4}`}
              {account.card_product && ` · ${account.card_product}`}
            </div>
          </div>
          {account.login_url && !editing && (
            <a
              href={account.login_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accent)",
                textDecoration: "none",
                background: "var(--accent-soft)",
                padding: "6px 10px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Log in →
            </a>
          )}
          <button
            aria-label="Edit account"
            onClick={() => setEditing((e) => !e)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: editing ? "var(--bg-mute)" : "transparent",
              border: "0.5px solid var(--line)",
              color: "var(--text-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>

        {/* Inline edit form */}
        {editing && (
          <AccountEditForm
            key={account.id}
            account={account}
            onSaved={() => {
              setEditing(false);
              onAccountChanged?.();
            }}
            onCancel={() => setEditing(false)}
          />
        )}

        {/* Notes (non-edit display) */}
        {!editing && account.notes && (
          <div style={{ padding: "0 16px 6px" }}>
            <div style={{ background: "var(--accent-soft)", color: "var(--accent-deep)", padding: "8px 12px", borderRadius: 10, fontSize: 12, lineHeight: 1.45 }}>
              {account.notes}
            </div>
          </div>
        )}

        {/* Balance / utilization / payment-due summary card (type-aware) */}
        <BalanceCard account={account} summary={summary} />

        {/* Activity heatmap (always shown if we have monthly data) */}
        {summary.monthly_activity && summary.monthly_activity.length > 0 && (
          <div style={{ padding: "14px 16px 0" }}>
            <SectionHeader>12-month activity</SectionHeader>
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "var(--shadow-sm)" }}>
              <ActivityHeatmap monthly={summary.monthly_activity} color={color} size={14} gap={5} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-3)", marginTop: 6 }}>
                <span>{fmtMonthShort(summary.monthly_activity[0]?.month || "")}</span>
                <span>{summary.txn_count_12mo} txns total</span>
                <span>{fmtMonthShort(summary.monthly_activity[summary.monthly_activity.length - 1]?.month || "")}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab switcher */}
        {tabs.length > 1 && (
          <div style={{ padding: "14px 16px 0", display: "flex", gap: 6 }}>
            {tabs.map((t) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
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
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ padding: "12px 16px 8px" }}>
          {tab === "rewards" && <RewardsBody color={color} rewards={myRewards} subs={mySubs} />}
          {tab === "perks" && <PerksBody perks={myPerks} onSelectPerk={onSelectPerk} />}
          {tab === "holdings" && <HoldingsBody summary={summary} accountId={account.id} onSelect={onSelectHolding} />}
          {tab === "contributions" && <ContributionsBody summary={summary} />}
          {tab === "performance" && <PerformanceBody summary={summary} />}
          {tab === "amortization" && <AmortizationBody summary={summary} />}
          {tab === "usage" && <UsageBody summary={summary} />}
          {tab === "trips" && <TripsBody summary={summary} />}
          {tab === "premiums" && <PremiumsBody summary={summary} />}
          {tab === "activity" && <ActivityBody txns={myTxns} onSelectTxn={onSelectTxn} />}
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

function defaultTabFor(type: string): TabKey {
  if (type === "credit_card") return "rewards";
  if (["ira", "roth_ira", "401k", "403b", "sep_ira", "hsa", "brokerage"].includes(type)) return "holdings";
  if (["loan", "mortgage"].includes(type)) return "amortization";
  if (type === "utility") return "usage";
  if (type === "toll") return "trips";
  if (type === "insurance") return "premiums";
  return "activity";
}

function tabsFor(type: string, summary: AccountSummary, benefits: Benefits | null): { key: TabKey; label: string }[] {
  if (type === "credit_card") {
    const perkCount = (benefits?.perks || []).filter((p) => p.providers.some((pr) => pr.id === summary.account_id)).length;
    return [
      { key: "rewards", label: "Rewards" },
      { key: "perks", label: `Perks (${perkCount})` },
      { key: "activity", label: `Activity (${summary.txn_count_12mo})` },
    ];
  }
  if (["ira", "roth_ira", "401k", "403b", "sep_ira", "hsa"].includes(type)) {
    const holdings = summary.retirement?.holdings?.length ?? 0;
    return [
      { key: "holdings", label: `Holdings (${holdings})` },
      { key: "contributions", label: "Contributions" },
      { key: "activity", label: "Activity" },
    ];
  }
  if (type === "brokerage") {
    const holdings = summary.brokerage?.holdings?.length ?? 0;
    return [
      { key: "holdings", label: `Holdings (${holdings})` },
      { key: "performance", label: "Performance" },
      { key: "activity", label: "Activity" },
    ];
  }
  if (["loan", "mortgage"].includes(type)) {
    return [
      { key: "amortization", label: "Amortization" },
      { key: "activity", label: "Activity" },
    ];
  }
  if (type === "utility") return [{ key: "usage", label: "Usage" }, { key: "activity", label: "Bills" }];
  if (type === "toll") return [{ key: "trips", label: "Trips" }, { key: "activity", label: "Activity" }];
  if (type === "insurance") return [{ key: "premiums", label: "Premiums" }, { key: "activity", label: "Activity" }];
  return [{ key: "activity", label: "Activity" }];
}

function BalanceCard({ account, summary }: { account: AppState["accounts"][number]; summary: AccountSummary }) {
  const t = account.type;
  const balance = balanceFor(account, summary);
  const limit = summary.credit_limit ?? 0;
  const utilization = limit > 0 ? (balance / limit) * 100 : 0;
  const sev = utilization < 30 ? "ok" : utilization < 75 ? "warn" : "high";
  const utilColor = sev === "ok" ? "var(--positive)" : sev === "warn" ? "var(--warning)" : "var(--negative)";

  // Liability accounts (credit_card, loan) display balance as red (debt).
  const isLiability = ["credit_card", "loan", "mortgage"].includes(t);
  const isAsset = ["checking", "savings", "brokerage", "ira", "roth_ira", "401k", "403b", "sep_ira", "hsa"].includes(t);

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 16, boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <div className="num-display" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: isLiability ? "var(--negative)" : isAsset ? "var(--positive)" : "var(--text)" }}>
            {fmtMoney(balance, { decimals: 2, abs: true })}
          </div>
          {limit > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>of ${limit.toLocaleString()} limit</div>
          )}
        </div>

        {/* Credit card utilization */}
        {t === "credit_card" && limit > 0 && (
          <>
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: "var(--bg-mute)", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, utilization)}%`, height: "100%", background: utilColor }} />
            </div>
            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
              <span>{utilization.toFixed(0)}% utilized</span>
              {summary.available_credit != null && (
                <span>${summary.available_credit.toLocaleString()} available</span>
              )}
            </div>
          </>
        )}

        {/* Payment due (credit cards + utilities) */}
        {summary.payment_due_date && (summary.min_payment_due ?? 0) > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--line)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--text-3)" }}>Min payment due</span>
            <span>
              <span className="num" style={{ fontWeight: 600 }}>${(summary.min_payment_due ?? 0).toLocaleString()}</span>
              <span style={{ color: "var(--text-3)", marginLeft: 6 }}>by {summary.payment_due_date}</span>
            </span>
          </div>
        )}

        {/* Retirement contributions YTD */}
        {summary.retirement && (summary.retirement.ytd_contributions_total != null || summary.retirement.ytd_contributions_employee != null) && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--line)" }}>
            <ContribProgress retirement={summary.retirement} />
          </div>
        )}

        {/* Loan principal + interest YTD */}
        {summary.loan && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--line)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11.5 }}>
            {summary.loan.interest_rate != null && (
              <Stat label="Rate" value={`${summary.loan.interest_rate}% ${summary.loan.rate_type ?? ""}`} />
            )}
            {summary.loan.next_payment_date && (
              <Stat label="Next payment" value={summary.loan.next_payment_date} />
            )}
            {summary.loan.interest_paid_ytd != null && (
              <Stat label="Interest YTD" value={fmtMoney(summary.loan.interest_paid_ytd, { decimals: 0, abs: true })} />
            )}
            {summary.loan.principal_paid_ytd != null && (
              <Stat label="Principal YTD" value={fmtMoney(summary.loan.principal_paid_ytd, { decimals: 0, abs: true })} />
            )}
          </div>
        )}

        {/* Utility amount due / due date */}
        {summary.utility && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--line)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--text-3)" }}>Due</span>
            <span>
              <span className="num" style={{ fontWeight: 600 }}>{fmtMoney(summary.utility.amount_due ?? 0, { decimals: 2, abs: true })}</span>
              {summary.utility.due_date && <span style={{ color: "var(--text-3)", marginLeft: 6 }}>by {summary.utility.due_date}</span>}
            </span>
          </div>
        )}

        {/* Toll balance + auto-replenish */}
        {summary.toll && summary.toll.auto_replenish_amount != null && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--line)", fontSize: 11.5, color: "var(--text-3)" }}>
            Auto-replenish ${summary.toll.auto_replenish_amount} when balance ≤ ${summary.toll.auto_replenish_threshold ?? "?"}
          </div>
        )}

        {/* Insurance next premium */}
        {summary.insurance && summary.insurance.next_premium_date && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--line)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--text-3)" }}>Next premium</span>
            <span>
              <span className="num" style={{ fontWeight: 600 }}>{fmtMoney(summary.insurance.next_premium_due ?? 0, { decimals: 2, abs: true })}</span>
              <span style={{ color: "var(--text-3)", marginLeft: 6 }}>by {summary.insurance.next_premium_date}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function balanceFor(account: AppState["accounts"][number], summary: AccountSummary): number {
  if (summary.retirement?.balance != null) return summary.retirement.balance;
  if (summary.brokerage?.portfolio_value != null) return summary.brokerage.portfolio_value;
  if (summary.loan?.principal_balance != null) return summary.loan.principal_balance;
  if (summary.utility?.amount_due != null) return summary.utility.amount_due;
  if (summary.toll?.balance != null) return summary.toll.balance;
  if (summary.insurance?.cash_value != null) return summary.insurance.cash_value;
  return summary.balance ?? 0;
}

function ContribProgress({ retirement }: { retirement: NonNullable<AccountSummary["retirement"]> }) {
  const ytd = retirement.ytd_contributions_total ?? retirement.ytd_contributions_employee ?? 0;
  const cap = retirement.annual_contribution_limit ?? 0;
  if (cap <= 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>
        YTD contributions: <span className="num" style={{ color: "var(--text)", fontWeight: 600 }}>{fmtMoney(ytd, { decimals: 0, abs: true })}</span>
      </div>
    );
  }
  const pct = Math.min(100, (ytd / cap) * 100);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
        <span>Contributions YTD</span>
        <span className="num">
          <span style={{ fontWeight: 600, color: "var(--text)" }}>{fmtMoney(ytd, { decimals: 0, abs: true })}</span>
          <span> / {fmtMoney(cap, { decimals: 0, abs: true })} ({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div style={{ marginTop: 4, height: 5, borderRadius: 3, background: "var(--bg-mute)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</div>
      <div className="num" style={{ marginTop: 2, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function RewardsBody({ color, rewards, subs }: { color: string; rewards: import("../../shared/lib/api").CategoryReward[]; subs: Subscription[] }) {
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      {rewards.length === 0 && (
        <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>No category rewards on file.</div>
      )}
      {rewards.map((r, i) => {
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
              <div>{r.best_rate}{r.best_unit}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 500 }}>{r.effective_cents_per_dollar}c per $</div>
            </div>
          </div>
        );
      })}
      {subs.length > 0 && (
        <div style={{ padding: "12px 14px", borderTop: "0.5px solid var(--line)", fontSize: 12, color: "var(--text-3)" }}>
          Pays for {subs.length} subscription{subs.length === 1 ? "" : "s"}: {subs.map((s) => s.merchant_canonical || "unknown").join(", ")}
        </div>
      )}
    </div>
  );
}

function PerksBody({ perks, onSelectPerk }: { perks: Perk[]; onSelectPerk?: (p: Perk) => void }) {
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      {perks.length === 0 && (
        <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>No perks researched yet.</div>
      )}
      {perks.map((p, i) => {
        const Icon = getPerkIcon(p);
        const tint = getPerkTint(p);
        return (
          <button
            key={p.name}
            onClick={() => onSelectPerk?.(p)}
            style={{ width: "100%", padding: "10px 14px", borderTop: i ? "0.5px solid var(--line)" : "none", background: "transparent", border: "none", textAlign: "left", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
          >
            <span style={{ width: 26, height: 26, borderRadius: 7, background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={14} strokeWidth={2} />
            </span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500 }}>{p.name}</div>
            {p.annual && (
              <span style={{ fontSize: 9, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 5px", borderRadius: 4, fontWeight: 600, textTransform: "uppercase" }}>annual</span>
            )}
            <span style={{ color: "var(--text-3)", fontSize: 11 }}>›</span>
          </button>
        );
      })}
    </div>
  );
}

function HoldingsBody({ summary, accountId, onSelect }: { summary: AccountSummary; accountId: string; onSelect?: (h: Holding) => void }) {
  const block = summary.retirement || summary.brokerage;
  const holdings = block?.holdings || [];
  if (holdings.length === 0) {
    return <Empty>No holdings on file.</Empty>;
  }
  const total = holdings.reduce((s, h) => s + (h.value || 0), 0);
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      {holdings.map((h, i) => {
        const pct = h.allocation_pct ?? (total > 0 ? ((h.value || 0) / total) * 100 : 0);
        return (
          <button
            key={(h.symbol || h.name) + i}
            onClick={() => onSelect?.(h)}
            style={{ width: "100%", padding: "11px 14px", borderTop: i ? "0.5px solid var(--line)" : "none", background: "transparent", border: "none", textAlign: "left", color: "inherit", cursor: onSelect ? "pointer" : "default", display: "flex", alignItems: "center", gap: 10 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {h.symbol && <span style={{ fontWeight: 700, marginRight: 6, color: "var(--accent)" }}>{h.symbol}</span>}
                <span>{h.name}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                {h.shares != null && `${h.shares.toLocaleString()} shares`}
                {h.price != null && ` · $${h.price.toLocaleString()}/sh`}
              </div>
            </div>
            <div className="num" style={{ fontSize: 13, fontWeight: 600, textAlign: "right", flexShrink: 0 }}>
              <div>{fmtMoney(h.value, { decimals: 0, abs: true })}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 500 }}>{pct.toFixed(0)}%</div>
            </div>
            {onSelect && <span style={{ color: "var(--text-3)", fontSize: 11, marginLeft: 4 }}>›</span>}
          </button>
        );
      })}
    </div>
  );
}

function ContributionsBody({ summary }: { summary: AccountSummary }) {
  const r = summary.retirement;
  if (!r) return <Empty>No retirement data.</Empty>;
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "var(--shadow-sm)" }}>
      <ContribProgress retirement={r} />
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11.5 }}>
        <Stat label="Employee YTD" value={fmtMoney(r.ytd_contributions_employee ?? 0, { decimals: 0, abs: true })} />
        <Stat label="Employer YTD" value={fmtMoney(r.ytd_contributions_employer ?? 0, { decimals: 0, abs: true })} />
        {r.vested_balance != null && r.balance != null && (
          <Stat label="Vested" value={fmtMoney(r.vested_balance, { decimals: 0, abs: true })} />
        )}
        {r.vesting_schedule && <Stat label="Vesting" value={r.vesting_schedule} />}
        {r.plan_sponsor && <Stat label="Plan sponsor" value={r.plan_sponsor} />}
        {r.plan_id && <Stat label="Plan ID" value={r.plan_id} />}
      </div>
    </div>
  );
}

function PerformanceBody({ summary }: { summary: AccountSummary }) {
  const b = summary.brokerage;
  if (!b) return <Empty>No brokerage data.</Empty>;
  const gain = b.unrealized_gain ?? 0;
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "var(--shadow-sm)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11.5 }}>
      {b.cost_basis != null && <Stat label="Cost basis" value={fmtMoney(b.cost_basis, { decimals: 0, abs: true })} />}
      <Stat label="Unrealized" value={(gain >= 0 ? "+" : "") + fmtMoney(gain, { decimals: 0, abs: false })} />
      {b.cash_balance != null && <Stat label="Cash" value={fmtMoney(b.cash_balance, { decimals: 0, abs: true })} />}
      {b.dividends_period != null && <Stat label="Dividends (period)" value={fmtMoney(b.dividends_period, { decimals: 2, abs: true })} />}
      {b.dividends_ytd != null && <Stat label="Dividends YTD" value={fmtMoney(b.dividends_ytd, { decimals: 2, abs: true })} />}
      {b.fees_period != null && <Stat label="Fees (period)" value={fmtMoney(b.fees_period, { decimals: 2, abs: true })} />}
    </div>
  );
}

function AmortizationBody({ summary }: { summary: AccountSummary }) {
  const l = summary.loan;
  if (!l) return <Empty>No loan data.</Empty>;
  const principal = l.principal_balance ?? 0;
  const original = l.original_principal ?? 0;
  const paidOff = original > 0 ? Math.max(0, original - principal) : 0;
  const pct = original > 0 ? (paidOff / original) * 100 : 0;
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "var(--shadow-sm)" }}>
      {original > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
            <span>Paid off</span>
            <span className="num">{pct.toFixed(0)}% of {fmtMoney(original, { decimals: 0, abs: true })}</span>
          </div>
          <div style={{ marginTop: 4, height: 6, borderRadius: 3, background: "var(--bg-mute)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
          </div>
        </>
      )}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11.5 }}>
        {l.monthly_payment != null && <Stat label="Monthly payment" value={fmtMoney(l.monthly_payment, { decimals: 2, abs: true })} />}
        {l.escrow_balance != null && <Stat label="Escrow" value={fmtMoney(l.escrow_balance, { decimals: 0, abs: true })} />}
        {l.principal_paid_period != null && <Stat label="Principal (period)" value={fmtMoney(l.principal_paid_period, { decimals: 2, abs: true })} />}
        {l.interest_paid_period != null && <Stat label="Interest (period)" value={fmtMoney(l.interest_paid_period, { decimals: 2, abs: true })} />}
        {l.payoff_date && <Stat label="Payoff" value={l.payoff_date} />}
        {l.remaining_term_months != null && <Stat label="Remaining" value={`${l.remaining_term_months} months`} />}
      </div>
    </div>
  );
}

function UsageBody({ summary }: { summary: AccountSummary }) {
  const u = summary.utility;
  if (!u || !u.usage) return <Empty>No usage data.</Empty>;
  const usage = u.usage;
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>
        {u.service_type} · {u.service_address || "Address not on file"}
        {usage.rate_plan && ` · Rate plan ${usage.rate_plan}`}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11.5 }}>
        {usage.electric_kwh != null && (
          <Stat label="Electric" value={`${usage.electric_kwh.toLocaleString()} kWh`} />
        )}
        {usage.electric_cost != null && (
          <Stat label="Electric cost" value={fmtMoney(usage.electric_cost, { decimals: 2, abs: true })} />
        )}
        {usage.gas_therms != null && (
          <Stat label="Gas" value={`${usage.gas_therms} therms`} />
        )}
        {usage.gas_cost != null && (
          <Stat label="Gas cost" value={fmtMoney(usage.gas_cost, { decimals: 2, abs: true })} />
        )}
        {usage.average_daily_kwh != null && (
          <Stat label="Avg kWh/day" value={`${usage.average_daily_kwh}`} />
        )}
        {usage.vs_prior_period_pct != null && (
          <Stat label="vs prior" value={`${usage.vs_prior_period_pct >= 0 ? "+" : ""}${usage.vs_prior_period_pct}%`} />
        )}
      </div>
    </div>
  );
}

function TripsBody({ summary }: { summary: AccountSummary }) {
  const t = summary.toll;
  if (!t) return <Empty>No toll data.</Empty>;
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "var(--shadow-sm)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11.5 }}>
      {t.trips_period != null && <Stat label="Trips (period)" value={`${t.trips_period}`} />}
      {t.tolls_period != null && <Stat label="Tolls" value={fmtMoney(t.tolls_period, { decimals: 2, abs: true })} />}
      {t.fees_period != null && <Stat label="Fees" value={fmtMoney(t.fees_period, { decimals: 2, abs: true })} />}
      {t.tag_count != null && <Stat label="Tags" value={`${t.tag_count}`} />}
      {t.violations_count != null && <Stat label="Violations" value={`${t.violations_count}`} />}
      {t.violations_amount != null && t.violations_amount > 0 && (
        <Stat label="Violation $" value={fmtMoney(t.violations_amount, { decimals: 2, abs: true })} />
      )}
    </div>
  );
}

function PremiumsBody({ summary }: { summary: AccountSummary }) {
  const i = summary.insurance;
  if (!i) return <Empty>No insurance data.</Empty>;
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "var(--shadow-sm)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11.5 }}>
      <Stat label="Type" value={i.policy_type} />
      {i.policy_number && <Stat label="Policy" value={i.policy_number} />}
      {i.death_benefit != null && <Stat label="Benefit" value={fmtMoney(i.death_benefit, { decimals: 0, abs: true })} />}
      {i.cash_value != null && <Stat label="Cash value" value={fmtMoney(i.cash_value, { decimals: 0, abs: true })} />}
      {i.premium_paid_ytd != null && <Stat label="Premium YTD" value={fmtMoney(i.premium_paid_ytd, { decimals: 2, abs: true })} />}
      {i.premium_paid_period != null && <Stat label="Premium (period)" value={fmtMoney(i.premium_paid_period, { decimals: 2, abs: true })} />}
    </div>
  );
}

function ActivityBody({ txns, onSelectTxn }: { txns: Transaction[]; onSelectTxn?: (t: Transaction) => void }) {
  if (txns.length === 0) return <Empty>No transactions in current filter.</Empty>;
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      {txns.map((t, i) => (
        <button
          key={t.id}
          onClick={() => onSelectTxn?.(t)}
          style={{ width: "100%", padding: "11px 14px", borderTop: i ? "0.5px solid var(--line)" : "none", background: "transparent", border: "none", textAlign: "left", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
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
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)", background: "var(--bg-elev)", borderRadius: "var(--r-lg)", textAlign: "center" }}>
      {children}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, padding: "0 4px" }}>
      {children}
    </div>
  );
}

function Tag({ label, color, outlined }: { label: string; color: string; outlined?: boolean }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: outlined ? color : "var(--text-2)", background: outlined ? "transparent" : "var(--bg-mute)", border: outlined ? `1px solid ${color}` : "none", padding: "1px 6px", borderRadius: 4 }}>
      {label}
    </span>
  );
}

function AccountEditForm({
  account,
  onSaved,
  onCancel,
}: {
  account: AppState["accounts"][number];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [nickname, setNickname] = useState(account.nickname || "");
  const [loginUrl, setLoginUrl] = useState(account.login_url || "");
  const [notes, setNotes] = useState(account.notes || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.updateAccount(account.id, { nickname, login_url: loginUrl, notes });
      onSaved();
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "8px 16px 6px" }}>
      <div style={{ background: "var(--bg-elev)", borderRadius: 12, padding: 14, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Nickname">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={account.nickname}
            style={inputStyle}
          />
        </Field>
        <Field label="Login URL">
          <input
            value={loginUrl}
            onChange={(e) => setLoginUrl(e.target.value)}
            placeholder="https://..."
            style={inputStyle}
            type="url"
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this account"
            rows={3}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4, fontFamily: "inherit" }}
          />
        </Field>
        {err && <div style={{ color: "var(--negative)", fontSize: 11.5 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              flex: 1,
              padding: "9px 0",
              background: "var(--bg-mute)",
              color: "var(--text-2)",
              borderRadius: 10,
              border: "none",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 2,
              padding: "9px 0",
              background: "var(--text)",
              color: "var(--bg)",
              borderRadius: 10,
              border: "none",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "0.5px solid var(--line)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      {children}
    </label>
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

function prettyType(t: string): string {
  return {
    credit_card: "Credit card",
    checking: "Checking",
    savings: "Savings",
    brokerage: "Brokerage",
    ira: "Traditional IRA",
    roth_ira: "Roth IRA",
    "401k": "401(k)",
    "403b": "403(b)",
    sep_ira: "SEP-IRA",
    hsa: "HSA",
    loan: "Loan",
    mortgage: "Mortgage",
    utility: "Utility",
    toll: "Toll",
    insurance: "Insurance",
  }[t] ?? t;
}

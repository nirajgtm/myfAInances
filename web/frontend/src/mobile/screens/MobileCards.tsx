// Cards tab — full-screen view of all accounts grouped by type, with statement coverage,
// card-level benefits, and recommendations. Replaces Alerts in the bottom nav.

import { useEffect, useMemo, useState } from "react";
import { AppState, Benefits, Recommendations, Perk, AccountSummary, Transaction, Subscription, api } from "../../shared/lib/api";
import { cardColor, cardSoft, cardShortName, fmtMonthShort } from "../../shared/lib/format";
import { CardPill } from "../../shared/primitives/CardPill";
import { getPerkIcon, getPerkTint } from "../../shared/lib/perkIcon";
import { CreditUtilizationSummary } from "../components/CreditUtilizationSummary";
import { CreditCardRow } from "../components/CreditCardRow";
import { CardDetailSheet } from "../components/CardDetailSheet";
import { BestForView } from "../components/BestForView";

interface Props {
  state: AppState;
  benefits: Benefits | null;
  recommendations: Recommendations | null;
  statementCoverage: Record<string, string[]>; // account_id -> sorted period strings (YYYY-MM)
  transactions: Transaction[]; // currently filtered txns (used for detail sheet's Activity tab)
  onSelectTxn?: (t: Transaction) => void;
  onSelectAccount?: (id: string) => void;
}

const DORMANT_DAYS = 90;

const TYPE_LABEL: Record<string, string> = {
  credit_card: "Credit cards",
  checking: "Checking",
  savings: "Savings",
  brokerage: "Brokerage",
  ira: "IRA",
  roth_ira: "Roth IRA",
  "401k": "401(k)",
  "403b": "403(b)",
  sep_ira: "SEP-IRA",
  hsa: "HSA",
  loan: "Loans",
  mortgage: "Mortgage",
  utility: "Utilities",
  toll: "Tolls",
  insurance: "Insurance",
};

const TYPE_ORDER = [
  "credit_card", "checking", "savings",
  "brokerage", "ira", "roth_ira", "401k", "403b", "sep_ira", "hsa",
  "loan", "mortgage",
  "utility", "toll", "insurance",
];

type SubTab = "cards" | "perks";

export function MobileCards({ state, benefits, recommendations, statementCoverage, transactions, onSelectTxn, onSelectAccount }: Props) {
  const [activePerk, setActivePerk] = useState<Perk | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<AccountSummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subTab, setSubTab] = useState<SubTab>("cards");

  useEffect(() => {
    let cancelled = false;
    api.accountSummaries().then((s) => { if (!cancelled) setSummaries(s); }).catch(() => {});
    api.subscriptions().then((s) => { if (!cancelled) setSubscriptions(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [state.counts.transactions, state.counts.statements]);

  const summariesById = useMemo(() => {
    const out: Record<string, AccountSummary> = {};
    for (const s of summaries) out[s.account_id] = s;
    return out;
  }, [summaries]);

  const grouped = useMemo(() => {
    const out: Record<string, AppState["accounts"]> = {};
    for (const a of state.accounts) {
      const key = a.type || "other";
      (out[key] = out[key] || []).push(a);
    }
    return out;
  }, [state.accounts]);

  const orderedTypes = TYPE_ORDER.filter((t) => grouped[t]).concat(
    Object.keys(grouped).filter((t) => !TYPE_ORDER.includes(t))
  );

  // Sort credit cards by 12-mo activity (most-used first); compute primary + dormant.
  const creditCards = useMemo(() => {
    const cards = grouped.credit_card || [];
    return [...cards].sort((a, b) => {
      const ca = summariesById[a.id]?.txn_count_12mo ?? 0;
      const cb = summariesById[b.id]?.txn_count_12mo ?? 0;
      return cb - ca;
    });
  }, [grouped.credit_card, summariesById]);

  const primaryCardId = creditCards[0]?.id ?? null;
  const isDormant = (id: string): boolean => {
    const s = summariesById[id];
    if (!s || !s.last_activity) return true;
    const days = Math.floor((Date.now() - new Date(s.last_activity).getTime()) / 86400000);
    return days >= DORMANT_DAYS;
  };

  const activeCard = activeCardId ? state.accounts.find((a) => a.id === activeCardId) ?? null : null;
  const activeSummary = activeCardId ? summariesById[activeCardId] ?? null : null;

  return (
    <div className="app-root" style={{ height: "100%", background: "var(--bg)", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px 6px" }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Cards</div>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>
          {state.accounts.length} accounts
          {benefits && benefits.annual_fees_total > 0 && ` · $${benefits.annual_fees_total}/yr fees`}
        </div>
        <SubTabs active={subTab} onChange={setSubTab} perksCount={(benefits?.perks.length ?? 0) + (benefits?.category_rewards.length ?? 0)} />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px 100px" }}>
        {subTab === "cards" && orderedTypes.map((type) => {
          if (type === "credit_card") {
            return (
              <div key={type} style={{ marginTop: 14 }}>
                <SectionLabel text="Credit" count={creditCards.length} right="Sort: most used" />
                <CreditUtilizationSummary cards={creditCards} summaries={summariesById} />
                <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
                  {creditCards.map((a, i) => {
                    const summary = summariesById[a.id];
                    if (!summary) {
                      return (
                        <div key={a.id} style={{ padding: 14, fontSize: 12, color: "var(--text-3)", borderTop: i ? "0.5px solid var(--line)" : "none" }}>
                          {a.nickname} — loading…
                        </div>
                      );
                    }
                    return (
                      <CreditCardRow
                        key={a.id}
                        account={a}
                        summary={summary}
                        isPrimary={a.id === primaryCardId && summary.txn_count_12mo > 0}
                        isDormant={isDormant(a.id) && a.id !== primaryCardId}
                        isFirst={i === 0}
                        onClick={() => onSelectAccount?.(a.id)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          }
          return (
            <div key={type} style={{ marginTop: 14 }}>
              <SectionLabel text={TYPE_LABEL[type] || type} count={grouped[type].length} />
              <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
                {grouped[type].map((a, i) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    coverage={statementCoverage[a.id] || []}
                    isFirst={i === 0}
                    onClick={onSelectAccount ? () => onSelectAccount(a.id) : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Best earnings — grouped, expandable per category */}
        {subTab === "perks" && benefits && benefits.cards.length > 0 && (
          <>
            <BestForView
              rewards={benefits.category_rewards}
              accounts={state.accounts}
              onSelectCard={(cardId) => setActiveCardId(cardId)}
            />

            {benefits.perks.length > 0 && (
              <>
                <SectionLabel text="Perks (deduped)" count={benefits.perks.length} />
                <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
                  {benefits.perks.map((p, i) => (
                    <PerkRow key={p.name} perk={p} isFirst={i === 0} onClick={() => setActivePerk(p)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {subTab === "perks" && recommendations && !recommendations.single_card_mode && recommendations.items.length > 0 && (
          <>
            <SectionLabel text={`Optimization opportunities - $${recommendations.total_missed_dollars.toFixed(2)} missed`} />
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {recommendations.items.slice(0, 8).map((r, i) => (
                <div key={r.txn_id} style={{ padding: "10px 14px 12px", borderTop: i ? "0.5px solid var(--line)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.merchant ?? "?"}</div>
                    <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
                      +${r.missed_dollars.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <CardPill id={r.used_card_id} name={r.used_card_nickname} />
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M3 5.5h5m-2-2 2 2-2 2" />
                    </svg>
                    <CardPill id={r.better_card_id} name={r.better_card_nickname} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Perk detail bottom sheet */}
      <PerkDetailSheet perk={activePerk} onClose={() => setActivePerk(null)} />

      <CardDetailSheet
        account={activeCard}
        summary={activeSummary}
        benefits={benefits}
        transactions={transactions}
        subscriptions={subscriptions}
        isPrimary={!!activeCard && activeCard.id === primaryCardId}
        isDormant={!!activeCard && isDormant(activeCard.id) && activeCard.id !== primaryCardId}
        onClose={() => setActiveCardId(null)}
        onSelectTxn={(t) => {
          setActiveCardId(null);
          onSelectTxn?.(t);
        }}
        onSelectPerk={(p) => setActivePerk(p)}
      />
    </div>
  );
}

function SectionLabel({ text, count, right }: { text: string; count?: number; right?: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--text-3)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        margin: "20px 4px 8px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <span>
        {text}
        {count != null && <span style={{ color: "var(--text-4)", marginLeft: 6 }}>· {count}</span>}
      </span>
      {right && <span style={{ color: "var(--text-4)", textTransform: "none", letterSpacing: "0", fontWeight: 500, fontSize: 11 }}>{right}</span>}
    </div>
  );
}

function AccountRow({
  account,
  coverage,
  isFirst,
  onClick,
}: {
  account: AppState["accounts"][number];
  coverage: string[];
  isFirst: boolean;
  onClick?: () => void;
}) {
  // Compute missing months: gaps between earliest and latest period.
  const missing = computeMissingMonths(coverage);
  const Wrapper: any = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      style={{
        width: "100%",
        padding: "12px 14px",
        borderTop: isFirst ? "none" : "0.5px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "transparent",
        border: "none",
        textAlign: "left",
        color: "inherit",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: cardSoft(account.id),
              color: cardColor(account.id),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {cardShortName(account.nickname).slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>
              {account.nickname}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
              {account.last4 ? "•••• " + account.last4 : "no last 4"}
              {account.credit_limit ? ` - $${account.credit_limit.toLocaleString()} limit` : ""}
            </div>
          </div>
        </div>
      </div>
      {/* Coverage strip */}
      <CoverageStrip coverage={coverage} missing={missing} />
    </Wrapper>
  );
}

function CoverageStrip({ coverage, missing }: { coverage: string[]; missing: string[] }) {
  if (!coverage.length) {
    return (
      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>No statements yet</div>
    );
  }
  // Build a continuous range from earliest to latest covered period.
  const all = continuousRange(coverage[0], coverage[coverage.length - 1]);
  const haveSet = new Set(coverage);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
      {all.map((p) => {
        const have = haveSet.has(p);
        return (
          <div
            key={p}
            title={p}
            style={{
              fontSize: 9,
              padding: "2px 5px",
              borderRadius: 4,
              background: have ? "var(--c-services-soft)" : "rgba(192,138,26,0.15)",
              color: have ? "var(--c-services)" : "var(--warning)",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {fmtMonthShort(p)} {p.slice(2, 4)}
          </div>
        );
      })}
      {missing.length > 0 && (
        <span style={{ fontSize: 10, color: "var(--warning)", fontWeight: 600, marginLeft: 4 }}>
          {missing.length} missing
        </span>
      )}
    </div>
  );
}

function continuousRange(start: string, end: string): string[] {
  if (start === end) return [start];
  const [sy, sm] = start.split("-").map((s) => parseInt(s, 10));
  const [ey, em] = end.split("-").map((s) => parseInt(s, 10));
  const out: string[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function computeMissingMonths(coverage: string[]): string[] {
  if (coverage.length < 2) return [];
  const all = continuousRange(coverage[0], coverage[coverage.length - 1]);
  const have = new Set(coverage);
  return all.filter((p) => !have.has(p));
}

function PerkRow({ perk, isFirst, onClick }: { perk: Perk; isFirst: boolean; onClick?: () => void }) {
  const hasDetail = !!(perk.description || perk.how_to_use_url);
  const Icon = getPerkIcon(perk);
  const tint = getPerkTint(perk);
  return (
    <button
      onClick={onClick}
      disabled={!hasDetail && !onClick}
      style={{
        width: "100%",
        padding: "9px 14px 11px",
        borderTop: isFirst ? "none" : "0.5px solid var(--line)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: "transparent",
        border: "none",
        textAlign: "left",
        color: "inherit",
        cursor: hasDetail ? "pointer" : "default",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: `color-mix(in srgb, ${tint} 14%, transparent)`,
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
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
          {perk.name}
          {hasDetail && <span style={{ color: "var(--text-3)", fontSize: 11 }}>›</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {perk.providers.map((p) => (
            <CardPill key={p.id} id={p.id} name={p.nickname} />
          ))}
        </div>
      </div>
      {perk.annual && (
        <span
          style={{
            fontSize: 9.5,
            color: "var(--accent)",
            background: "var(--accent-soft)",
            padding: "2px 6px",
            borderRadius: 4,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          annual
        </span>
      )}
    </button>
  );
}

function PerkDetailSheet({ perk, onClose }: { perk: Perk | null; onClose: () => void }) {
  if (!perk) return null;
  const Icon = getPerkIcon(perk);
  const tint = getPerkTint(perk);
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 70, animation: "fadeIn 0.2s ease" }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--bg-elev)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "70vh",
          overflowY: "auto",
          zIndex: 80,
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          animation: "slideUp 0.25s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--bg-mute)" }} />
        </div>
        <div style={{ padding: "16px 22px 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 11,
                background: `color-mix(in srgb, ${tint} 14%, transparent)`,
                color: tint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={20} strokeWidth={2} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>{perk.name}</div>
                {perk.annual && (
                  <span style={{ fontSize: 9.5, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 6px", borderRadius: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    annual
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                {perk.group ? perk.group.charAt(0).toUpperCase() + perk.group.slice(1) : "Benefit"}
              </div>
            </div>
          </div>

          {perk.description && (
            <div style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 16 }}>
              {perk.description}
            </div>
          )}

          {!perk.description && (
            <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.4, marginBottom: 16, fontStyle: "italic" }}>
              Detail still being researched. Try refreshing in a moment.
            </div>
          )}

          <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8 }}>
            Provided by
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {perk.providers.map((p) => (
              <CardPill key={p.id} id={p.id} name={p.nickname} size="sm" />
            ))}
          </div>

          {perk.how_to_use_url && (
            <a
              href={perk.how_to_use_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                width: "100%",
                padding: "12px 14px",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 12,
                textAlign: "center",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              How to use →
            </a>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  );
}

function SubTabs({ active, onChange, perksCount }: { active: SubTab; onChange: (t: SubTab) => void; perksCount: number }) {
  const tabs: { id: SubTab; label: string }[] = [
    { id: "cards", label: "Cards" },
    { id: "perks", label: "Card Perks" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        marginTop: 14,
        borderBottom: "0.5px solid var(--line)",
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: "8px 0",
              background: "transparent",
              border: "none",
              borderBottom: isActive ? "2px solid var(--text)" : "2px solid transparent",
              color: isActive ? "var(--text)" : "var(--text-3)",
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
              letterSpacing: "-0.01em",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t.label}
            {t.id === "perks" && perksCount > 0 && (
              <span style={{ marginLeft: 5, color: "var(--text-4)", fontWeight: 500 }}>{perksCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

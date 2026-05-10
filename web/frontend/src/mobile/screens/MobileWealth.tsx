// Wealth tab — net worth, asset allocation, retirement progress, holdings,
// loans, insurance. Pulls everything from /api/account-summaries which now
// surfaces type-specific blocks (brokerage / retirement / loan / utility /
// toll / insurance) for every account from its latest statement.

import { useEffect, useMemo, useState } from "react";
import { AppState, AccountSummary, Holding, TaxFormRecord, api } from "../../shared/lib/api";
import { fmtMoney, cardColor, cardSoft } from "../../shared/lib/format";
import { TaxesSection } from "../components/TaxesSection";

interface Props {
  state: AppState;
  summaries: AccountSummary[];
  onSelectAccount?: (id: string) => void;
}

export function MobileWealth({ state, summaries, onSelectAccount }: Props) {
  const [expanded, setExpanded] = useState<"assets" | "liabilities" | null>(null);
  const [activeHolding, setActiveHolding] = useState<ConsolidatedHolding | null>(null);
  const [taxForms, setTaxForms] = useState<TaxFormRecord[]>([]);

  useEffect(() => {
    api.taxForms().then(setTaxForms).catch(() => {});
  }, []);
  const accountById = useMemo(
    () => new Map(state.accounts.map((a) => [a.id, a])),
    [state.accounts]
  );
  const summaryById = useMemo(() => {
    const m = new Map<string, AccountSummary>();
    for (const s of summaries) m.set(s.account_id, s);
    return m;
  }, [summaries]);

  // Bucket accounts by what's relevant for wealth view.
  const ASSET_TYPES = new Set(["checking", "savings", "brokerage", "ira", "roth_ira", "401k", "403b", "sep_ira", "hsa"]);
  const LIABILITY_TYPES = new Set(["credit_card", "loan", "mortgage"]);

  const assetAccounts = state.accounts.filter((a) => ASSET_TYPES.has(a.type));
  const liabilityAccounts = state.accounts.filter((a) => LIABILITY_TYPES.has(a.type));

  // Per-account contribution rows so users can see what makes up each total.
  const assetBreakdown: { account: AppState["accounts"][number]; value: number }[] = [];
  for (const a of assetAccounts) {
    const s = summaryById.get(a.id);
    if (!s) continue;
    const v = s.retirement?.balance ?? s.brokerage?.portfolio_value ?? s.balance ?? 0;
    if (typeof v === "number" && v > 0) assetBreakdown.push({ account: a, value: v });
  }
  assetBreakdown.sort((a, b) => b.value - a.value);
  const assetTotal = assetBreakdown.reduce((acc, x) => acc + x.value, 0);

  const liabilityBreakdown: { account: AppState["accounts"][number]; value: number }[] = [];
  for (const a of liabilityAccounts) {
    const s = summaryById.get(a.id);
    if (!s) continue;
    const v = a.type === "credit_card" ? (s.balance ?? 0) : (s.loan?.principal_balance ?? s.balance ?? 0);
    if (typeof v === "number" && v > 0) liabilityBreakdown.push({ account: a, value: v });
  }
  liabilityBreakdown.sort((a, b) => b.value - a.value);
  const liabilityTotal = liabilityBreakdown.reduce((acc, x) => acc + x.value, 0);
  const netWorth = assetTotal - liabilityTotal;

  // Retirement accounts surface their own card.
  const retirementAccounts = state.accounts.filter((a) =>
    ["ira", "roth_ira", "401k", "403b", "sep_ira", "hsa"].includes(a.type)
  );

  // Cash + brokerage + retirement holdings consolidated for top-holdings list.
  const allHoldings = consolidateHoldings(summaries);

  // Asset allocation: bucket by class.
  const allocation = computeAllocation(state.accounts, summaries);

  const loanAccounts = state.accounts.filter((a) => ["loan", "mortgage"].includes(a.type));
  const insuranceAccounts = state.accounts.filter((a) => a.type === "insurance");

  return (
    <div className="app-root" style={{ height: "100%", background: "var(--bg)", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px 6px" }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Wealth</div>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>
          {assetAccounts.length} assets · {liabilityAccounts.length} liabilities
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px 100px" }}>
        {/* Net worth hero */}
        <div
          style={{
            background: "var(--bg-elev)",
            borderRadius: "var(--r-xl)",
            padding: 22,
            boxShadow: "var(--shadow-md)",
            marginTop: 8,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Net worth
          </div>
          <div className="num-display" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-0.04em", marginTop: 6, lineHeight: 1, color: netWorth < 0 ? "var(--negative)" : "var(--text)" }}>
            {fmtMoney(netWorth, { decimals: 0, abs: false })}
          </div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <BreakdownTile
              label="Assets"
              value={assetTotal}
              count={assetBreakdown.length}
              color="var(--positive)"
              expanded={expanded === "assets"}
              onClick={() => setExpanded(expanded === "assets" ? null : "assets")}
            />
            <BreakdownTile
              label="Liabilities"
              value={liabilityTotal}
              count={liabilityBreakdown.length}
              color="var(--negative)"
              expanded={expanded === "liabilities"}
              onClick={() => setExpanded(expanded === "liabilities" ? null : "liabilities")}
            />
          </div>
          {expanded && (
            <BreakdownList
              items={expanded === "assets" ? assetBreakdown : liabilityBreakdown}
              total={expanded === "assets" ? assetTotal : liabilityTotal}
              onSelect={onSelectAccount}
            />
          )}
        </div>

        {/* Asset allocation */}
        {allocation.length > 0 && (
          <Section title="Asset allocation">
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "var(--shadow-sm)" }}>
              <StackedBar segments={allocation.map((a) => ({ label: a.label, value: a.value, color: a.color }))} />
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {allocation.map((a) => (
                  <div key={a.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color }} />
                      <span style={{ color: "var(--text-2)" }}>{a.label}</span>
                    </div>
                    <div className="num" style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>{fmtMoney(a.value, { decimals: 0, abs: true })}</span>
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{((a.value / assetTotal) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* Retirement progress */}
        {retirementAccounts.length > 0 && (
          <Section title="Retirement">
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {retirementAccounts.map((a, i) => {
                const s = summaryById.get(a.id);
                if (!s) return null;
                return <RetirementRow key={a.id} account={a} summary={s} isFirst={i === 0} onClick={() => onSelectAccount?.(a.id)} />;
              })}
            </div>
          </Section>
        )}

        {/* Loans */}
        {loanAccounts.length > 0 && (
          <Section title="Loans">
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {loanAccounts.map((a, i) => {
                const s = summaryById.get(a.id);
                if (!s) return null;
                return <LoanRow key={a.id} account={a} summary={s} isFirst={i === 0} onClick={() => onSelectAccount?.(a.id)} />;
              })}
            </div>
          </Section>
        )}

        {/* Insurance */}
        {insuranceAccounts.length > 0 && (
          <Section title="Insurance">
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {insuranceAccounts.map((a, i) => {
                const s = summaryById.get(a.id);
                if (!s) return null;
                return <InsuranceRow key={a.id} account={a} summary={s} isFirst={i === 0} onClick={() => onSelectAccount?.(a.id)} />;
              })}
            </div>
          </Section>
        )}

        {/* Taxes */}
        <TaxesSection forms={taxForms} accounts={state.accounts} onSelectAccount={onSelectAccount} />

        {/* Top holdings */}
        {allHoldings.length > 0 && (
          <Section title="Top holdings" right={`${allHoldings.length} positions`}>
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {allHoldings.slice(0, 12).map((h, i) => (
                <button
                  key={(h.symbol || h.name) + i}
                  onClick={() => setActiveHolding(h)}
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
                      {h.symbol ? <span style={{ fontWeight: 700, marginRight: 6, color: "var(--accent)" }}>{h.symbol}</span> : null}
                      <span>{h.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                      {h.heldByCount > 1 ? `${h.heldByCount} accounts` : accountById.get(h.heldBy[0])?.nickname || ""}
                      {h.shares != null && ` · ${h.shares.toLocaleString()} shares`}
                    </div>
                  </div>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>
                    <div>{fmtMoney(h.value, { decimals: 0, abs: true })}</div>
                    {h.unrealized_gain != null && Math.abs(h.unrealized_gain) > 1 && (
                      <div style={{ fontSize: 11, color: h.unrealized_gain >= 0 ? "var(--positive)" : "var(--negative)", fontWeight: 500 }}>
                        {h.unrealized_gain >= 0 ? "+" : ""}{fmtMoney(h.unrealized_gain, { decimals: 0, abs: false })}
                      </div>
                    )}
                  </div>
                  <span style={{ color: "var(--text-3)", fontSize: 11 }}>›</span>
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>

      <HoldingSheet
        holding={activeHolding}
        accountById={accountById}
        onClose={() => setActiveHolding(null)}
        onSelectAccount={(id) => { setActiveHolding(null); onSelectAccount?.(id); }}
      />
    </div>
  );
}

function HoldingSheet({ holding, accountById, onClose, onSelectAccount }: { holding: ConsolidatedHolding | null; accountById: Map<string, AppState["accounts"][number]>; onClose: () => void; onSelectAccount?: (id: string) => void }) {
  if (!holding) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 80, animation: "fadeIn 0.2s ease" }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--bg-elev)", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "75vh", overflowY: "auto", zIndex: 90, paddingBottom: "max(20px, env(safe-area-inset-bottom))", animation: "slideUp 0.25s ease" }}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--bg-mute)" }} />
        </div>
        <div style={{ padding: "14px 22px 10px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {holding.symbol && <span style={{ color: "var(--accent)", marginRight: 8 }}>{holding.symbol}</span>}
            {holding.name}
          </div>
          <div className="num-display" style={{ fontSize: 26, fontWeight: 600, marginTop: 6 }}>
            {fmtMoney(holding.value, { decimals: 0, abs: true })}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {holding.shares != null && <span>{holding.shares.toLocaleString()} shares</span>}
            {holding.price != null && <span>· ${holding.price.toLocaleString()}/sh</span>}
            {holding.unrealized_gain != null && Math.abs(holding.unrealized_gain) > 1 && (
              <span style={{ color: holding.unrealized_gain >= 0 ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}>
                · {holding.unrealized_gain >= 0 ? "+" : ""}{fmtMoney(holding.unrealized_gain, { decimals: 0, abs: false })} unrealized
              </span>
            )}
          </div>
        </div>
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8, padding: "0 4px" }}>
            Held in {holding.heldByCount} account{holding.heldByCount === 1 ? "" : "s"}
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 12, border: "0.5px solid var(--line)", overflow: "hidden" }}>
            {holding.heldBy.map((aid, i) => {
              const a = accountById.get(aid);
              if (!a) return null;
              return (
                <button
                  key={aid}
                  onClick={() => onSelectAccount?.(aid)}
                  style={{ width: "100%", padding: "11px 14px", borderTop: i ? "0.5px solid var(--line)" : "none", background: "transparent", border: "none", textAlign: "left", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: cardSoft(aid), color: cardColor(aid), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>
                    {avatarLetters(a.nickname)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500 }}>{a.nickname}</div>
                  <span style={{ color: "var(--text-3)", fontSize: 11 }}>›</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: "8px 16px 4px" }}>
          <button onClick={onClose} style={{ width: "100%", padding: "11px 0", background: "var(--text)", color: "var(--bg)", borderRadius: 12, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  );
}

function StackedBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  return (
    <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "var(--bg-mute)" }}>
      {segments.map((s) => (
        <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color, borderRight: "1.5px solid var(--bg-elev)" }} title={s.label} />
      ))}
    </div>
  );
}

function RetirementRow({ account, summary, isFirst, onClick }: { account: AppState["accounts"][number]; summary: AccountSummary; isFirst: boolean; onClick?: () => void }) {
  const r = summary.retirement;
  if (!r) return null;
  const balance = r.balance ?? 0;
  const cap = r.annual_contribution_limit ?? 0;
  const ytd = r.ytd_contributions_total ?? r.ytd_contributions_employee ?? 0;
  const pct = cap > 0 ? Math.min(100, (ytd / cap) * 100) : 0;
  const color = cardColor(account.id);
  const soft = cardSoft(account.id);
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper onClick={onClick} style={{ width: "100%", padding: "14px 14px", borderTop: isFirst ? "none" : "0.5px solid var(--line)", background: "transparent", border: "none", textAlign: "left", color: "inherit", cursor: onClick ? "pointer" : "default", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: soft, color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
          {avatarLetters(account.nickname)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{account.nickname}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            {prettySubtype(r.subtype)}
            {r.plan_sponsor && ` · ${r.plan_sponsor}`}
            {r.vested_balance != null && r.balance != null && r.vested_balance < r.balance && (
              <span style={{ color: "var(--warning)", marginLeft: 6 }}>
                {fmtMoney(r.vested_balance, { decimals: 0, abs: true })} vested
              </span>
            )}
          </div>
        </div>
        <div className="num" style={{ fontSize: 15, fontWeight: 600, textAlign: "right", flexShrink: 0 }}>
          {fmtMoney(balance, { decimals: 0, abs: true })}
        </div>
      </div>

      {cap > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
            <span>YTD contributions</span>
            <span className="num">
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{fmtMoney(ytd, { decimals: 0, abs: true })}</span>
              <span> / {fmtMoney(cap, { decimals: 0, abs: true })} ({pct.toFixed(0)}%)</span>
            </span>
          </div>
          <div style={{ marginTop: 4, height: 5, borderRadius: 3, background: "var(--bg-mute)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: color }} />
          </div>
          {r.ytd_contributions_employer != null && r.ytd_contributions_employer > 0 && (
            <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4 }}>
              Employer YTD: <span className="num" style={{ fontWeight: 500, color: "var(--text-2)" }}>{fmtMoney(r.ytd_contributions_employer, { decimals: 0, abs: true })}</span>
            </div>
          )}
        </div>
      )}
    </Wrapper>
  );
}

function LoanRow({ account, summary, isFirst, onClick }: { account: AppState["accounts"][number]; summary: AccountSummary; isFirst: boolean; onClick?: () => void }) {
  const l = summary.loan;
  if (!l) return null;
  const principal = l.principal_balance ?? 0;
  const original = l.original_principal ?? 0;
  const paidOff = original > 0 ? Math.max(0, original - principal) : 0;
  const pct = original > 0 ? (paidOff / original) * 100 : 0;
  const color = cardColor(account.id);
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper onClick={onClick} style={{ width: "100%", padding: "14px 14px", borderTop: isFirst ? "none" : "0.5px solid var(--line)", background: "transparent", border: "none", textAlign: "left", color: "inherit", cursor: onClick ? "pointer" : "default", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{account.nickname}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            {prettyLoanType(l.loan_type)}
            {l.interest_rate != null && ` · ${l.interest_rate}% ${l.rate_type ?? ""}`}
            {l.next_payment_date && ` · next ${l.next_payment_date}`}
          </div>
        </div>
        <div className="num" style={{ fontSize: 15, fontWeight: 600, textAlign: "right", color: "var(--negative)" }}>
          {fmtMoney(principal, { decimals: 0, abs: true })}
        </div>
      </div>
      {original > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
            <span>Paid off</span>
            <span className="num">{pct.toFixed(0)}% of {fmtMoney(original, { decimals: 0, abs: true })}</span>
          </div>
          <div style={{ marginTop: 4, height: 5, borderRadius: 3, background: "var(--bg-mute)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: color }} />
          </div>
        </div>
      )}
      {(l.interest_paid_ytd != null || l.principal_paid_ytd != null) && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-3)" }}>
          YTD: <span className="num">interest <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{fmtMoney(l.interest_paid_ytd ?? 0, { decimals: 0, abs: true })}</span> · principal <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{fmtMoney(l.principal_paid_ytd ?? 0, { decimals: 0, abs: true })}</span></span>
        </div>
      )}
    </Wrapper>
  );
}

function InsuranceRow({ account, summary, isFirst, onClick }: { account: AppState["accounts"][number]; summary: AccountSummary; isFirst: boolean; onClick?: () => void }) {
  const ins = summary.insurance;
  if (!ins) return null;
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper onClick={onClick} style={{ width: "100%", padding: "14px 14px", borderTop: isFirst ? "none" : "0.5px solid var(--line)", background: "transparent", border: "none", textAlign: "left", color: "inherit", cursor: onClick ? "pointer" : "default", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{account.nickname}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {prettyPolicyType(ins.policy_type)}
          {ins.death_benefit != null && ins.death_benefit > 0 && ` · ${fmtMoney(ins.death_benefit, { decimals: 0, abs: true })} benefit`}
          {ins.next_premium_date && ` · next ${ins.next_premium_date}`}
        </div>
      </div>
      {ins.premium_paid_ytd != null && (
        <div className="num" style={{ fontSize: 13, textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 600 }}>{fmtMoney(ins.premium_paid_ytd, { decimals: 0, abs: true })}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>YTD premium</div>
        </div>
      )}
    </Wrapper>
  );
}

function BreakdownTile({ label, value, count, color, expanded, onClick }: { label: string; value: number; count: number; color: string; expanded: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: 10,
        background: expanded ? "var(--bg-mute)" : "var(--bg)",
        border: "0.5px solid var(--line)",
        borderRadius: 10,
        textAlign: "left",
        cursor: "pointer",
        color: "inherit",
        display: "block",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s ease" }}>
          <path d="M2 3.3l2.5 2.5L7 3.3" />
        </svg>
      </div>
      <div className="num-display" style={{ fontSize: 18, fontWeight: 500, marginTop: 2, color }}>
        {fmtMoney(value, { decimals: 0, abs: true })}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>{count} account{count === 1 ? "" : "s"}</div>
    </button>
  );
}

function BreakdownList({ items, total, onSelect }: { items: { account: AppState["accounts"][number]; value: number }[]; total: number; onSelect?: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 12, background: "var(--bg)", borderRadius: 10, border: "0.5px solid var(--line)", overflow: "hidden" }}>
      {items.map((it, i) => {
        const pct = total > 0 ? (it.value / total) * 100 : 0;
        return (
          <button
            key={it.account.id}
            onClick={() => onSelect?.(it.account.id)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderTop: i ? "0.5px solid var(--line)" : "none",
              background: "transparent",
              border: "none",
              textAlign: "left",
              color: "inherit",
              cursor: onSelect ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ width: 26, height: 26, borderRadius: 7, background: cardSoft(it.account.id), color: cardColor(it.account.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>
              {avatarLetters(it.account.nickname)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {it.account.nickname}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>
                {prettyType(it.account.type)} · {pct.toFixed(0)}%
              </div>
            </div>
            <div className="num" style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
              {fmtMoney(it.value, { decimals: 0, abs: true })}
            </div>
            {onSelect && <span style={{ color: "var(--text-3)", fontSize: 11, marginLeft: 4 }}>›</span>}
          </button>
        );
      })}
    </div>
  );
}

function prettyType(t: string): string {
  return {
    credit_card: "Credit card",
    checking: "Checking",
    savings: "Savings",
    brokerage: "Brokerage",
    ira: "IRA",
    roth_ira: "Roth IRA",
    "401k": "401(k)",
    "403b": "403(b)",
    sep_ira: "SEP-IRA",
    hsa: "HSA",
    loan: "Loan",
    mortgage: "Mortgage",
  }[t] ?? t;
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ marginBottom: 8, padding: "0 4px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {right && <div style={{ fontSize: 12, color: "var(--text-3)" }}>{right}</div>}
      </div>
      {children}
    </div>
  );
}

interface ConsolidatedHolding extends Holding {
  heldBy: string[]; // account ids
  heldByCount: number;
}

function consolidateHoldings(summaries: AccountSummary[]): ConsolidatedHolding[] {
  const byKey = new Map<string, ConsolidatedHolding>();
  for (const s of summaries) {
    const lists: { holdings?: Holding[] | null }[] = [s.brokerage, s.retirement].filter(Boolean) as any[];
    for (const block of lists) {
      const holdings = block.holdings || [];
      for (const h of holdings) {
        const key = (h.symbol || h.name || "").trim().toLowerCase();
        if (!key) continue;
        const existing = byKey.get(key);
        if (existing) {
          existing.value += h.value || 0;
          if (h.shares != null) existing.shares = (existing.shares ?? 0) + h.shares;
          if (h.unrealized_gain != null) existing.unrealized_gain = (existing.unrealized_gain ?? 0) + h.unrealized_gain;
          if (!existing.heldBy.includes(s.account_id)) {
            existing.heldBy.push(s.account_id);
            existing.heldByCount = existing.heldBy.length;
          }
        } else {
          byKey.set(key, {
            ...h,
            heldBy: [s.account_id],
            heldByCount: 1,
          });
        }
      }
    }
  }
  return [...byKey.values()].sort((a, b) => (b.value || 0) - (a.value || 0));
}

function computeAllocation(accounts: AppState["accounts"], summaries: AccountSummary[]): { label: string; value: number; color: string }[] {
  const buckets: Record<string, number> = { Cash: 0, Equity: 0, "Fixed income": 0, Retirement: 0, Other: 0 };
  const colors: Record<string, string> = {
    Cash: "var(--c-services)",
    Equity: "var(--c-shopping)",
    "Fixed income": "var(--c-housing)",
    Retirement: "var(--c-investments)",
    Other: "var(--text-3)",
  };
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  for (const s of summaries) {
    const a = accountById.get(s.account_id);
    if (!a) continue;
    if (a.type === "checking" || a.type === "savings") {
      buckets.Cash += s.balance ?? 0;
      continue;
    }
    if (s.brokerage) {
      // Walk holdings to split equity vs fixed income.
      const holdings = s.brokerage.holdings || [];
      let equity = 0;
      let fixed = 0;
      let cash = s.brokerage.cash_balance ?? 0;
      for (const h of holdings) {
        if (h.asset_class === "fixed_income") fixed += h.value || 0;
        else if (h.asset_class === "cash") cash += h.value || 0;
        else equity += h.value || 0;
      }
      buckets.Equity += equity;
      buckets["Fixed income"] += fixed;
      buckets.Cash += cash;
      continue;
    }
    if (s.retirement) {
      buckets.Retirement += s.retirement.balance ?? 0;
      continue;
    }
    if (s.balance != null && s.balance > 0 && a.type !== "credit_card" && a.type !== "loan" && a.type !== "mortgage") {
      buckets.Other += s.balance;
    }
  }
  return Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({ label, value, color: colors[label] }));
}

function avatarLetters(name: string): string {
  const cleaned = name.replace(/Mastercard|Visa|Card|Credit/gi, "").trim();
  const word = cleaned.split(/\s+/).find((w) => w.length >= 3) || cleaned;
  return word.slice(0, 2).toUpperCase();
}

function prettySubtype(subtype: string): string {
  return {
    traditional_ira: "Traditional IRA",
    roth_ira: "Roth IRA",
    "401k": "401(k)",
    "403b": "403(b)",
    sep_ira: "SEP-IRA",
    hsa: "HSA",
  }[subtype] ?? subtype;
}

function prettyLoanType(t: string): string {
  return { mortgage: "Mortgage", auto: "Auto loan", student: "Student loan", personal: "Personal loan", heloc: "HELOC", other: "Loan" }[t] ?? t;
}

function prettyPolicyType(t: string): string {
  return {
    term_life: "Term life",
    whole_life: "Whole life",
    universal_life: "Universal life",
    health: "Health",
    auto: "Auto",
    home: "Home",
    umbrella: "Umbrella",
    disability: "Disability",
  }[t] ?? t;
}

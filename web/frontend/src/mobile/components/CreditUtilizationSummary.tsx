// Top of credit section: total balance / limit / overall utilization,
// stacked bar with one segment per card. Tap a segment to filter (future).

import { AccountSummary, AppState } from "../../shared/lib/api";
import { fmtMoney, cardColor } from "../../shared/lib/format";

interface Props {
  cards: AppState["accounts"];
  summaries: Record<string, AccountSummary>;
}

export function CreditUtilizationSummary({ cards, summaries }: Props) {
  // Sum balances and limits across all credit cards that have a known limit.
  let totalBalance = 0;
  let totalLimit = 0;
  const segments: { id: string; balance: number; color: string }[] = [];
  for (const c of cards) {
    const s = summaries[c.id];
    if (!s) continue;
    if (s.balance != null && s.balance > 0) totalBalance += s.balance;
    if (s.credit_limit != null) totalLimit += s.credit_limit;
    if (s.balance != null && s.balance > 0) {
      segments.push({ id: c.id, balance: s.balance, color: cardColor(c.id) });
    }
  }
  if (totalLimit === 0 && totalBalance === 0) return null;
  const pct = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
  const severity = pct < 30 ? "ok" : pct < 75 ? "warn" : "high";
  const tint =
    severity === "ok" ? "var(--positive)"
    : severity === "warn" ? "var(--warning)"
    : "var(--negative)";

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        borderRadius: "var(--r-lg)",
        padding: 16,
        boxShadow: "var(--shadow-sm)",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Credit utilization
        </div>
        <div style={{ fontSize: 11, color: tint, fontWeight: 600 }}>
          {pct.toFixed(0)}%
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
        <div className="num-display" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {fmtMoney(totalBalance, { decimals: 0, abs: true })}
        </div>
        {totalLimit > 0 && (
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            of {fmtMoney(totalLimit, { decimals: 0, abs: true })}
          </div>
        )}
      </div>

      {/* Stacked bar */}
      {totalLimit > 0 && (
        <div
          style={{
            display: "flex",
            height: 8,
            borderRadius: 4,
            overflow: "hidden",
            marginTop: 12,
            background: "var(--bg-mute)",
          }}
        >
          {segments.map((seg) => {
            const w = (seg.balance / totalLimit) * 100;
            if (w <= 0) return null;
            return (
              <div
                key={seg.id}
                title={`${seg.id}: ${fmtMoney(seg.balance, { decimals: 0, abs: true })}`}
                style={{
                  width: `${w}%`,
                  background: seg.color,
                  borderRight: "1.5px solid var(--bg-elev)",
                }}
              />
            );
          })}
        </div>
      )}

      {/* Legend */}
      {segments.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
          {segments.map((seg) => {
            const card = cards.find((c) => c.id === seg.id);
            if (!card) return null;
            return (
              <div key={seg.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--text-3)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 1.5, background: seg.color }} />
                <span style={{ fontWeight: 500 }}>{cardShortLabel(card.nickname)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function cardShortLabel(nickname: string): string {
  // Strip common issuer prefixes for compact legend display.
  return nickname
    .replace(/^Capital One\s+/i, "")
    .replace(/^Chase\s+/i, "")
    .replace(/^Bank of America\s+/i, "BofA ")
    .replace(/^Discover\s+/i, "")
    .replace(/^Robinhood\s+/i, "Robinhood ")
    .replace(/^Synchrony\s+/i, "")
    .trim();
}

// Tappable credit-card row matching the spec:
// brand stripe + avatar + name + last4/txn count/last activity + 12-mo heatmap +
// balance + "of $X · Y%" + utilization micro-bar + PRIMARY/DORMANT tags.

import { AppState, AccountSummary } from "../../shared/lib/api";
import { fmtMoney, cardColor, cardSoft } from "../../shared/lib/format";
import { ActivityHeatmap } from "./ActivityHeatmap";

interface Props {
  account: AppState["accounts"][number];
  summary: AccountSummary;
  isPrimary: boolean;
  isDormant: boolean;
  isFirst: boolean;
  onClick: () => void;
}

export function CreditCardRow({ account, summary, isPrimary, isDormant, isFirst, onClick }: Props) {
  const color = cardColor(account.id);
  const soft = cardSoft(account.id);
  const balance = summary.balance ?? 0;
  const limit = summary.credit_limit ?? 0;
  const utilization = limit > 0 ? (balance / limit) * 100 : 0;
  const sev = utilization < 30 ? "ok" : utilization < 75 ? "warn" : "high";
  const utilColor =
    sev === "ok" ? "var(--positive)" : sev === "warn" ? "var(--warning)" : "var(--negative)";

  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        width: "100%",
        padding: "14px 14px 14px 18px",
        borderTop: isFirst ? "none" : "0.5px solid var(--line)",
        background: "transparent",
        border: "none",
        textAlign: "left",
        color: "inherit",
        cursor: "pointer",
        display: "block",
      }}
    >
      {/* Brand color stripe on the left */}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 8,
          bottom: 8,
          width: 3,
          borderRadius: 2,
          background: color,
        }}
      />

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Avatar tile */}
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            background: soft,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {avatarLetters(account.nickname)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + tag */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {account.nickname}
            </div>
            {isPrimary && <Tag label="PRIMARY" color="var(--accent)" outlined />}
            {isDormant && <Tag label="DORMANT" color="var(--text-3)" />}
          </div>
          {/* Sub line */}
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span>{account.last4 ? `•••• ${account.last4}` : "virtual"}</span>
            <span>·</span>
            <span>{summary.txn_count_12mo} txns</span>
            {summary.last_activity && (
              <>
                <span>·</span>
                <span>{relativeAge(summary.last_activity)}</span>
              </>
            )}
          </div>
          {/* 12-month heatmap */}
          <div style={{ marginTop: 8 }}>
            <ActivityHeatmap monthly={summary.monthly_activity} color={color} />
          </div>
        </div>

        {/* Right column: balance, limit/util, util bar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, minWidth: 84 }}>
          <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>
            {fmtMoney(balance, { decimals: 0, abs: true })}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>
            {limit > 0
              ? `of ${fmtMoneyShort(limit)} · ${utilization.toFixed(0)}%`
              : "no limit set"}
          </div>
          {limit > 0 && (
            <div
              style={{
                marginTop: 8,
                width: 78,
                height: 4,
                borderRadius: 2,
                background: "var(--bg-mute)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, utilization)}%`,
                  height: "100%",
                  background: utilColor,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </button>
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
  // First two letters of the most distinctive word in the nickname.
  // E.g. "Bank Foo Travel Rewards" → "FO" (skips the issuer prefix
  // "Bank") and "Some Retailer Card" → "SO".
  const cleaned = name
    .replace(/Mastercard|Visa|Card|Credit/gi, "")
    .trim();
  const word = cleaned.split(/\s+/).find((w) => w.length >= 3) || cleaned;
  return word.slice(0, 2).toUpperCase();
}

function fmtMoneyShort(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n.toLocaleString()}`;
}

function relativeAge(iso: string): string {
  const today = new Date();
  const then = new Date(iso);
  const days = Math.floor((today.getTime() - then.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1mo";
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  return `${years}y`;
}

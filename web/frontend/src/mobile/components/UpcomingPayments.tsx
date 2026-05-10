// Home widget: upcoming credit-card payments. Reads payment_due_date and
// min_payment_due from /api/account-summaries (parsed from the latest
// statement). Sorts soonest first, tints red <3 days, amber <7 days.

import { AppState, AccountSummary } from "../../shared/lib/api";
import { fmtMoney, cardColor, cardSoft } from "../../shared/lib/format";

interface Props {
  accounts: AppState["accounts"];
  summaries: AccountSummary[];
  onSelectCard?: (cardId: string) => void;
}

export function UpcomingPayments({ accounts, summaries, onSelectCard }: Props) {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items = summaries
    .filter((s) => {
      if (!s.payment_due_date) return false;
      const a = accountById.get(s.account_id);
      if (!a || a.type !== "credit_card") return false;
      // Only show due dates within the next 45 days. Older dates are stale
      // statements where the user has likely already paid.
      const due = parseDate(s.payment_due_date);
      if (!due) return false;
      const days = daysFromToday(due);
      return days >= -1 && days <= 45;
    })
    .sort((a, b) => (a.payment_due_date || "").localeCompare(b.payment_due_date || ""));

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          marginBottom: 8,
          padding: "0 4px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Coming up</div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{items.length} payment{items.length === 1 ? "" : "s"}</div>
      </div>
      <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
        {items.map((s, i) => {
          const a = accountById.get(s.account_id)!;
          const due = parseDate(s.payment_due_date!)!;
          const days = daysFromToday(due);
          const urgency: "overdue" | "soon" | "warn" | "ok" =
            days < 0 ? "overdue" : days <= 2 ? "soon" : days <= 7 ? "warn" : "ok";
          const tint =
            urgency === "overdue" ? "var(--negative)"
            : urgency === "soon" ? "var(--negative)"
            : urgency === "warn" ? "var(--warning)"
            : "var(--text-3)";
          const dueLabel = formatDue(days, due);
          return (
            <button
              key={s.account_id}
              onClick={() => onSelectCard?.(s.account_id)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderTop: i ? "0.5px solid var(--line)" : "none",
                background: "transparent",
                border: "none",
                textAlign: "left",
                color: "inherit",
                cursor: onSelectCard ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: cardSoft(a.id),
                  color: cardColor(a.id),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {avatarLetters(a.nickname)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.nickname}
                </div>
                <div style={{ fontSize: 11, color: tint, fontWeight: 600, marginTop: 2 }}>
                  {dueLabel}
                  {s.balance != null && s.balance > 0 && (
                    <span style={{ color: "var(--text-3)", fontWeight: 500 }}>
                      {" · "}{fmtMoney(s.balance, { decimals: 0, abs: true })} balance
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {s.min_payment_due != null && s.min_payment_due > 0 ? (
                  <>
                    <div className="num" style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {fmtMoney(s.min_payment_due, { decimals: 0, abs: true })}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>min due</div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>no balance</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function parseDate(iso: string): Date | null {
  // The API may return ISO date or full datetime; we only care about the day.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromToday(d: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function formatDue(days: number, due: Date): string {
  const monthDay = due.toLocaleString("en-US", { month: "short", day: "numeric" });
  if (days < 0) return `Overdue · was due ${monthDay}`;
  if (days === 0) return `Due today · ${monthDay}`;
  if (days === 1) return `Due tomorrow · ${monthDay}`;
  if (days <= 7) return `Due in ${days} days · ${monthDay}`;
  return `Due ${monthDay}`;
}

function avatarLetters(name: string): string {
  const cleaned = name.replace(/Mastercard|Visa|Card|Credit/gi, "").trim();
  const word = cleaned.split(/\s+/).find((w) => w.length >= 3) || cleaned;
  return word.slice(0, 2).toUpperCase();
}

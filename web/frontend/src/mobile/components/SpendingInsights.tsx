// Spending tab — narrative insights derived from the filtered transactions
// + the period report. Surfaces:
//   - Top 3 categories this period (% of total)
//   - Trend vs trailing 3-month average
//   - Habits (frequency-based: dining out, coffee runs, rideshares)
//   - Wins (categories down materially vs avg)
//   - Subscription consolidation hints (when overlap detected)
//
// Everything runs client-side off the data we already have, so it's free
// and updates with the filter chips at the top.

import { useMemo, useState } from "react";
import { Report, Transaction } from "../../shared/lib/api";
import { fmtMoney } from "../../shared/lib/format";
import { TrendingUp, TrendingDown, Coffee, Utensils, Car, Repeat, Sparkles, type LucideIcon } from "lucide-react";

interface Props {
  report: Report;
  transactions: Transaction[];
  allTransactions: Transaction[]; // unfiltered, used to compute trailing avg
  defaultExpanded?: boolean;
}

interface Insight {
  id: string;
  tone: "info" | "warn" | "good";
  icon: LucideIcon;
  title: string;
  body: string;
}

export function SpendingInsights({ report, transactions, allTransactions, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const insights = useMemo(
    () => computeInsights(report, transactions, allTransactions),
    [report, transactions, allTransactions]
  );

  if (insights.length === 0) return null;

  const visible = expanded ? insights : insights.slice(0, 2);
  const hidden = insights.length - visible.length;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ marginBottom: 8, padding: "0 4px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Insights</div>
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{insights.length}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((it) => {
          const Icon = it.icon;
          const tint =
            it.tone === "warn" ? "var(--warning)" :
            it.tone === "good" ? "var(--positive)" :
            "var(--accent)";
          const bg =
            it.tone === "warn" ? "rgba(192,138,26,0.12)" :
            it.tone === "good" ? "rgba(77,136,85,0.14)" :
            "var(--accent-soft)";
          return (
            <div
              key={it.id}
              style={{
                background: "var(--bg-elev)",
                borderRadius: "var(--r-lg)",
                padding: "12px 14px",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <span style={{ width: 32, height: 32, borderRadius: 10, background: bg, color: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                <Icon size={15} strokeWidth={2} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{it.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3, lineHeight: 1.45 }}>{it.body}</div>
              </div>
            </div>
          );
        })}
      </div>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "10px 0",
            background: "var(--bg-elev)",
            color: "var(--text-2)",
            border: "0.5px solid var(--line)",
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Show {hidden} more
        </button>
      )}
      {expanded && insights.length > 2 && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "10px 0",
            background: "transparent",
            color: "var(--text-3)",
            border: "0.5px solid var(--line)",
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Show less
        </button>
      )}
    </div>
  );
}

function computeInsights(report: Report, transactions: Transaction[], allTransactions: Transaction[]): Insight[] {
  const out: Insight[] = [];
  const periodMonth = report.period.month; // YYYY-MM

  // 1. Top 3 categories this period
  const cats = (report.spend_by_category || []).slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const totalSpend = Math.abs(report.summary.total_spend) || 0;
  if (cats.length > 0 && totalSpend > 0) {
    const top3 = cats.slice(0, 3);
    const top3Pct = top3.reduce((s, c) => s + Math.abs(c.amount), 0) / totalSpend * 100;
    const names = top3.map((c) => `${c.name} (${(Math.abs(c.amount) / totalSpend * 100).toFixed(0)}%)`).join(", ");
    out.push({
      id: "top3",
      tone: "info",
      icon: TrendingUp,
      title: `${top3Pct.toFixed(0)}% of spend in 3 categories`,
      body: names,
    });
  }

  // 2. Trend vs trailing 3-month average — by category
  const trailing = computeTrailingAvgByCategory(allTransactions, periodMonth, 3);
  for (const c of cats.slice(0, 6)) {
    const cur = Math.abs(c.amount);
    const avg = trailing.get(c.category_id) || 0;
    if (avg < 50 || cur < 50) continue;
    const ratio = cur / avg;
    if (ratio >= 1.5 && cur - avg >= 100) {
      out.push({
        id: `up_${c.category_id}`,
        tone: "warn",
        icon: TrendingUp,
        title: `${c.name} up ${((ratio - 1) * 100).toFixed(0)}% vs your usual`,
        body: `${fmtMoney(cur, { decimals: 0, abs: true })} this month vs ${fmtMoney(avg, { decimals: 0, abs: true })}/mo trailing 3-month average.`,
      });
    } else if (ratio <= 0.7 && avg - cur >= 100) {
      out.push({
        id: `down_${c.category_id}`,
        tone: "good",
        icon: TrendingDown,
        title: `${c.name} down ${((1 - ratio) * 100).toFixed(0)}% — nice`,
        body: `${fmtMoney(cur, { decimals: 0, abs: true })} this month vs ${fmtMoney(avg, { decimals: 0, abs: true })}/mo trailing average. Keep it up.`,
      });
    }
  }

  // 3. Habits: frequency-based observations
  const periodTxns = transactions.filter((t) => t.amount < 0 && t.type !== "transfer" && t.date_posted.startsWith(periodMonth));

  // Coffee count
  const coffeeCount = periodTxns.filter((t) =>
    (t.category === "coffee") ||
    /\b(starbucks|peet|blue\s*bottle|philz|coffee|cafe)\b/i.test(t.merchant_canonical || t.description_normalized || "")
  ).length;
  if (coffeeCount >= 8) {
    const total = periodTxns
      .filter((t) =>
        (t.category === "coffee") ||
        /\b(starbucks|peet|blue\s*bottle|philz|coffee|cafe)\b/i.test(t.merchant_canonical || t.description_normalized || "")
      )
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    out.push({
      id: "coffee_habit",
      tone: "info",
      icon: Coffee,
      title: `${coffeeCount} coffee runs this month`,
      body: `${fmtMoney(total, { decimals: 0, abs: true })} on coffee — a home setup with decent beans pays for itself in about 6 weeks at this pace.`,
    });
  }

  // Dining out count
  const dineCount = periodTxns.filter((t) => t.category === "dining_out" || t.category === "food_delivery").length;
  if (dineCount >= 12) {
    const dineTotal = periodTxns
      .filter((t) => t.category === "dining_out" || t.category === "food_delivery")
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    out.push({
      id: "dining_habit",
      tone: "info",
      icon: Utensils,
      title: `${dineCount} restaurant/delivery orders`,
      body: `${fmtMoney(dineTotal, { decimals: 0, abs: true })} on eating out. Cooking 2 of those nights would save roughly ${fmtMoney(dineTotal / dineCount * 2, { decimals: 0, abs: true })} a month.`,
    });
  }

  // Rideshare frequency
  const rideCount = periodTxns.filter((t) => t.category === "rideshare").length;
  if (rideCount >= 8) {
    const rideTotal = periodTxns
      .filter((t) => t.category === "rideshare")
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    out.push({
      id: "rideshare_habit",
      tone: "info",
      icon: Car,
      title: `${rideCount} rideshares this month`,
      body: `${fmtMoney(rideTotal, { decimals: 0, abs: true })} on Uber/Lyft. If a few of those are recurring routes, an Uber One or Lyft Pink subscription might pencil out.`,
    });
  }

  // 4. Overlapping streaming services (>= 3 distinct streaming merchants)
  const streamingMerchants = new Set<string>();
  for (const t of periodTxns) {
    if (t.category !== "streaming") continue;
    const m = (t.merchant_canonical || "").trim();
    if (m) streamingMerchants.add(m.toLowerCase());
  }
  if (streamingMerchants.size >= 3) {
    out.push({
      id: "stream_overlap",
      tone: "warn",
      icon: Repeat,
      title: `${streamingMerchants.size} streaming services active`,
      body: `${[...streamingMerchants].slice(0, 4).join(", ")}${streamingMerchants.size > 4 ? "…" : ""}. If you're not watching all of them weekly, rotate one out.`,
    });
  }

  // 5. Savings rate signal
  const income = report.summary.total_income || 0;
  const spend = Math.abs(report.summary.total_spend || 0);
  if (income > 0 && spend > 0) {
    const savingsRate = ((income - spend) / income) * 100;
    if (savingsRate >= 30) {
      out.push({
        id: "savings_rate",
        tone: "good",
        icon: Sparkles,
        title: `${savingsRate.toFixed(0)}% savings rate — strong`,
        body: `You spent ${fmtMoney(spend, { decimals: 0, abs: true })} of ${fmtMoney(income, { decimals: 0, abs: true })} earned this month. Anything above 20% puts you ahead of most US households.`,
      });
    } else if (savingsRate < 0) {
      out.push({
        id: "savings_rate_neg",
        tone: "warn",
        icon: TrendingDown,
        title: `Spending exceeded income`,
        body: `${fmtMoney(spend - income, { decimals: 0, abs: true })} more out than in. Probably one-time (large bill, tax, vacation) — worth confirming so it doesn't repeat.`,
      });
    }
  }

  return out;
}

function computeTrailingAvgByCategory(allTxns: Transaction[], periodMonth: string, monthsBack: number): Map<string, number> {
  // Months STRICTLY before periodMonth, up to monthsBack of them.
  const monthsSeen = new Set<string>();
  const byMonthCat = new Map<string, Map<string, number>>();
  for (const t of allTxns) {
    if (t.amount >= 0 || t.type === "transfer") continue;
    const m = t.date_posted.slice(0, 7);
    if (m >= periodMonth) continue;
    monthsSeen.add(m);
    if (!byMonthCat.has(m)) byMonthCat.set(m, new Map());
    const cur = byMonthCat.get(m)!;
    const cat = t.category || "uncategorized";
    cur.set(cat, (cur.get(cat) || 0) + Math.abs(t.amount));
  }
  const sorted = [...monthsSeen].sort((a, b) => b.localeCompare(a)).slice(0, monthsBack);
  if (sorted.length === 0) return new Map();
  const totals = new Map<string, number>();
  for (const m of sorted) {
    const monthTotals = byMonthCat.get(m)!;
    for (const [cat, amt] of monthTotals) {
      totals.set(cat, (totals.get(cat) || 0) + amt);
    }
  }
  const avg = new Map<string, number>();
  for (const [cat, total] of totals) {
    avg.set(cat, total / sorted.length);
  }
  return avg;
}

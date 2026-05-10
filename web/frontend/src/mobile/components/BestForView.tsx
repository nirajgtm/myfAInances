// Grouped, expandable "Best for..." panel. Replaces the flat reward list.
// Categories are bucketed into groups (Travel / Daily / Lifestyle / Base);
// each row is collapsed by default, showing the winning card + rate. Tap to
// expand and see ALL eligible cards for that category, with the BEST tag,
// each card's rate, and effective cents-per-dollar.

import { useMemo, useState } from "react";
import { CategoryReward, CategoryOffer, AppState } from "../../shared/lib/api";
import { categoryColor } from "../../shared/lib/format";
import { getCategoryIcon } from "../../shared/lib/categoryIcon";
import { matchesQuery } from "../../shared/lib/search";
import { aliasesFor } from "../../shared/lib/aliases";
import { Plane, ShoppingCart, Sparkles, Tag, type LucideIcon } from "lucide-react";

interface Props {
  rewards: CategoryReward[];
  accounts: AppState["accounts"];
  onSelectCard?: (cardId: string) => void;
}

interface Group {
  id: string;
  label: string;
  icon: LucideIcon;
  matches: string[]; // category match keys that belong to this group
}

const GROUPS: Group[] = [
  { id: "travel", label: "Travel", icon: Plane, matches: ["travel", "hotels", "flights", "rental_cars", "transit"] },
  { id: "daily", label: "Daily", icon: ShoppingCart, matches: ["dining_out", "groceries", "gas", "streaming", "pharmacy", "rideshare"] },
  { id: "lifestyle", label: "Lifestyle", icon: Sparkles, matches: ["entertainment", "shopping", "personal_care"] },
  { id: "base", label: "Base rate", icon: Tag, matches: ["*"] },
];

const PRETTY: Record<string, string> = {
  "*": "All purchases",
  flights: "Flights",
  hotels: "Hotels",
  travel: "Travel",
  rental_cars: "Rental cars",
  transit: "Transit",
  dining_out: "Dining",
  groceries: "Groceries",
  gas: "Gas",
  streaming: "Streaming",
  pharmacy: "Pharmacy / drugstores",
  rideshare: "Rideshare",
  entertainment: "Entertainment",
  shopping: "Shopping",
  personal_care: "Personal care",
};

export function BestForView({ rewards, accounts, onSelectCard }: Props) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Bucket rewards into groups; anything not matching a group lands in "other".
  const grouped = useMemo(() => {
    const inGroup: Record<string, CategoryReward[]> = {};
    const other: CategoryReward[] = [];
    for (const r of rewards) {
      const g = GROUPS.find((g) => g.matches.includes(r.match));
      if (g) {
        (inGroup[g.id] = inGroup[g.id] || []).push(r);
      } else {
        other.push(r);
      }
    }
    return { inGroup, other };
  }, [rewards]);

  const matchesReward = (r: CategoryReward) => {
    if (!query.trim()) return true;
    return matchesQuery(query, [
      PRETTY[r.match] ?? r.match,
      r.match,
      aliasesFor(r.match),
      r.scope,
      ...r.all_offers.flatMap((o) => [o.card_nickname, o.scope]),
    ]);
  };

  const cardCount = accounts.filter((a) => a.type === "credit_card").length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 6 }}>
          Best for…
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
          Mix &amp; match across {cardCount} cards
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 14, position: "relative" }}>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }}
        >
          <circle cx="6" cy="6" r="4" />
          <path d="M9 9l3 3" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories or cards"
          style={{
            width: "100%",
            padding: "10px 14px 10px 32px",
            borderRadius: 12,
            border: "0.5px solid var(--line)",
            background: "var(--bg-elev)",
            color: "var(--text)",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>

      {/* Groups */}
      {GROUPS.map((g) => {
        const items = (grouped.inGroup[g.id] || [])
          .filter(matchesReward)
          .sort((a, b) => b.effective_cents_per_dollar - a.effective_cents_per_dollar);
        if (items.length === 0) return null;
        const peakRate = items[0];
        const Icon = g.icon;
        return (
          <div key={g.id} style={{ marginBottom: 14 }}>
            {/* Group header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 6px 6px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    background: "var(--bg-mute)",
                    color: "var(--text-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={13} strokeWidth={2} />
                </span>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{g.label}</div>
                <span style={{ fontSize: 11, color: "var(--text-3)", background: "var(--bg-mute)", padding: "1px 7px", borderRadius: 999, fontWeight: 600 }}>
                  {items.length}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                up to <span style={{ color: "var(--text)", fontWeight: 600 }}>{peakRate.best_rate}{peakRate.best_unit}</span>
              </div>
            </div>

            {/* Rows */}
            <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
              {items.map((r, i) => {
                const isOpen = expanded.has(r.match);
                return (
                  <div key={r.match} style={{ borderTop: i ? "0.5px solid var(--line)" : "none" }}>
                    <RewardCollapsedRow
                      reward={r}
                      isOpen={isOpen}
                      onToggle={() => {
                        const next = new Set(expanded);
                        if (isOpen) next.delete(r.match); else next.add(r.match);
                        setExpanded(next);
                      }}
                    />
                    {isOpen && (
                      <RewardExpandedDetail reward={r} onSelectCard={onSelectCard} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Other (catch-all for matches not in any group) */}
      {grouped.other.filter(matchesReward).length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ padding: "0 6px 6px", fontSize: 14, fontWeight: 600 }}>Other</div>
          <div style={{ background: "var(--bg-elev)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
            {grouped.other.filter(matchesReward).map((r, i) => {
              const isOpen = expanded.has(r.match);
              return (
                <div key={r.match} style={{ borderTop: i ? "0.5px solid var(--line)" : "none" }}>
                  <RewardCollapsedRow
                    reward={r}
                    isOpen={isOpen}
                    onToggle={() => {
                      const next = new Set(expanded);
                      if (isOpen) next.delete(r.match); else next.add(r.match);
                      setExpanded(next);
                    }}
                  />
                  {isOpen && <RewardExpandedDetail reward={r} onSelectCard={onSelectCard} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RewardCollapsedRow({ reward, isOpen, onToggle }: { reward: CategoryReward; isOpen: boolean; onToggle: () => void }) {
  const isBase = reward.match === "*";
  const Icon = getCategoryIcon(isBase ? "uncategorized" : reward.match);
  const tint = isBase ? "var(--accent)" : categoryColor(reward.match);
  const otherCount = Math.max(0, reward.all_offers.length - 1);
  return (
    <button
      onClick={onToggle}
      style={{
        width: "100%",
        padding: "12px 14px",
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
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          background: `color-mix(in srgb, ${tint} 14%, transparent)`,
          color: tint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={14} strokeWidth={2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>
          {PRETTY[reward.match] ?? prettyTitleCase(reward.match)}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{shortNickname(reward.best_card_nickname)}</span>
          {otherCount > 0 && <span> · +{otherCount}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div className="num" style={{ fontSize: 14, fontWeight: 600, color: tint }}>
          {reward.best_rate}{reward.best_unit}
        </div>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s ease" }}>
          <path d="M3 4l2.5 2.5L8 4" />
        </svg>
      </div>
    </button>
  );
}

function RewardExpandedDetail({ reward, onSelectCard }: { reward: CategoryReward; onSelectCard?: (id: string) => void }) {
  return (
    <div
      style={{
        background: "color-mix(in srgb, var(--bg-mute) 50%, transparent)",
        padding: "12px 14px 14px",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8 }}>
        All eligible cards
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {reward.all_offers.map((o, i) => (
          <OfferLine key={o.card_id} offer={o} isBest={i === 0} onClick={onSelectCard ? () => onSelectCard(o.card_id) : undefined} />
        ))}
      </div>
    </div>
  );
}

function OfferLine({ offer, isBest, onClick }: { offer: CategoryOffer; isBest: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 4px",
        borderTop: "0.5px solid var(--line)",
        background: "transparent",
        border: "none",
        borderTopColor: "var(--line)",
        textAlign: "left",
        color: "inherit",
        cursor: onClick ? "pointer" : "default",
        width: "100%",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: "var(--bg-elev)",
          border: "0.5px solid var(--line)",
          color: "var(--text-2)",
          fontSize: 9.5,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {avatarLetters(offer.card_nickname)}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{shortNickname(offer.card_nickname)}</span>
        {isBest && (
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--accent)", background: "var(--accent-soft)", padding: "1px 5px", borderRadius: 3 }}>
            BEST
          </span>
        )}
      </div>
      <div className="num" style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
        ~{offer.effective_cents_per_dollar}¢/$
      </div>
      <div className="num" style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: "right", color: isBest ? "var(--accent)" : "var(--text)" }}>
        {offer.rate}{offer.unit}
      </div>
    </button>
  );
}

function avatarLetters(nickname: string): string {
  const cleaned = nickname.replace(/Mastercard|Visa|Card|Credit/gi, "").trim();
  const word = cleaned.split(/\s+/).find((w) => w.length >= 3) || cleaned;
  return word.slice(0, 2).toUpperCase();
}

function shortNickname(nickname: string): string {
  return nickname
    .replace(/^Capital One\s+/i, "")
    .replace(/^Chase\s+/i, "")
    .replace(/^Bank of America\s+/i, "BofA ")
    .replace(/^Discover\s+/i, "Discover")
    .replace(/^Robinhood\s+/i, "Robinhood")
    .replace(/^Synchrony\s+/i, "")
    .trim();
}

function prettyTitleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

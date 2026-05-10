// Cards section for Home — minimalist, deduped benefits across cards + recommendations.
// Collapses by default, expands inline (no separate screen).

import { useState } from "react";
import { Benefits, Recommendations } from "../../shared/lib/api";
import { fmtMoney, categoryColor } from "../../shared/lib/format";
import { CardPill } from "../../shared/primitives/CardPill";

interface Props {
  benefits: Benefits;
  recommendations: Recommendations;
}

const PRETTY_CATEGORY: Record<string, string> = {
  "*": "All purchases",
  flights: "Flights",
  hotels: "Hotels",
  dining_out: "Dining",
  groceries: "Groceries",
  rideshare: "Rideshare",
  gas: "Gas",
  travel: "Travel",
  ai_tools: "AI Tools",
};

export function CardsSection({ benefits, recommendations }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!benefits.cards.length) {
    return null;
  }

  const cardCount = benefits.cards.length;
  const fees = benefits.annual_fees_total;
  const topRewards = [...benefits.category_rewards]
    .sort((a, b) => b.effective_cents_per_dollar - a.effective_cents_per_dollar)
    .slice(0, 3);
  const missed = recommendations.total_missed_dollars;

  return (
    <>
      <SectionHeader title="Cards" right={`${cardCount} active - $${fees.toFixed(0)}/yr`} />

      <div
        style={{
          background: "var(--bg-elev)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
        }}
      >
        {/* Compact summary row (always visible) */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>
              {topRewards[0]
                ? `${topRewards[0].best_rate}${topRewards[0].best_unit} on ${prettyCategory(topRewards[0].match)}`
                : "Card benefits"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1 }}>
              {recommendations.single_card_mode
                ? "Add another card to compare"
                : missed > 0
                  ? `${recommendations.items.length} optimization${recommendations.items.length === 1 ? "" : "s"} - ${fmtMoney(missed, { abs: true })} missed`
                  : "Best card used everywhere"}
            </div>
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="var(--text-3)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
              flexShrink: 0,
            }}
          >
            <path d="M6 4l5 5-5 5" />
          </svg>
        </button>

        {expanded && (
          <div style={{ borderTop: "0.5px solid var(--line)" }}>
            {/* Best earning rates */}
            {topRewards.length > 0 && (
              <ExpandedSection label={`Best earnings`}>
                {topRewards.map((r) => (
                  <RewardRow key={r.match} reward={r} />
                ))}
              </ExpandedSection>
            )}

            {/* Recommendations */}
            {!recommendations.single_card_mode && recommendations.items.length > 0 && (
              <ExpandedSection label={`Optimizations - ${fmtMoney(missed, { abs: true })} total`}>
                {recommendations.items.slice(0, 5).map((r) => (
                  <RecRow key={r.txn_id} rec={r} />
                ))}
              </ExpandedSection>
            )}

            {/* Perks */}
            {benefits.perks.length > 0 && (
              <ExpandedSection label={`Perks - ${benefits.perks.length} unique`}>
                {benefits.perks.map((p) => (
                  <PerkRow key={p.name} perk={p} />
                ))}
              </ExpandedSection>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function ExpandedSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          padding: "10px 14px 6px",
          fontSize: 10.5,
          color: "var(--text-3)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function RewardRow({ reward }: { reward: import("../../shared/lib/api").CategoryReward }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 14px 10px",
        gap: 10,
      }}
    >
      <span
        className="cat-dot"
        style={{
          background: categoryColor(reward.match === "*" ? null : reward.match),
          width: 8,
          height: 8,
        }}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{prettyCategory(reward.match)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <CardPill id={reward.best_card_id} name={reward.best_card_nickname} />
          {reward.scope && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {reward.scope}
            </span>
          )}
        </div>
      </div>
      <div className="num" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>
        {reward.best_rate}
        {reward.best_unit}
        <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 500, marginTop: 1 }}>
          ~{reward.effective_cents_per_dollar}c/$
        </div>
      </div>
    </div>
  );
}

function RecRow({ rec }: { rec: import("../../shared/lib/api").RecommendationItem }) {
  return (
    <div style={{ padding: "8px 14px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-0.01em" }}>
          {rec.merchant ?? "—"}
        </div>
        <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
          +{fmtMoney(rec.missed_dollars, { abs: true })}
        </div>
      </div>
      <div
        style={{
          marginTop: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <CardPill id={rec.used_card_id} name={rec.used_card_nickname} />
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="var(--text-3)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h6m-2-2 2 2-2 2" />
        </svg>
        <CardPill id={rec.better_card_id} name={rec.better_card_nickname} />
      </div>
    </div>
  );
}

function PerkRow({ perk }: { perk: import("../../shared/lib/api").Perk }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        padding: "8px 14px 10px",
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-0.01em" }}>{perk.name}</div>
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
    </div>
  );
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div
      style={{
        marginTop: 18,
        marginBottom: 8,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "0 4px",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      {right && <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>{right}</div>}
    </div>
  );
}

function prettyCategory(match: string): string {
  return PRETTY_CATEGORY[match] ?? match.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

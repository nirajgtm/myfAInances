// Bottom sheet showing full transaction detail. Slides up from bottom.

import { useEffect, useState } from "react";
import { Transaction, AppState, AmazonOrder, api } from "../../shared/lib/api";
import { fmtMoney, categoryColor, categorySoft } from "../../shared/lib/format";
import { CardPill } from "../../shared/primitives/CardPill";
import { CategoryPicker } from "./CategoryPicker";
import { mapsUrlForTxn } from "../../shared/lib/maps";
import { MapPin } from "lucide-react";

interface Props {
  txn: Transaction | null;
  state: AppState | null;
  onClose: () => void;
  onCategoryChanged?: () => void; // signal to refetch transactions
}

const PRETTY_FLAG: Record<string, string> = {
  large_txn: "Unusually large",
  fee: "Fee charged",
  foreign: "Foreign transaction",
  new_merchant: "New merchant",
  outlier_amount: "Outlier amount",
  dup_billing: "Possible duplicate",
  card_test: "Card-test pattern",
  late_night: "Late-night spending",
  round_number_large: "Round-number large",
  free_trial_jump: "Free trial -> paid",
  unwanted_merchant: "Unwanted merchant",
};

export function TransactionDetailSheet({ txn, state, onClose, onCategoryChanged }: Props) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [order, setOrder] = useState<AmazonOrder | null>(null);

  useEffect(() => {
    if (!txn?.id || !txn.order_id) {
      setOrder(null);
      return;
    }
    api.transactionOrder(txn.id).then(setOrder).catch(() => setOrder(null));
  }, [txn?.id, txn?.order_id]);
  // Lock body scroll while open + esc closes.
  useEffect(() => {
    if (!txn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [txn, onClose]);

  if (!txn) return null;

  const acct = state?.accounts.find((a) => a.id === txn.account_id);
  const isOutflow = txn.amount < 0;
  const datesDiffer = txn.date_posted !== txn.date_transaction;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          zIndex: 50,
          animation: "fadeIn 0.2s ease",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--bg-elev)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "82vh",
          overflowY: "auto",
          zIndex: 60,
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          animation: "slideUp 0.25s ease",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "var(--bg-mute)",
            }}
          />
        </div>

        {/* Hero */}
        <div style={{ padding: "16px 22px 22px", textAlign: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              margin: "0 auto 14px",
              background: categorySoft(txn.category),
              color: categoryColor(txn.category),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            {(txn.merchant_canonical || txn.description_normalized || "?").slice(0, 1).toUpperCase()}
          </div>
          <div style={{ fontSize: 15, color: "var(--text-2)", fontWeight: 500 }}>
            {txn.merchant_canonical || txn.description_normalized}
          </div>
          <div
            className="num-display"
            style={{
              fontSize: 40,
              fontWeight: 500,
              letterSpacing: "-0.04em",
              marginTop: 6,
              color: isOutflow ? "var(--text)" : "var(--positive)",
            }}
          >
            {fmtMoney(txn.amount, { sign: !isOutflow, decimals: 2 })}
          </div>
          {acct && (
            <div style={{ marginTop: 8, display: "inline-block" }}>
              <CardPill id={acct.id} name={acct.nickname} size="sm" />
            </div>
          )}
        </div>

        {/* Detail rows */}
        <div style={{ padding: "0 16px 16px" }}>
          <DetailGroup>
            <DetailRow label="Posted" value={fmtFullDate(txn.date_posted)} />
            {datesDiffer && (
              <DetailRow label="Transaction date" value={fmtFullDate(txn.date_transaction)} />
            )}
            <button
              onClick={() => setShowCategoryPicker(true)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "11px 14px",
                gap: 12,
                borderBottom: "0.5px solid var(--line)",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
                color: "inherit",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--text-3)", flexShrink: 0 }}>Category</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                {txn.category ? (
                  <>
                    <span className="cat-dot" style={{ background: categoryColor(txn.category), width: 8, height: 8 }} />
                    {prettyCategory(txn.category)}
                    {txn.category_confidence != null && txn.category_confidence < 1 && txn.categorized_by !== "manual" && (
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                        ({Math.round(txn.category_confidence * 100)}%)
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: "var(--accent)" }}>Tap to set</span>
                )}
                <span style={{ color: "var(--text-3)", fontSize: 11, marginLeft: 4 }}>›</span>
              </span>
            </button>
            <DetailRow label="Type" value={txn.type} />
            {txn.categorized_by && (
              <DetailRow label="Categorized by" value={txn.categorized_by} />
            )}
            {txn.is_foreign && <DetailRow label="Foreign" value="Yes" />}
          </DetailGroup>

          {/* Account info */}
          {acct && (
            <DetailGroup label="Account">
              <DetailRow label="Card / account" value={acct.nickname} />
              <DetailRow
                label="Institution"
                value={acct.institution.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              />
              {acct.last4 && <DetailRow label="Last 4" value={`${acct.last4}`} />}
            </DetailGroup>
          )}

          {/* Merchant + payment details */}
          {(txn.merchant_city || txn.merchant_state || txn.merchant_country || txn.merchant_phone || txn.payment_method || txn.transaction_time) && (
            <DetailGroup label="Merchant & payment">
              {txn.merchant_city && <DetailRow label="City" value={txn.merchant_city} />}
              {txn.merchant_state && <DetailRow label="State" value={txn.merchant_state} />}
              {txn.merchant_country && <DetailRow label="Country" value={txn.merchant_country} />}
              {txn.merchant_phone && <DetailRow label="Phone" value={txn.merchant_phone} />}
              {txn.payment_method && <DetailRow label="Method" value={txn.payment_method} />}
              {txn.transaction_time && <DetailRow label="Time" value={txn.transaction_time} />}
              {(() => {
                const url = mapsUrlForTxn(txn);
                if (!url) return null;
                return (
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "6px 10px", background: "var(--accent-soft)", color: "var(--accent-deep)", borderRadius: 999, fontSize: 11.5, fontWeight: 600, textDecoration: "none" }}>
                    <MapPin size={12} strokeWidth={2} />
                    Open in Maps
                  </a>
                );
              })()}
            </DetailGroup>
          )}

          {/* Foreign currency details */}
          {(txn.original_currency || txn.original_amount != null || txn.fx_rate) && (
            <DetailGroup label="Foreign currency">
              {txn.original_currency && <DetailRow label="Original currency" value={txn.original_currency} />}
              {txn.original_amount != null && (
                <DetailRow
                  label="Original amount"
                  value={`${txn.original_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${txn.original_currency || ""}`}
                />
              )}
              {txn.fx_rate && <DetailRow label="FX rate" value={txn.fx_rate.toString()} />}
            </DetailGroup>
          )}

          {/* Rewards + authorization */}
          {(txn.rewards_earned != null || txn.authorization_code) && (
            <DetailGroup label="Rewards & auth">
              {txn.rewards_earned != null && <DetailRow label="Rewards earned" value={`${txn.rewards_earned.toLocaleString()} pts`} />}
              {txn.authorization_code && <DetailRow label="Auth code" value={txn.authorization_code} />}
            </DetailGroup>
          )}

          {/* Raw description (often contains city/state/processor) */}
          <DetailGroup label="Source">
            <DetailRow
              label="Raw description"
              value={
                <span style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "var(--font-numeric)" }}>
                  {txn.description_raw}
                </span>
              }
            />
            {txn.statement_id && (
              <DetailRow
                label="Statement"
                value={
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-numeric)" }}>
                    {txn.statement_id}
                  </span>
                }
              />
            )}
          </DetailGroup>

          {/* Order detail (Amazon) */}
          {order && (
            <DetailGroup label={`${order.vendor === "amazon" ? "Amazon order" : order.vendor} - ${order.items.length} item${order.items.length === 1 ? "" : "s"}`}>
              <div style={{ padding: "10px 14px" }}>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>
                  Order #{order.order_id} - placed {fmtFullDate(order.date_placed)}
                  {order.delivered_on ? ` - delivered ${fmtFullDate(order.delivered_on)}` : ""}
                </div>
                {order.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "6px 0",
                      borderTop: i ? "0.5px solid var(--line)" : "none",
                      fontSize: 13,
                      lineHeight: 1.4,
                    }}
                  >
                    {item.name}
                    {item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ""}
                    {item.price != null ? ` - $${item.price.toFixed(2)}` : ""}
                  </div>
                ))}
              </div>
            </DetailGroup>
          )}

          {/* Smart suggestions */}
          {(() => {
            const suggestions = buildSuggestions(txn, order, acct);
            if (!suggestions.length) return null;
            return (
              <DetailGroup label="Suggestions">
                {suggestions.map((s, i) => (
                  <a
                    key={i}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "11px 14px",
                      borderBottom: i < suggestions.length - 1 ? "0.5px solid var(--line)" : "none",
                      fontSize: 13,
                      color: "inherit",
                      textDecoration: "none",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{s.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{s.body}</div>
                    </div>
                    <span style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600 }}>{s.cta} ›</span>
                  </a>
                ))}
              </DetailGroup>
            );
          })()}

          {/* Anomaly flags */}
          {txn.anomaly_flags && txn.anomaly_flags.length > 0 && (
            <DetailGroup label="Flags">
              {txn.anomaly_flags.map((f) => (
                <div
                  key={f}
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    color: "var(--warning)",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--warning)" }} />
                  {PRETTY_FLAG[f] ?? f}
                </div>
              ))}
            </DetailGroup>
          )}

          {/* Mark merchant as subscription */}
          {txn.merchant_canonical && txn.amount < 0 && txn.type !== "transfer" && (
            <div style={{ padding: "12px 0 0" }}>
              <button
                onClick={async () => {
                  if (!txn.merchant_canonical) return;
                  if (!confirm(`Treat all "${txn.merchant_canonical}" charges as a subscription?`)) return;
                  try {
                    await api.includeSubscription(txn.merchant_canonical, "monthly");
                    alert(`"${txn.merchant_canonical}" added to subscriptions.`);
                  } catch (e: any) {
                    alert(`Failed: ${e.message}`);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg-elev)",
                  color: "var(--text-2)",
                  border: "0.5px solid var(--line)",
                  borderRadius: 12,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M2 4h12v8H2zM2 7h12" />
                  <circle cx="8" cy="10" r="0.8" fill="currentColor" />
                </svg>
                Mark "{txn.merchant_canonical}" as a subscription
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Category picker mounted on top of detail sheet */}
      {showCategoryPicker && (
        <CategoryPicker
          txn={txn}
          onClose={() => setShowCategoryPicker(false)}
          onUpdated={() => {
            setShowCategoryPicker(false);
            onCategoryChanged?.();
          }}
        />
      )}

      {/* Animations */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  );
}

function DetailGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      {label && (
        <div
          style={{
            fontSize: 10.5,
            color: "var(--text-3)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "0 4px 6px",
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          background: "var(--bg)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "11px 14px",
        gap: 12,
        borderBottom: "0.5px solid var(--line)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: "var(--text)",
          fontWeight: 500,
          textAlign: "right",
          minWidth: 0,
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}

interface Suggestion {
  title: string;
  body: string;
  cta: string;
  href: string;
}

const FOOD_CATEGORIES = new Set(["dining_out", "food_delivery", "bars", "coffee", "food", "groceries"]);
const SUB_CATEGORIES = new Set(["streaming", "music", "cloud_storage", "software", "ai_tools", "news", "subscriptions"]);

function buildSuggestions(
  txn: Transaction,
  order: AmazonOrder | null,
  acct: AppState["accounts"][number] | undefined
): Suggestion[] {
  const out: Suggestion[] = [];
  const amount = Math.abs(txn.amount);
  const merchant = txn.merchant_canonical || txn.description_normalized;

  // Splitwise: large food expense
  if (txn.amount < 0 && amount >= 30 && txn.category && FOOD_CATEGORIES.has(txn.category)) {
    out.push({
      title: "Split with someone?",
      body: `${fmtMoney(amount, { decimals: 2 })} at ${merchant} - shareable on Splitwise`,
      cta: "Splitwise",
      href: `https://secure.splitwise.com/expenses?utf8=%E2%9C%93&description=${encodeURIComponent(merchant || "")}&cost=${amount.toFixed(2)}`,
    });
  }

  // Cancel: subscription candidate or actual subscription
  if (txn.subscription_candidate || (txn.category && SUB_CATEGORIES.has(txn.category) && amount < 200)) {
    out.push({
      title: "Cancel this subscription?",
      body: `Recurring charge from ${merchant}`,
      cta: "How",
      href: `https://www.google.com/search?q=${encodeURIComponent("how to cancel " + (merchant || ""))}`,
    });
  }

  // Dispute: large_txn or anomaly flagged or large foreign
  const flags = txn.anomaly_flags || [];
  if (flags.includes("large_txn") || flags.includes("dup_billing") || flags.includes("card_test") || flags.includes("unwanted_merchant")) {
    if (acct) {
      const issuer = acct.institution.replace(/_/g, " ");
      out.push({
        title: "Looks suspicious - dispute?",
        body: `Contact ${issuer} for a chargeback or fraud report`,
        cta: "Help",
        href: `https://www.google.com/search?q=${encodeURIComponent("how to dispute charge " + issuer)}`,
      });
    }
  }

  // Better card available: hint to check Cards tab if it's a non-recommendation merchant
  // (We don't have per-txn rec lookup here cheaply; defer to the Cards tab.)

  // Order: if we matched an order, link to view it
  if (order && order.vendor === "amazon") {
    out.push({
      title: "View this Amazon order",
      body: `${order.items.length} item${order.items.length === 1 ? "" : "s"} - return window may apply`,
      cta: "Open",
      href: `https://www.amazon.com/gp/your-account/order-details?orderID=${encodeURIComponent(order.order_id)}`,
    });
  }

  return out;
}

function fmtFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function prettyCategory(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

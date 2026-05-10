// Build a Google Maps search URL for a transaction's merchant location.
// Returns null when:
//   - the transaction has no usable location signal, OR
//   - the merchant is online-only / a bank charge / a transfer / a
//     subscription where there's no physical place to visit.
// The point is to surface the map only for storefronts the user might
// actually want to navigate to (restaurants, gas, retail, hotels).

import { Transaction } from "./api";

const NON_PHYSICAL_TYPES = new Set(["transfer", "fee", "interest", "dividend", "check"]);

const NON_PHYSICAL_CATEGORIES = new Set([
  // movement / accounting, not a visit
  "transfer", "cc_payment", "account_transfer",
  "interest_charged", "interest_income", "dividend_income",
  "bank_fee", "tax", "investment",
  "to_nepal", "remittance",
  // recurring digital services
  "subscriptions", "streaming", "software", "ai_tools", "cloud_storage",
  "music", "games", "news", "books",
  // recurring household bills (you pay online; map of HQ isn't useful)
  "internet", "phone", "utilities", "rent", "mortgage",
  "insurance", "health_insurance",
  // income side
  "salary", "income", "bonus", "refund", "other_income", "side_hustle_income",
]);

// Merchant-name substrings that indicate online-only / no-physical-location.
// All lowercase; matched against merchant_canonical || description_normalized.
const ONLINE_MERCHANT_PATTERNS: string[] = [
  "amazon", "amzn", "ebay", "etsy", "shopify", "alibaba", "aliexpress",
  "netflix", "spotify", "hulu", "youtube", "disney+", "disney plus",
  "hbo", "max ", "paramount+", "peacock", "apple tv", "apple music",
  "paypal", "venmo", "zelle", "apple pay", "google pay", "cash app", "cashapp",
  "doordash", "grubhub", "ubereats", "uber eats", "instacart", "postmates",
  "walmart.com", "target.com", "bestbuy.com", "best buy.com",
  "openai", "anthropic", "claude.ai", "chatgpt", "github", "vercel",
  "stripe", "square", "patreon", "kickstarter", "gofundme",
  "robinhood", "schwab", "fidelity", "vanguard", "etrade",
  "ach ", "ach pmt", "eft ", "wire ", "online pmt", "online payment",
];

const ONLINE_CITY_PATTERNS = ["online", "internet", "n/a", "world wide", "online sales", ".com"];

function isPhysicalMerchant(t: Transaction): boolean {
  if (NON_PHYSICAL_TYPES.has(t.type || "")) return false;
  if (t.category && NON_PHYSICAL_CATEGORIES.has(t.category)) return false;

  const merchant = (t.merchant_canonical || t.description_normalized || "").toLowerCase();
  for (const p of ONLINE_MERCHANT_PATTERNS) {
    if (merchant.includes(p)) return false;
  }

  const city = (t.merchant_city || "").toLowerCase();
  for (const p of ONLINE_CITY_PATTERNS) {
    if (city.includes(p)) return false;
  }

  return true;
}

export function mapsUrlForTxn(t: Transaction): string | null {
  if (!isPhysicalMerchant(t)) return null;

  const merchant = (t.merchant_canonical || t.description_normalized || "").trim();
  const city = (t.merchant_city || "").trim();
  const state = (t.merchant_state || "").trim();
  const country = (t.merchant_country || "").trim();
  const phone = (t.merchant_phone || "").trim();

  if (!merchant && !phone) return null;
  // Need at least one location signal beyond the merchant name.
  if (!city && !state && !country && !phone) return null;

  const parts = [merchant, city, state, country].filter(Boolean);
  const q = encodeURIComponent(parts.join(" "));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

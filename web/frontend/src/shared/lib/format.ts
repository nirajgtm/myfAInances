// Formatting helpers ported from the design's primitives.jsx + extended for typed use.

export interface MoneyOpts {
  sign?: boolean;       // show explicit "+" for positive amounts
  abbreviate?: boolean; // 1.2k / 3.4M
  decimals?: number;    // default 2
  currency?: string;    // default "$"
  abs?: boolean;        // drop sign entirely
}

export function fmtMoney(n: number, opts: MoneyOpts = {}): string {
  const { sign = false, abbreviate = false, decimals = 2, currency = "$", abs = false } = opts;
  const value = abs ? Math.abs(n) : n;
  const absVal = Math.abs(value);
  let str: string;
  if (abbreviate && absVal >= 1000) {
    if (absVal >= 1e6) str = (absVal / 1e6).toFixed(2).replace(/\.00$/, "") + "M";
    else str = (absVal / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  } else {
    str = absVal.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  const prefix = abs ? "" : value < 0 ? "−" : sign && value > 0 ? "+" : "";
  return `${prefix}${currency}${str}`;
}

export function fmtMonth(period: string): string {
  const [y, m] = period.split("-").map((s) => parseInt(s, 10));
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function fmtMonthShort(period: string): string {
  const [, m] = period.split("-").map((s) => parseInt(s, 10));
  return new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "short" });
}

export function fmtDateMD(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export function todayPretty(): string {
  return new Date().toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// Category color resolver. Maps our DB category ids to the design's 9 hues.
// We map by category id when known; otherwise stable-hash to a hue.
const EXPLICIT_MAP: Record<string, "food" | "transit" | "housing" | "shopping" | "entertainment" | "health" | "services" | "income" | "investments"> = {
  // food
  groceries: "food",
  dining_out: "food",
  coffee: "food",
  bars: "food",
  food_delivery: "food",
  food: "food",

  // transit
  transportation: "transit",
  rideshare: "transit",
  gas: "transit",
  parking: "transit",
  public_transit: "transit",
  tolls: "transit",
  car_maintenance: "transit",
  ev_charging: "transit",
  transit: "transit",

  // housing
  rent: "housing",
  mortgage: "housing",
  utilities: "housing",
  internet: "housing",
  home_maintenance: "housing",
  housing: "housing",

  // shopping
  clothing: "shopping",
  electronics: "shopping",
  home_goods: "shopping",
  gifts: "shopping",
  shopping: "shopping",

  // entertainment
  streaming: "entertainment",
  music: "entertainment",
  games: "entertainment",
  events: "entertainment",
  books: "entertainment",
  entertainment: "entertainment",

  // health
  pharmacy: "health",
  medical: "health",
  dental: "health",
  vision: "health",
  health_insurance: "health",
  therapy: "health",
  gym: "health",
  health: "health",
  insurance: "health",

  // services (broad: software/AI/financial fees/cloud)
  cloud_storage: "services",
  software: "services",
  news: "services",
  subscriptions: "services",
  ai_tools: "services",
  bank_fee: "services",
  interest_charged: "services",
  tax: "services",
  financial: "services",

  // income
  salary: "income",
  bonus: "income",
  interest_income: "income",
  dividend_income: "income",
  refund: "income",
  other_income: "income",
  income: "income",

  // investments
  investment: "investments",
  investments: "investments",

  // transfers neutral
  transfer: "services",
  cc_payment: "services",
  account_transfer: "services",
};

const HUES: Array<keyof typeof EXPLICIT_MAP extends string ? string : never> | string[] =
  ["food", "transit", "housing", "shopping", "entertainment", "health", "services", "income", "investments"];

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function categoryHue(categoryId: string | null | undefined): string {
  if (!categoryId) return "services";
  const explicit = EXPLICIT_MAP[categoryId];
  if (explicit) return explicit;
  return HUES[hashIndex(categoryId, HUES.length)] as string;
}

export function categoryColor(categoryId: string | null | undefined): string {
  return `var(--c-${categoryHue(categoryId)})`;
}

export function categorySoft(categoryId: string | null | undefined): string {
  return `var(--c-${categoryHue(categoryId)}-soft)`;
}

// Card pill colors. Hash card id to one of the categorical hues so the same
// card always renders in the same color across the app.
const CARD_HUES = ["housing", "shopping", "entertainment", "services", "health"];

export function cardHue(cardId: string): string {
  return CARD_HUES[hashIndex(cardId, CARD_HUES.length)];
}

export function cardColor(cardId: string): string {
  return `var(--c-${cardHue(cardId)})`;
}

export function cardSoft(cardId: string): string {
  return `var(--c-${cardHue(cardId)}-soft)`;
}

// Strip a leading issuer name to fit pills compactly.
const ISSUER_PREFIXES = [
  "Capital One ", "Bank of America ", "American Express ", "Amex ",
  "Chase ", "Citi ", "Wells Fargo ", "Discover ", "U.S. Bank ", "Apple ",
];

export function cardShortName(nickname: string): string {
  for (const p of ISSUER_PREFIXES) {
    if (nickname.startsWith(p)) {
      const remainder = nickname.slice(p.length).trim();
      // Only strip if the remainder is meaningfully descriptive.
      // Otherwise stripping produces ambiguous labels like "Card" or "Checking".
      const hasTwoWords = remainder.split(/\s+/).length >= 2;
      if (hasTwoWords || remainder.length > 7) {
        return remainder;
      }
    }
  }
  return nickname;
}

export function initialFor(name: string | null | undefined): string {
  if (!name) return "??";
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return trimmed.slice(0, 2).toUpperCase();
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase().slice(0, 2);
}

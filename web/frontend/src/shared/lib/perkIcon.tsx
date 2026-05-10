// Map a perk to a lucide-react icon. Keyword detection on the perk name first,
// then fall back to the perk's group (travel/dining/fees/insurance/rewards/concierge/other).

import {
  Plane, Hotel, Utensils, Wine, Coffee, Car, ShoppingBag, ShoppingCart,
  Smartphone, Shield, ShieldCheck, Globe, Receipt, Wallet, CircleDollarSign,
  Gift, Sparkles, Bell, Star, BadgeCheck, ArrowLeftRight, Music, Ticket,
  Building2, MapPin, BookOpen, Heart, Truck, Percent, Phone, Tv,
  type LucideIcon,
} from "lucide-react";

const GROUP_ICONS: Record<string, LucideIcon> = {
  travel: Plane,
  dining: Utensils,
  fees: Receipt,
  insurance: Shield,
  rewards: Gift,
  concierge: Bell,
  other: Sparkles,
};

interface PerkLike {
  name: string;
  group: string | null;
}

export function getPerkIcon(perk: PerkLike): LucideIcon {
  const n = perk.name.toLowerCase();

  // Travel / lounges / airlines
  if (/(global entry|tsa precheck|tsa pre)/.test(n)) return ShieldCheck;
  if (/(priority pass|lounge|airport club|admirals club|centurion|delta sky)/.test(n)) return Coffee;
  if (/(hotel|resort|premier collection|lifestyle collection|fhr|the hotel collection)/.test(n)) return Hotel;
  if (/(rental car|auto rental|car rental|rental collision|rental vehicle|hertz|avis|national)/.test(n)) return Car;
  if (/(trip cancel|trip interruption|trip delay|baggage delay|lost baggage|travel insurance|travel accident)/.test(n)) return Plane;
  if (/(travel credit|airline credit|airline fee|flight credit|incidental)/.test(n)) return Plane;
  if (/(transfer partner|airline & hotel|miles|points transfer)/.test(n)) return ArrowLeftRight;
  if (/(no foreign transaction|foreign transaction fee|international)/.test(n)) return Globe;
  if (/(uber|lyft|rideshare)/.test(n)) return Car;

  // Dining
  if (/(dining|restaurant|chef|table|reservation)/.test(n)) return Utensils;
  if (/(bar |cocktail|wine|spirits)/.test(n)) return Wine;

  // Cards / financial / insurance
  if (/(cell phone protection|mobile protection|phone insurance)/.test(n)) return Smartphone;
  if (/(purchase protection|extended warranty|return protection)/.test(n)) return ShieldCheck;
  if (/(insurance|protection|liability|coverage)/.test(n)) return Shield;
  if (/(no annual fee|no fees|0% intro apr|introductory apr|balance transfer)/.test(n)) return Receipt;
  if (/(cash back|daily cash|statement credit|cashback)/.test(n)) return Wallet;
  if (/(savings account|high-yield|apy|interest rate)/.test(n)) return CircleDollarSign;
  if (/(fico|credit score|credit education)/.test(n)) return BadgeCheck;
  if (/(rewards|points|miles|bonus|anniversary|earn)/.test(n)) return Gift;
  if (/(installment|financing|0% apr)/.test(n)) return Percent;

  // Shopping / retail
  if (/(amazon|whole foods)/.test(n)) return ShoppingBag;
  if (/(grocery|groceries|supermarket)/.test(n)) return ShoppingCart;
  if (/(shipping|delivery|free standard)/.test(n)) return Truck;
  if (/(birthday|gift)/.test(n)) return Gift;
  if (/(early access|first dibs|new drops|drops)/.test(n)) return Sparkles;
  if (/(alterations|tailoring)/.test(n)) return ShoppingBag;

  // Concierge / entertainment / membership
  if (/(concierge)/.test(n)) return Bell;
  if (/(status|elite|president|gold|platinum|diamond)/.test(n)) return BadgeCheck;
  if (/(membership|access|exclusive)/.test(n)) return Star;
  if (/(entertainment|tickets|concert|event|show|broadway)/.test(n)) return Ticket;
  if (/(music|spotify|apple music)/.test(n)) return Music;
  if (/(streaming|disney|hulu|netflix|hbo|max)/.test(n)) return Tv;
  if (/(art|cultivist|gallery|museum)/.test(n)) return BookOpen;

  // Misc / personal
  if (/(family sharing|co-owner|family)/.test(n)) return Heart;
  if (/(privacy|security|fraud)/.test(n)) return Shield;
  if (/(path to|education)/.test(n)) return BookOpen;
  if (/(contact|customer service|24\/7)/.test(n)) return Phone;
  if (/(directory|guide|finder)/.test(n)) return MapPin;
  if (/(building|business|corporate)/.test(n)) return Building2;

  // Group fallback.
  if (perk.group && GROUP_ICONS[perk.group]) return GROUP_ICONS[perk.group];
  return Sparkles;
}

const GROUP_TINTS: Record<string, string> = {
  travel: "var(--c-transit)",
  dining: "var(--c-food)",
  fees: "var(--c-services)",
  insurance: "var(--c-health)",
  rewards: "var(--c-shopping)",
  concierge: "var(--c-entertainment)",
  other: "var(--text-3)",
};

export function getPerkTint(perk: PerkLike): string {
  return (perk.group && GROUP_TINTS[perk.group]) || "var(--text-3)";
}

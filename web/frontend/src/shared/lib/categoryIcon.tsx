// Map category ids to lucide-react icons. Falls back to a small dot.

import {
  Utensils, ShoppingCart, ShoppingBag, Coffee, Wine,
  Fuel, Car, Bus, ParkingSquare, Plane, Hotel,
  Tv, Music, Gamepad2, BookOpen, Ticket,
  Briefcase, Stethoscope, Pill, Dumbbell,
  Cpu, Cloud, Newspaper, Sparkles, Bot, MessageSquare,
  Home, Wifi, Phone, Zap,
  CircleDollarSign, Banknote, Wallet, ArrowLeftRight,
  Laptop, Gift, Heart, GraduationCap, Plug,
  Receipt, AlertCircle,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  // Food
  food: Utensils,
  groceries: ShoppingCart,
  dining_out: Utensils,
  coffee: Coffee,
  bars: Wine,
  food_delivery: Utensils,

  // Transit
  transportation: Car,
  gas: Fuel,
  public_transit: Bus,
  rideshare: Car,
  parking: ParkingSquare,
  tolls: Car,
  car_maintenance: Car,
  ev_charging: Plug,
  travel: Plane,
  flights: Plane,
  hotels: Hotel,
  travel_foreign: Plane,

  // Housing
  housing: Home,
  rent: Home,
  mortgage: Home,
  utilities: Zap,
  internet: Wifi,
  phone: Phone,
  home_maintenance: Home,

  // Health
  health: Stethoscope,
  pharmacy: Pill,
  medical: Stethoscope,
  dental: Stethoscope,
  vision: Stethoscope,
  health_insurance: Heart,
  therapy: Heart,
  gym: Dumbbell,

  // Shopping
  shopping: ShoppingBag,
  clothing: ShoppingBag,
  electronics: Laptop,
  home_goods: Home,
  gifts: Gift,

  // Entertainment
  entertainment: Ticket,
  streaming: Tv,
  music: Music,
  games: Gamepad2,
  events: Ticket,
  books: BookOpen,
  news: Newspaper,

  // Personal
  personal_care: Sparkles,

  // Subscriptions
  subscriptions: Receipt,
  cloud_storage: Cloud,
  software: Cpu,
  ai_tools: Bot,

  // Income
  income: Banknote,
  salary: Briefcase,
  bonus: Banknote,
  interest_income: CircleDollarSign,
  dividend_income: CircleDollarSign,
  refund: CircleDollarSign,
  other_income: Banknote,
  side_hustle_income: Banknote,

  // Financial
  financial: Wallet,
  bank_fee: AlertCircle,
  interest_charged: AlertCircle,
  tax: Receipt,
  investment: CircleDollarSign,
  insurance: Heart,
  charity: Heart,

  // Transfers
  transfer: ArrowLeftRight,
  cc_payment: ArrowLeftRight,
  account_transfer: ArrowLeftRight,

  // Misc
  to_nepal: ArrowLeftRight,
  remittance: ArrowLeftRight,
  uncategorized: MessageSquare,
  other: MessageSquare,
};

export function getCategoryIcon(categoryId: string | null | undefined): LucideIcon {
  if (!categoryId) return MessageSquare;
  return ICONS[categoryId] || MessageSquare;
}

// Shared types for API responses

export interface Item {
  id: number;
  name: string;
  category: string;
  unit: string;
  watched: boolean;
  targetPrice: number | null;
}

export interface PriceEntry {
  id: number;
  itemId: number;
  price: number;
  quantity: number;
  unitPrice: number;
  unit: string;
  store: string;
  source: string | null;
  priceType: string;
  date: string;
  notes: string | null;
  item: { name: string; unit: string };
}

export interface StoreInfo {
  id: number;
  name: string;
  type: string;
}

export interface ItemStats {
  avg: number;
  min: number;
  max: number;
  latest: number | null;
  latestDate: string | null;
  latestStore: string | null;
  canonicalUnit: string;
  count: number;
}

export interface ItemWithStats extends Item {
  stats: ItemStats | null;
  priceEntries: { unitPrice: number; store: string; date: string }[];
  _count: { priceEntries: number };
}

export interface ShoppingListItem {
  id: string;
  name: string;
  checked: boolean;
  category: string;
  priceLogged: boolean;
  price?: number;
  priceExpanded?: boolean;
  sortOrder?: number;
}

export const CATEGORIES = [
  "Produce", "Meat", "Seafood", "Dairy", "Bakery",
  "Deli", "Frozen", "Pantry", "Beverages", "Snacks",
  "Household", "Personal Care", "Other",
] as const;

export const UNITS = [
  "each", "per lb", "per kg", "per 100g", "per L", "per 100mL", "per dozen", "per bunch",
] as const;

export type Category = typeof CATEGORIES[number];
export type Unit = typeof UNITS[number];

"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { normalizePrice } from "@/lib/units";

interface Item {
  id: number;
  name: string;
  category: string;
  unit: string;
}

interface StorePrice {
  store: string;
  unitPrice: number;
  unit: string;
  date: string;
}

interface ItemPrices {
  item: Item;
  prices: StorePrice[];
}

interface StoreTotal {
  store: string;
  totalPrice: number;
  itemsAvailable: number;
  itemsMissing: number;
}

export default function ComparePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [itemPrices, setItemPrices] = useState<Map<number, StorePrice[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<StoreTotal[] | null>(null);

  useEffect(() => {
    fetch("/api/items?stats=true")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setItems(data.filter((i: Item & { stats?: { count: number } }) => (i as any).stats?.count > 0));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch price history for selected items to compute store totals
  async function computeComparison() {
    if (selectedIds.size === 0) return;

    const priceMap = new Map<number, StorePrice[]>();

    for (const itemId of selectedIds) {
      try {
        const res = await fetch(`/api/prices?itemId=${itemId}&limit=100`);
        const data = await res.json();
        if (Array.isArray(data)) {
          // Get the cheapest price per store (normalized to canonical unit)
          const storePrices = new Map<string, StorePrice>();
          for (const entry of data) {
            if (entry.source !== "manual" && entry.source !== "receipt") continue;
            const norm = normalizePrice(entry.unitPrice, entry.unit);
            const existing = storePrices.get(entry.store);
            if (!existing || norm.price < normalizePrice(existing.unitPrice, existing.unit).price) {
              storePrices.set(entry.store, {
                store: entry.store,
                unitPrice: norm.price,
                unit: norm.unit,
                date: entry.date,
              });
            }
          }
          priceMap.set(itemId, Array.from(storePrices.values()));
        }
      } catch {}
    }

    setItemPrices(priceMap);

    // Compute store totals
    const storeTotals = new Map<string, { total: number; available: number; missing: number }>();

    for (const itemId of selectedIds) {
      const prices = priceMap.get(itemId) || [];
      if (prices.length === 0) {
        // Item has no prices - count as missing for all stores
        for (const [, totals] of storeTotals) {
          totals.missing++;
        }
        continue;
      }
      // Add to each store's total
      for (const sp of prices) {
        const existing = storeTotals.get(sp.store);
        if (existing) {
          existing.total += sp.unitPrice;
          existing.available++;
        } else {
          storeTotals.set(sp.store, { total: sp.unitPrice, available: 1, missing: selectedIds.size - 1 });
        }
      }
      // For stores that don't have this item, add to missing
      for (const [store, totals] of storeTotals) {
        if (!prices.some((p) => p.store === store)) {
          totals.missing++;
        }
      }
    }

    const storeResults: StoreTotal[] = Array.from(storeTotals.entries())
      .map(([store, data]) => ({
        store,
        totalPrice: data.total,
        itemsAvailable: data.available,
        itemsMissing: selectedIds.size - data.available,
      }))
      .sort((a, b) => a.totalPrice - b.totalPrice);

    setResults(storeResults);
  }

  function toggleItem(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResults(null);
  }

  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-xl leading-none">←</Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">🏪 Store Comparison</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">See which store gives you the best basket price.</p>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Select items you want to buy, then compare total cost across stores.
      </p>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading items...</div>
      ) : (
        <>
          {/* Item selection */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Select items to compare</h3>
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedIds.has(item.id)
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-brand-300"
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          {/* Compare button */}
          {selectedIds.size > 0 && (
            <button
              onClick={computeComparison}
              className="w-full py-3 bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700 transition-colors"
            >
              Compare {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} across stores
            </button>
          )}

          {/* Results */}
          {results && results.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Results — cheapest first</h3>
              {results.map((store, idx) => (
                <div
                  key={store.store}
                  className={`bg-white rounded-xl border p-4 ${
                    idx === 0 ? "border-green-300 bg-green-50" : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      {idx === 0 && <span className="text-xs text-green-600 font-semibold">👑 CHEAPEST</span>}
                      <p className="font-semibold text-gray-900 dark:text-white">{store.store}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${idx === 0 ? "text-green-700" : "text-gray-700"}`}>
                        ${store.totalPrice.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {store.itemsAvailable} items · {store.itemsMissing > 0 ? `${store.itemsMissing} missing` : "all available"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results && results.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">🤷</p>
              <p className="font-medium text-gray-600">No price data for selected items</p>
              <p className="text-sm">Try selecting items you&apos;ve tracked before</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

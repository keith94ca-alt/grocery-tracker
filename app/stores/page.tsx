"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ItemCardSkeleton } from "@/components/Skeletons";

interface StoreEntry {
  id: number;
  price: number;
  unitPrice: number;
  store: string;
  date: string;
  item: { name: string; unit: string; category: string };
}

interface StoreStats {
  name: string;
  itemCount: number;
  totalEntries: number;
  avgUnitPrice: number;
  bestDeals: { name: string; unitPrice: number; unit: string }[];
  categories: Set<string>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export default function StoresPage() {
  const [entries, setEntries] = useState<StoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/prices?limit=500")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEntries(data);
      })
      .finally(() => setLoading(false));
  }, []);

  // Compute store stats
  const storeStats = useMemo(() => {
    const map = new Map<string, StoreStats>();
    entries.forEach((e) => {
      const existing = map.get(e.store);
      if (existing) {
        existing.totalEntries++;
        existing.avgUnitPrice = (existing.avgUnitPrice * (existing.totalEntries - 1) + e.unitPrice) / existing.totalEntries;
        existing.categories.add(e.item.category);
        // Track unique items
        if (!existing.bestDeals.some((d) => d.name === e.item.name)) {
          existing.itemCount++;
        }
        // Track this item if it's cheaper than existing best deals for this store
        const existingBest = existing.bestDeals.find((d) => d.name === e.item.name);
        if (!existingBest || e.unitPrice < existingBest.unitPrice) {
          if (existingBest) {
            existingBest.unitPrice = e.unitPrice;
            existingBest.unit = e.item.unit;
          } else {
            existing.bestDeals.push({ name: e.item.name, unitPrice: e.unitPrice, unit: e.item.unit });
          }
        }
      } else {
        map.set(e.store, {
          name: e.store,
          itemCount: 1,
          totalEntries: 1,
          avgUnitPrice: e.unitPrice,
          bestDeals: [{ name: e.item.name, unitPrice: e.unitPrice, unit: e.item.unit }],
          categories: new Set([e.item.category]),
        });
      }
    });

    // Sort by total entries (most shopped at first)
    return Array.from(map.values())
      .sort((a, b) => b.totalEntries - a.totalEntries);
  }, [entries]);

  // Filter entries for selected store
  const storeEntries = useMemo(() => {
    if (!selectedStore) return [];
    return entries
      .filter((e) => e.store === selectedStore)
      .filter((e) => !selectedCategory || e.item.category === selectedCategory)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries, selectedStore, selectedCategory]);

  // Categories in selected store
  const storeCategories = useMemo(() => {
    if (!selectedStore) return [];
    const cats = new Set(storeEntries.map((e) => e.item.category));
    return Array.from(cats).sort();
  }, [storeEntries]);

  if (loading) {
    return (
      <div className="px-4 py-4 space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Stores</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <ItemCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-gray-400">
        <p className="text-5xl mb-3">🏪</p>
        <p className="font-medium text-gray-600">No price entries yet</p>
        <Link href="/add" className="mt-4 inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium">
          Add your first price
        </Link>
      </div>
    );
  }

  // Detail view
  if (selectedStore) {
    const store = storeStats.find((s) => s.name === selectedStore);
    return (
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => { setSelectedStore(null); setSelectedCategory(null); }} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{selectedStore}</h2>
            {store && (
              <p className="text-sm text-gray-500">
                {store.totalEntries} entries · {store.categories.size} categories
              </p>
            )}
          </div>
        </div>

        {/* Category filter */}
        {storeCategories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                !selectedCategory ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-300"
              }`}
            >
              All
            </button>
            {storeCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedCategory === cat ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Best deals for this store */}
        {store && !selectedCategory && store.bestDeals.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-green-800 mb-2">🏆 Best deals at this store</h3>
            <div className="space-y-1.5">
              {store.bestDeals.sort((a, b) => a.unitPrice - b.unitPrice).slice(0, 5).map((d, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-green-700">{d.name}</span>
                  <span className="font-semibold text-green-800">${d.unitPrice.toFixed(2)}/{d.unit.replace("per ", "")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Entries list */}
        <div className="space-y-2">
          {storeEntries.map((entry) => (
            <Link
              key={entry.id}
              href={`/item/${entry.itemId}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-900">{entry.item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{entry.item.category} · {formatDate(entry.date)}</p>
                </div>
                <p className="font-bold text-brand-600 text-right">
                  ${entry.unitPrice.toFixed(2)}
                  <span className="text-xs font-normal text-gray-500">/{entry.item.unit}</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Store list view
  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">🏪 Stores</h2>
        <span className="text-sm text-gray-500">{storeStats.length} stores</span>
      </div>

      <p className="text-sm text-gray-500">
        Tap a store to see what you&apos;ve bought there and your best deals.
      </p>

      <div className="space-y-3">
        {storeStats.map((store) => (
          <button
            key={store.name}
            onClick={() => setSelectedStore(store.name)}
            className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-brand-200 transition-all active:scale-[0.98]"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{store.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {store.totalEntries} {store.totalEntries === 1 ? "entry" : "entries"} · {store.categories.size} categories
                </p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-sm font-bold text-gray-700">
                  ${store.avgUnitPrice.toFixed(2)}<span className="text-xs font-normal text-gray-400"> avg</span>
                </p>
                <p className="text-xs text-gray-400">
                  {store.itemCount} items
                </p>
              </div>
            </div>
            {/* Mini category badges */}
            <div className="flex gap-1 mt-2 flex-wrap">
              {Array.from(store.categories).slice(0, 4).map((cat) => (
                <span key={cat} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{cat}</span>
              ))}
              {store.categories.size > 4 && (
                <span className="text-xs px-2 py-0.5 text-gray-400">+{store.categories.size - 4}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

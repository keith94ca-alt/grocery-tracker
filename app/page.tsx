"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SearchResult {
  id: number;
  name: string;
  category: string;
  unit: string;
  priceEntries: { unitPrice: number; store: string; date: string }[];
  _count: { priceEntries: number };
  stats: {
    avg: number;
    min: number;
    max: number;
    count: number;
  } | null;
}

function DealBadge({ price, stats }: { price: number; stats: NonNullable<SearchResult["stats"]> }) {
  if (stats.count < 3) return null;
  const ratio = price / stats.avg;
  if (ratio <= 0.9) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
        🟢 Great deal
      </span>
    );
  }
  if (ratio <= 1.1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
        🟡 Average
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
      🔴 Above avg
    </span>
  );
}

function formatPrice(price: number) {
  return `$${price.toFixed(2)}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentEntries, setRecentEntries] = useState<
    { id: number; item: { name: string }; unitPrice: number; store: string; date: string }[]
  >([]);

  // Load recent entries on mount
  useEffect(() => {
    fetch("/api/prices?limit=5")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRecentEntries(data);
      })
      .catch(() => {});
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (Array.isArray(data)) setResults(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Search bar */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items (e.g., ribeye steak)"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white shadow-sm text-base focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          autoComplete="off"
          autoFocus
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin">⟳</span>
        )}
      </div>

      {/* Search results */}
      {query.trim() ? (
        <div className="space-y-2">
          {results.length === 0 && !loading ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-4xl mb-2">🔍</p>
              <p className="font-medium">No results for &quot;{query}&quot;</p>
              <Link
                href={`/add?item=${encodeURIComponent(query)}`}
                className="mt-3 inline-block px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium"
              >
                + Add this item
              </Link>
            </div>
          ) : (
            results.map((item) => {
              const latest = item.priceEntries[0];
              return (
                <Link
                  key={item.id}
                  href={`/item/${item.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.category} · {item._count.priceEntries} {item._count.priceEntries === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    {latest && (
                      <div className="text-right">
                        <p className="text-lg font-bold text-brand-600">
                          {formatPrice(latest.unitPrice)}
                          <span className="text-xs font-normal text-gray-500">/{item.unit}</span>
                        </p>
                        {item.stats && (
                          <DealBadge price={latest.unitPrice} stats={item.stats} />
                        )}
                      </div>
                    )}
                  </div>
                  {latest && (
                    <p className="text-xs text-gray-500 mt-2">
                      Last seen at <span className="font-medium">{latest.store}</span> · {formatDate(latest.date)}
                    </p>
                  )}
                  {item.stats && (
                    <div className="flex gap-4 mt-2 text-xs text-gray-600 border-t border-gray-100 pt-2">
                      <span>Avg: <strong>{formatPrice(item.stats.avg)}</strong></span>
                      <span>Low: <strong className="text-green-600">{formatPrice(item.stats.min)}</strong></span>
                      <span>High: <strong className="text-red-600">{formatPrice(item.stats.max)}</strong></span>
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      ) : (
        /* Home state — show recent entries */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Recent entries</h2>
            <Link href="/history" className="text-sm text-brand-600 font-medium">View all →</Link>
          </div>
          {recentEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-5xl mb-3">🛒</p>
              <p className="font-medium text-gray-600">No prices yet</p>
              <p className="text-sm mt-1">Add your first price entry to get started</p>
              <Link
                href="/add"
                className="mt-4 inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium shadow-sm"
              >
                Add first item
              </Link>
            </div>
          ) : (
            recentEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex justify-between items-center"
              >
                <div>
                  <p className="font-medium text-gray-900">{entry.item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{entry.store} · {formatDate(entry.date)}</p>
                </div>
                <p className="text-lg font-bold text-brand-600">
                  {formatPrice(entry.unitPrice)}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

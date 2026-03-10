"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ItemStat {
  avg: number;
  min: number;
  latest: number | null;
  latestStore: string | null;
  latestDate: string | null;
  canonicalUnit: string;
  count: number;
}

interface ItemSummary {
  id: number;
  name: string;
  category: string;
  unit: string;
  stats: ItemStat | null;
}

interface SearchResult {
  id: number;
  name: string;
  category: string;
  unit: string;
  priceEntries: { unitPrice: number; store: string; date: string }[];
  _count: { priceEntries: number };
  stats: { avg: number; min: number; max: number; count: number } | null;
}

function DealBadge({ price, stats }: { price: number; stats: NonNullable<SearchResult["stats"]> }) {
  if (stats.count < 3) return null;
  const ratio = price / stats.avg;
  if (ratio <= 0.9) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">🟢 Great deal</span>;
  if (ratio <= 1.1) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">🟡 Average</span>;
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">🔴 Above avg</span>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/items?stats=true")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data); })
      .catch(() => {})
      .finally(() => setItemsLoading(false));
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
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
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items…"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white shadow-sm text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          autoComplete="off"
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin">⟳</span>}
      </div>

      {query.trim() ? (
        <div className="space-y-2">
          {results.length === 0 && !loading ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-4xl mb-2">🔍</p>
              <p className="font-medium">No results for &quot;{query}&quot;</p>
              <Link href={`/add?item=${encodeURIComponent(query)}`}
                className="mt-3 inline-block px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium">
                + Add this item
              </Link>
            </div>
          ) : (
            results.map((item) => {
              const latest = item.priceEntries[0];
              return (
                <Link key={item.id} href={`/item/${item.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
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
                          ${latest.unitPrice.toFixed(2)}<span className="text-xs font-normal text-gray-500">/{item.unit}</span>
                        </p>
                        {item.stats && <DealBadge price={latest.unitPrice} stats={item.stats} />}
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
                      <span>Avg: <strong>${item.stats.avg.toFixed(2)}</strong></span>
                      <span>Low: <strong className="text-green-600">${item.stats.min.toFixed(2)}</strong></span>
                      <span>High: <strong className="text-red-600">${item.stats.max.toFixed(2)}</strong></span>
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Your items {!itemsLoading && items.length > 0 && `(${items.length})`}
            </h2>
            <Link href="/history" className="text-sm text-brand-600 font-medium">All entries →</Link>
          </div>

          {itemsLoading ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl animate-pulse">⏳</div>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-5xl mb-3">🛒</p>
              <p className="font-medium text-gray-600">No prices yet</p>
              <p className="text-sm mt-1">Add your first price entry to get started</p>
              <Link href="/add" className="mt-4 inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium shadow-sm">
                Add first item
              </Link>
            </div>
          ) : (
            items.map((item) => (
              <Link key={item.id} href={`/item/${item.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.category} · {item.stats?.count ?? 0} {(item.stats?.count ?? 0) === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                  {item.stats?.latest != null && (
                    <div className="text-right ml-3 shrink-0">
                      <p className="text-lg font-bold text-brand-600">
                        ${item.stats.latest.toFixed(2)}
                        <span className="text-xs font-normal text-gray-400">/{item.stats.canonicalUnit.replace("per ", "")}</span>
                      </p>
                      <p className="text-xs text-gray-400">latest</p>
                    </div>
                  )}
                </div>
                {item.stats && (
                  <div className="flex gap-4 mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                    <span>Avg <strong className="text-gray-700">${item.stats.avg.toFixed(2)}</strong></span>
                    <span>Best <strong className="text-green-600">${item.stats.min.toFixed(2)}</strong></span>
                    {item.stats.latestStore && (
                      <span className="ml-auto text-gray-400 truncate">
                        {item.stats.latestStore}
                        {item.stats.latestDate && ` · ${formatDate(item.stats.latestDate)}`}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

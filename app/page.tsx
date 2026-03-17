"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { DealResult } from "@/app/api/flyer-deals/route";
import { ItemCardSkeleton } from "@/components/Skeletons";
import { useToast } from "@/components/Toast";

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
  watched: boolean;
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

function formatValidTo(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

// Quick stats card component
function QuickStats({ items, deals }: { items: ItemSummary[]; deals: Map<number, DealResult> }) {
  const trackedWithPrices = items.filter((i) => i.stats);
  const totalEntries = trackedWithPrices.reduce((sum, i) => sum + (i.stats?.count ?? 0), 0);
  const activeDeals = Array.from(deals.values()).filter((d) => d.isCheaper).length;
  const watchedCount = items.filter((i) => i.watched).length;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
        <p className="text-2xl font-bold text-brand-600">{trackedWithPrices.length}</p>
        <p className="text-xs text-gray-500 mt-0.5">Tracked</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
        <p className="text-2xl font-bold text-green-600">{activeDeals}</p>
        <p className="text-xs text-gray-500 mt-0.5">Active deals</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
        <p className="text-2xl font-bold text-orange-500">{totalEntries}</p>
        <p className="text-xs text-gray-500 mt-0.5">Prices logged</p>
      </div>
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [dealsMap, setDealsMap] = useState<Map<number, DealResult>>(new Map());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<{ src: string; alt: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/items?stats=true")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data); })
      .catch(() => toast("Failed to load items", "error"))
      .finally(() => setItemsLoading(false));
  }, []);

  useEffect(() => {
    if (itemsLoading) return;
    fetch("/api/flyer-deals")
      .then((r) => r.json())
      .then((data: DealResult[]) => {
        if (!Array.isArray(data)) return;
        const map = new Map<number, DealResult>();
        data.forEach((d) => map.set(d.itemId, d));
        setDealsMap(map);
      })
      .catch(() => {});
  }, [itemsLoading]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (Array.isArray(data)) setResults(data);
    } catch {
      toast("Search failed", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Distinct categories derived from loaded items (sorted)
  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.category));
    return Array.from(cats).sort();
  }, [items]);

  // Apply category filter client-side
  const filteredItems = selectedCategory
    ? items.filter((i) => i.category === selectedCategory)
    : items;
  const filteredItemIds = useMemo(
    () => new Set(filteredItems.map((i) => i.id)),
    [filteredItems]
  );

  // Only show deals worth acting on:
  // - Green: confirmed cheaper (unit price comparison)
  // - Orange: advertised sale but can't compare units
  // - Hidden: no deal signal, or confirmed more expensive
  const flyerDeals = Array.from(dealsMap.values())
    .filter((d) => d.isCheaper)
    .filter((d) => filteredItemIds.has(d.itemId));

  return (
    <div className="px-4 py-4 space-y-4">
      {lightboxImg && (
        <div className="fixed inset-0 bg-black/70 z-[80]" onClick={() => setLightboxImg(null)}>
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" onClick={() => setLightboxImg(null)}>
            <img
              src={lightboxImg.src}
              alt={lightboxImg.alt}
              className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items…"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white shadow-sm text-base focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow focus:shadow-md"
          autoComplete="off"
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin">⟳</span>}
      </div>

      {/* Quick stats — only show when not searching */}
      {!query.trim() && !itemsLoading && items.length > 0 && (
        <QuickStats items={items} deals={dealsMap} />
      )}

      {/* Category filter chips — only show when not searching and there are multiple categories */}
      {!query.trim() && categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              selectedCategory === null
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-brand-300"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedCategory === cat
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-brand-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {query.trim() ? (
        /* ── Search results ── */
        <div className="space-y-2">
          {results.length === 0 && !loading ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-medium">No results for &quot;{query}&quot;</p>
              <Link href={`/add?item=${encodeURIComponent(query)}`}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium shadow-sm hover:bg-brand-700 transition-colors">
                <span>+</span> Add &quot;{query}&quot;
              </Link>
            </div>
          ) : (
            results.map((item) => {
              const latest = item.priceEntries[0];
              return (
                <Link key={item.id} href={`/item/${item.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-brand-200 transition-all active:scale-[0.98]">
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
        <div className="space-y-4">
          {/* ── Flyer Deals This Week ── */}
          {flyerDeals.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  🏷️ Deals this week
                </h2>
                <Link href="/flyer" className="text-xs text-brand-600 font-medium">Browse all →</Link>
              </div>
              {flyerDeals.slice(0, 5).map((deal) => {
                const unitsComparable = !!(
                  deal.normalUnitPrice !== null &&
                  deal.normalUnit &&
                  deal.flyerUnitPrice !== null &&
                  deal.flyerUnit === deal.normalUnit
                );
                return (
                  <Link key={deal.itemId} href={`/item/${deal.itemId}`}
                    className="block rounded-xl border p-4 hover:shadow-md transition-all bg-green-50 border-green-200 active:scale-[0.98]">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{deal.itemName}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {deal.bestDeal.name} · {deal.bestDeal.merchantName}
                        </p>
                        {deal.savingsPercent !== null && (
                          <p className="text-xs font-medium mt-0.5 text-green-700">
                            Save {deal.savingsPercent}% vs your normal price
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-green-700">
                          ${deal.bestDeal.currentPrice.toFixed(2)}
                        </p>
                        {deal.flyerUnitPrice !== null && deal.flyerUnit && (
                          <p className="text-xs text-gray-500">
                            ${deal.flyerUnitPrice.toFixed(2)}/{deal.flyerUnit.replace("per ", "")}
                          </p>
                        )}
                      </div>
                      {deal.bestDeal.imageUrl && (
                        <img
                          src={deal.bestDeal.imageUrl}
                          alt={deal.bestDeal.name}
                          className="w-12 h-12 rounded-lg object-cover shrink-0 bg-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
                          loading="lazy"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setLightboxImg({ src: deal.bestDeal.imageUrl!, alt: deal.bestDeal.name });
                          }}
                        />
                      )}
                    </div>
                    {unitsComparable && (
                      <div className="mt-2 pt-2 border-t border-green-100 flex items-center justify-between text-xs text-gray-500">
                        <span>Your normal{deal.normalStore ? ` (${deal.normalStore})` : ""}: <strong>${deal.normalUnitPrice!.toFixed(2)}/{deal.normalUnit!.replace("per ", "")}</strong></span>
                        {deal.bestDeal.validTo && (
                          <span>Until {formatValidTo(deal.bestDeal.validTo)}</span>
                        )}
                      </div>
                    )}
                    {!unitsComparable && deal.bestDeal.validTo && (
                      <p className="mt-2 pt-2 border-t border-green-100 text-xs text-right text-gray-400">
                        Until {formatValidTo(deal.bestDeal.validTo)}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {/* ── Your Items ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Your items {!itemsLoading && filteredItems.length > 0 && `(${filteredItems.length})`}
              </h2>
              <div className="flex items-center gap-3">
                <Link href="/history" className="text-sm text-brand-600 font-medium">History →</Link>
              </div>
            </div>

            {itemsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <ItemCardSkeleton key={i} />)}
              </div>
            ) : filteredItems.length === 0 ? (
              selectedCategory ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-2">📂</p>
                  <p className="font-medium text-gray-600">No {selectedCategory} items yet</p>
                  <button onClick={() => setSelectedCategory(null)} className="mt-2 text-sm text-brand-600 font-medium hover:underline">
                    Show all categories
                  </button>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-6xl mb-4">🛒</p>
                  <p className="font-semibold text-gray-600 text-lg">No prices yet</p>
                  <p className="text-sm mt-1 mb-6">Start tracking grocery prices to see if you&apos;re getting a good deal</p>
                  <div className="flex flex-col gap-3 items-center">
                    <Link href="/add" className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl font-medium shadow-sm hover:bg-brand-700 transition-colors">
                      ➕ Add your first price
                    </Link>
                    <Link href="/flyer" className="text-sm text-brand-600 font-medium hover:underline">
                      or browse this week&apos;s flyers →
                    </Link>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => {
                  const deal = dealsMap.get(item.id);
                  const hasDeal = deal?.isCheaper === true;
                  const isWatchOnly = item.watched && !item.stats;

                  if (isWatchOnly) {
                    return (
                      <Link key={item.id} href={`/item/${item.id}`}
                        className={`block bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all active:scale-[0.98] ${
                          hasDeal ? "border-green-200 bg-green-50/30" : "border-gray-200 border-dashed"
                        }`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900">{item.name}</p>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">⭐ Watching</span>
                              {hasDeal && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                  🏷️ On Flyer
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{item.category} · No prices yet</p>
                          </div>
                          {hasDeal && deal && (
                            <div className="text-right ml-3 shrink-0">
                              <p className="text-lg font-bold text-green-700">
                                ${deal.bestDeal.currentPrice.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-400">{deal.bestDeal.merchantName}</p>
                            </div>
                          )}
                        </div>
                        {hasDeal && deal && (
                          <div className="mt-2 pt-2 border-t border-green-100 text-xs">
                            <p className="font-medium text-green-700">
                              {deal.savingsPercent !== null
                                ? `Save ${deal.savingsPercent}% vs your normal price`
                                : "On sale this week"}
                            </p>
                          </div>
                        )}
                      </Link>
                    );
                  }

                  return (
                    <Link key={item.id} href={`/item/${item.id}`}
                      className={`block bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all active:scale-[0.98] ${
                        hasDeal ? "border-green-200 bg-green-50/30" : "border-gray-200"
                      }`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{item.name}</p>
                            {item.watched && <span className="text-xs text-gray-400">⭐</span>}
                            {hasDeal && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                🏷️ {deal!.savingsPercent ? `Save ${deal!.savingsPercent}%` : "On Sale"}
                              </span>
                            )}
                          </div>
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

                      {hasDeal && deal && (
                        <div className="mt-2 pt-2 border-t border-green-100 flex items-center justify-between text-xs">
                          <span className="font-medium truncate text-green-700">
                            {deal.bestDeal.merchantName} · ${deal.bestDeal.currentPrice.toFixed(2)}
                            {deal.bestDeal.unitPrice && deal.bestDeal.unit
                              ? ` · $${deal.bestDeal.unitPrice.toFixed(2)}/${deal.bestDeal.unit.replace("per ", "")}`
                              : ""}
                          </span>
                          {deal.savingsPercent !== null && deal.savingsPercent > 0 ? (
                            <span className="text-green-600 font-bold shrink-0 ml-2">↓{deal.savingsPercent}%</span>
                          ) : null}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

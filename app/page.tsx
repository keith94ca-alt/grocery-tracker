"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import type { DealResult } from "@/app/api/flyer-deals/route";
import { useToast } from "@/components/Toast";

interface PriceEntry {
  id: number;
  itemId: number;
  price: number;
  unitPrice: number;
  quantity: number;
  unit: string;
  store: string;
  source: string;
  date: string;
  item: { name: string; unit: string };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function formatValidTo(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
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

export default function HomePage() {
  const [deals, setDeals] = useState<DealResult[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [recentEntries, setRecentEntries] = useState<PriceEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [lightboxImg, setLightboxImg] = useState<{ src: string; alt: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [trackedItems, setTrackedItems] = useState<{ id: number; name: string; targetPrice: number | null }[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  function loadData() {
    // Load flyer deals
    fetch("/api/flyer-deals")
      .then((r) => r.json())
      .then((data: DealResult[]) => {
        if (Array.isArray(data)) setDeals(data);
      })
      .catch(() => {})
      .finally(() => setDealsLoading(false));

    // Load tracked items for price alerts
    fetch("/api/items")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTrackedItems(data);
      })
      .catch(() => {});

    // Load recent price entries
    fetch("/api/prices?limit=10")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRecentEntries(data);
      })
      .catch(() => {})
      .finally(() => setEntriesLoading(false));
  }

  function refreshData() {
    setIsRefreshing(true);
    setDealsLoading(true);
    setEntriesLoading(true);
    loadData();
    setTimeout(() => setIsRefreshing(false), 800);
  }

  useEffect(() => { loadData(); }, []);

  // Pull-to-refresh touch handlers
  function handleTouchStart(e: React.TouchEvent) {
    const y = e.touches[0].clientY;
    const atTop = containerRef.current?.scrollTop === 0 || (containerRef.current?.scrollTop ?? 0) < 5;
    if (atTop) {
      touchStartRef.current = { y, time: Date.now() };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const delta = e.touches[0].clientY - touchStartRef.current.y;
    if (delta > 0 && delta < 150) {
      setPullDistance(delta);
    }
  }

  function handleTouchEnd() {
    if (pullDistance > 80) {
      refreshData();
      toast("Refreshing…", "info", 1500);
    }
    setPullDistance(0);
    touchStartRef.current = null;
  }

  // Search with recent searches
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("recent-searches") || "[]"); } catch { return []; }
  });

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (Array.isArray(data)) setSearchResults(data);
      // Save to recent searches
      setRecentSearches((prev) => {
        const next = [q, ...prev.filter((s) => s !== q)].slice(0, 8);
        try { localStorage.setItem("recent-searches", JSON.stringify(next)); } catch {}
        return next;
      });
    } catch {
      toast("Search failed", "error");
    } finally {
      setSearchLoading(false);
    }
  }, [toast]);

  const activeDeals = deals.filter((d) => d.isCheaper || !d.normalUnitPrice);

  return (
    <div ref={containerRef} className="px-4 py-4 space-y-6"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}>
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div className="flex items-center justify-center py-3 transition-all duration-200"
          style={{ height: isRefreshing ? 48 : Math.min(pullDistance, 80), opacity: isRefreshing ? 1 : Math.min(pullDistance / 80, 1) }}>
          <span className={`text-sm font-medium text-gray-500 ${isRefreshing ? "animate-spin" : ""}`}>
            {isRefreshing ? "⟳ Refreshing…" : pullDistance > 80 ? "Release to refresh" : "↓ Pull to refresh"}
          </span>
        </div>
      )}
      {lightboxImg && (
        <div className="fixed inset-0 bg-black/70 z-[80]" onClick={() => setLightboxImg(null)}>
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" onClick={() => setLightboxImg(null)}>
            <img src={lightboxImg.src} alt={lightboxImg.alt}
              className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input type="search" value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); doSearch(e.target.value); }}
          placeholder="Search items…"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 shadow-sm text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          autoComplete="off" />
        {searchLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin">⟳</span>}
      </div>

      {/* Search results */}
      {searchQuery.trim() ? (
        <div className="space-y-2">
          {searchResults.length === 0 && !searchLoading ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-medium">No results for &quot;{searchQuery}&quot;</p>
              <Link href={`/add?item=${encodeURIComponent(searchQuery)}`}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium shadow-sm hover:bg-brand-700 transition-colors">
                <span>+</span> Add &quot;{searchQuery}&quot;
              </Link>
            </div>
          ) : (
            searchResults.map((item) => {
              const latest = item.priceEntries[0];
              return (
                <Link key={item.id} href={`/item/${item.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-brand-200 transition-all active:scale-[0.98]">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{item.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.category} · {item._count.priceEntries} {item._count.priceEntries === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    {latest && (
                      <div className="text-right">
                        <p className="text-lg font-bold text-brand-600">
                          ${latest.unitPrice.toFixed(2)}
                          <span className="text-xs font-normal text-gray-500">/{item.unit}</span>
                        </p>
                      </div>
                    )}
                  </div>
                  {item.stats && (
                    <div className="flex gap-4 mt-2 text-xs text-gray-600 border-t border-gray-100 pt-2">
                      <span>Avg: <strong>${item.stats.avg.toFixed(2)}</strong></span>
                      <span>Low: <strong className="text-green-600">${item.stats.min.toFixed(2)}</strong></span>
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      ) : (
      <>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        <Link href="/add"
          className="flex flex-col items-center gap-1 py-3 bg-brand-50 rounded-xl text-brand-700 hover:bg-brand-100 transition-colors">
          <span className="text-xl">➕</span>
          <span className="text-xs font-medium">Add</span>
        </Link>
        <Link href="/list"
          className="flex flex-col items-center gap-1 py-3 bg-gray-50 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors">
          <span className="text-xl">🛒</span>
          <span className="text-xs font-medium">List</span>
        </Link>
        <Link href="/flyer"
          className="flex flex-col items-center gap-1 py-3 bg-orange-50 rounded-xl text-orange-700 hover:bg-orange-100 transition-colors">
          <span className="text-xl">🏷️</span>
          <span className="text-xs font-medium">Flyer</span>
        </Link>
        <Link href="/stores"
          className="flex flex-col items-center gap-1 py-3 bg-blue-50 rounded-xl text-blue-700 hover:bg-blue-100 transition-colors">
          <span className="text-xl">🏪</span>
          <span className="text-xs font-medium">Stores</span>
        </Link>
      </div>

      {/* Price Alerts */}
      {(() => {
        // Check if any deals beat target prices
        const alerts: { deal: DealResult; targetPrice: number }[] = [];
        for (const deal of activeDeals) {
          const item = trackedItems.find(i => i.name.toLowerCase() === deal.itemName.toLowerCase());
          if (item?.targetPrice && deal.flyerUnitPrice && deal.flyerUnit) {
            // Compare normalized prices
            const targetNorm = item.targetPrice;
            if (deal.flyerUnitPrice <= targetNorm) {
              alerts.push({ deal, targetPrice: targetNorm });
            }
          }
        }
        if (alerts.length === 0) return null;
        return (
          <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-amber-800 uppercase tracking-wide">🎯 Price Alerts</h2>
            <p className="text-xs text-amber-700">These items are below your target price this week!</p>
            {alerts.map(({ deal, targetPrice }) => (
              <Link key={deal.itemId} href={`/item/${deal.itemId}`}
                className="flex items-center justify-between bg-white rounded-lg px-3 py-2 hover:shadow-sm transition-shadow">
                <span className="text-sm font-medium text-gray-900">{deal.itemName}</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-green-700">${deal.flyerUnitPrice?.toFixed(2)}</span>
                  <span className="text-xs text-gray-400 ml-1">target: ${targetPrice.toFixed(2)}</span>
                </div>
              </Link>
            ))}
          </section>
        );
      })()}

      {/* Deals This Week */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">🏷️ Deals This Week</h2>
          <Link href="/flyer" className="text-xs text-brand-600 dark:text-brand-400 font-medium">Browse all →</Link>
        </div>
        {dealsLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="shrink-0 w-48 bg-white rounded-xl border border-gray-200 p-3 space-y-2 animate-pulse">
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
                <div className="h-6 w-1/2 bg-gray-200 rounded" />
                <div className="h-3 w-2/3 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : activeDeals.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-xl">
            <p className="text-gray-400 text-sm">No flyer deals matching your items this week</p>
            <Link href="/flyer" className="text-xs text-brand-600 font-medium mt-1 inline-block">
              Browse all flyers →
            </Link>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
            {activeDeals.slice(0, 8).map((deal) => {
              const hasComparison = deal.normalUnitPrice !== null;
              return (
                <Link key={deal.itemId} href={`/item/${deal.itemId}`}
                  className="shrink-0 w-52 bg-green-50 rounded-xl border border-green-200 p-3 space-y-1 hover:shadow-md transition-shadow active:scale-[0.98]">
                  <div className="flex items-center gap-1.5">
                    {deal.bestDeal.imageUrl && (
                      <img src={deal.bestDeal.imageUrl} alt={deal.bestDeal.name}
                        className="w-8 h-8 rounded object-cover shrink-0 bg-white cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setLightboxImg({ src: deal.bestDeal.imageUrl!, alt: deal.bestDeal.name });
                        }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{deal.itemName}</p>
                      <p className="text-xs text-gray-500 truncate">{deal.bestDeal.merchantName}</p>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-green-700">${deal.bestDeal.currentPrice.toFixed(2)}</span>
                    {deal.flyerUnitPrice && (
                      <span className="text-xs text-gray-500">${deal.flyerUnitPrice.toFixed(2)}/{deal.flyerUnit?.replace("per ", "")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {deal.savingsPercent && deal.savingsPercent > 0 ? (
                      <span className="text-xs font-semibold text-green-600">↓{deal.savingsPercent}% vs normal</span>
                    ) : hasComparison ? (
                      <span className="text-xs text-gray-400">≈ your normal price</span>
                    ) : (
                      <span className="text-xs text-green-600 font-medium">On flyer</span>
                    )}
                    {deal.bestDeal.validTo && (
                      <span className="text-xs text-gray-400 ml-auto">until {formatValidTo(deal.bestDeal.validTo)}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">📊 Recent Activity</h2>
          <Link href="/history" className="text-xs text-brand-600 dark:text-brand-400 font-medium">All entries →</Link>
        </div>
        {entriesLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-4 w-32 bg-gray-200 rounded" />
                  <div className="h-4 w-16 bg-gray-200 rounded" />
                </div>
                <div className="h-3 w-24 bg-gray-200 rounded mt-2" />
              </div>
            ))}
          </div>
        ) : recentEntries.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-xl">
            <p className="text-gray-400 text-sm">No price entries yet</p>
            <Link href="/add" className="text-xs text-brand-600 font-medium mt-1 inline-block">
              Add your first price →
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentEntries.slice(0, 5).map((entry) => (
              <Link key={entry.id} href={`/item/${entry.itemId}`}
                className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 hover:shadow-sm transition-shadow active:scale-[0.98]">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{entry.item.name}</p>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mt-0.5">{entry.store} · {timeAgo(entry.date)}</p>
                </div>
                <span className="text-sm font-bold text-brand-600 dark:text-brand-500 shrink-0 ml-3">
                  ${entry.unitPrice.toFixed(2)}
                  <span className="text-xs font-normal text-gray-400">/{entry.unit.replace("per ", "")}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Browse Items */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">📦 Your Items</h2>
          <Link href="/items" className="text-xs text-brand-600 dark:text-brand-400 font-medium">Manage →</Link>
        </div>
        <Link href="/items"
          className="block text-center py-4 bg-white rounded-xl border border-gray-200 hover:shadow-sm transition-shadow text-sm text-gray-500 hover:text-brand-600">
          Browse all tracked items →
        </Link>
      </section>
      </>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { convertUnitPrice, sameUnitGroup } from "@/lib/units";
import type { DealResult } from "@/app/api/flyer-deals/route";
import type { FlippItem } from "@/lib/flipp";
import PriceChart from "@/components/PriceChart";
import { useToast } from "@/components/Toast";

interface PriceEntry {
  id: number;
  price: number;
  quantity: number;
  unitPrice: number;
  unit: string;
  store: string;
  source: string | null;
  date: string;
  notes: string | null;
}

interface ItemDetail {
  id: number;
  name: string;
  category: string;
  unit: string;
  targetPrice: number | null;
  priceEntries: PriceEntry[];
  stats: {
    avg: number;
    min: number;
    max: number;
    latest: number;
    latestDate: string;
    latestStore: string;
    canonicalUnit: string;
  } | null;
}

// ── Image lightbox ─────────────────────────────────────────────────────────────

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-[80]" onClick={onClose} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" onClick={onClose}>
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </>
  );
}

function DealIndicator({ price, unit, avg, canonicalUnit }: { price: number; unit: string; avg: number; canonicalUnit: string }) {
  const converted = convertUnitPrice(price, unit, canonicalUnit) ?? price;
  const ratio = converted / avg;
  if (ratio <= 0.9) return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
      <p className="text-3xl">🟢</p>
      <p className="font-bold text-green-800 mt-1">Great Deal!</p>
      <p className="text-sm text-green-700">{Math.round((1 - ratio) * 100)}% below your average</p>
    </div>
  );
  if (ratio <= 1.1) return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
      <p className="text-3xl">🟡</p>
      <p className="font-bold text-yellow-800 mt-1">Average Price</p>
      <p className="text-sm text-yellow-700">Within 10% of your average</p>
    </div>
  );
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
      <p className="text-3xl">🔴</p>
      <p className="font-bold text-red-800 mt-1">Above Average</p>
      <p className="text-sm text-red-700">{Math.round((ratio - 1) * 100)}% above your average</p>
    </div>
  );
}

// ── All Deals Modal ───────────────────────────────────────────────────────────

function AllDealsModal({ deals, onClose }: { deals: FlippItem[]; onClose: () => void }) {
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  return (
    <>
      {lightboxImg && (
        <ImageLightbox src={lightboxImg} alt="" onClose={() => setLightboxImg(null)} />
      )}
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">🏷️ All Flyer Deals</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
            {deals.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No flyer deals found this week</p>
            ) : (
              deals.map((d) => {
                const validTo = d.validTo
                  ? new Date(d.validTo).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
                  : null;
                const validFrom = d.validFrom
                  ? new Date(d.validFrom).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
                  : null;
                const flippUrl = d.pageUrl ?? `https://flipp.com/search?q=${encodeURIComponent(d.name)}`;
                return (
                  <div key={d.id} className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex gap-3 items-start">
                    {d.imageUrl && (
                      <img
                        src={d.imageUrl}
                        alt={d.name}
                        className="w-14 h-14 rounded-lg object-cover shrink-0 bg-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
                        loading="lazy"
                        onClick={() => setLightboxImg(d.imageUrl!)}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm leading-snug">{d.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{d.merchantName}</p>
                      {d.saleStory && <p className="text-xs text-orange-600 font-medium mt-0.5">{d.saleStory}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        {validTo && (
                          <p className="text-xs text-gray-400">
                            {validFrom ? `${validFrom} – ${validTo}` : `Until ${validTo}`}
                          </p>
                        )}
                        <a
                          href={flippUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-600 underline font-medium"
                        >
                          View on Flipp →
                        </a>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-gray-900">${d.currentPrice.toFixed(2)}</p>
                      {d.unitPrice && d.unit && (
                        <p className="text-xs text-gray-500">${d.unitPrice.toFixed(2)}/{d.unit.replace("per ", "")}</p>
                      )}
                      {d.postPriceText && !d.unitPrice && (
                        <p className="text-xs text-gray-500">/${d.postPriceText.replace(/^\/?\s*/, "").toLowerCase()}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="px-5 py-3 border-t border-gray-100">
            <button onClick={onClose} className="w-full py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function FlyerDealBanner({ deal, onViewAll }: { deal: DealResult; onViewAll: () => void }) {
  const { bestDeal, latestUnitPrice, latestUnit, savingsPercent, isCheaper,
          flyerUnitPrice, flyerUnit, allDeals } = deal;
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const validFrom = bestDeal.validFrom
    ? new Date(bestDeal.validFrom).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : null;
  const validTo = bestDeal.validTo
    ? new Date(bestDeal.validTo).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : null;
  const flippUrl = bestDeal.pageUrl ?? `https://flipp.com/search?q=${encodeURIComponent(bestDeal.name)}`;

  // Colour scheme: green = confirmed cheaper, gray = unknown/not cheaper
  const colour = isCheaper
    ? { bg: "bg-green-50", border: "border-green-200", heading: "text-green-800",
        price: "text-green-700", divider: "border-green-100" }
    : { bg: "bg-gray-50", border: "border-gray-200", heading: "text-gray-700",
        price: "text-gray-800", divider: "border-gray-100" };

  const canCompare = flyerUnitPrice !== null && latestUnitPrice !== null && flyerUnit === latestUnit;

  return (
    <>
    {lightboxImg && (
      <ImageLightbox src={lightboxImg} alt={bestDeal.name} onClose={() => setLightboxImg(null)} />
    )}
    <div className={`rounded-xl border p-4 ${colour.bg} ${colour.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-bold ${colour.heading}`}>
              🏷️ {isCheaper ? "On Sale This Week!" : "On Flyer This Week"}
            </p>
            <a
              href={flippUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-600 underline font-medium"
            >
              View on Flipp →
            </a>
          </div>
          <p className="text-sm text-gray-700 mt-1 font-medium truncate">{bestDeal.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{bestDeal.merchantName}</p>
        </div>
        <div className="flex items-start gap-3 shrink-0">
          {bestDeal.imageUrl && (
            <img
              src={bestDeal.imageUrl}
              alt={bestDeal.name}
              className="w-14 h-14 rounded-lg object-cover bg-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
              loading="lazy"
              onClick={() => setLightboxImg(bestDeal.imageUrl!)}
            />
          )}
          <div className="text-right">
            <p className={`text-xl font-bold ${colour.price}`}>
              ${bestDeal.currentPrice.toFixed(2)}
            </p>
            {/* Show the normalised per-kg/L price if we have it */}
            {flyerUnitPrice !== null && flyerUnit && (
              <p className="text-xs text-gray-500 font-medium">
                ${flyerUnitPrice.toFixed(2)}/{flyerUnit.replace("per ", "")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={`mt-3 pt-3 border-t ${colour.divider} flex items-center justify-between text-xs flex-wrap gap-2`}>
        <div className="flex gap-3 flex-wrap">
          {canCompare && (
            <span className="text-gray-500">
              Your last:{" "}
              <strong className="text-gray-700">
                ${latestUnitPrice!.toFixed(2)}/{latestUnit!.replace("per ", "")}
              </strong>
            </span>
          )}
          {isCheaper && savingsPercent !== null && savingsPercent > 0 && (
            <span className="text-green-600 font-bold">Save {savingsPercent}% vs your last price</span>
          )}
          {flyerUnitPrice === null && (
            <span className="text-gray-400">
              Unit price unknown — open Flyer tab to log weight
            </span>
          )}
        </div>
        {validTo && (
          <span className="text-gray-400">
            {validFrom ? `Valid ${validFrom} – ${validTo}` : `Until ${validTo}`}
          </span>
        )}
      </div>

      {/* See all deals button */}
      {allDeals && allDeals.length > 1 && (
        <button
          onClick={onViewAll}
          className="mt-2 w-full py-2 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
        >
          See all {allDeals.length} flyer deals →
        </button>
      )}
    </div>
    </>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

export default function ItemPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deal, setDeal] = useState<DealResult | null>(null);
  const [allDeals, setAllDeals] = useState<FlippItem[]>([]);
  const [showDealsModal, setShowDealsModal] = useState(false);
  const [undoStack, setUndoStack] = useState<{ entry: PriceEntry; index: number }[]>([]);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("");

  useEffect(() => {
    fetch(`/api/items/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setItem(data);
      })
      .catch(() => setError("Failed to load item"))
      .finally(() => setLoading(false));
  }, [params.id]);

  // Load flyer deal in the background
  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/flyer-deals?itemId=${params.id}`)
      .then((r) => r.json())
      .then((data: DealResult[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setDeal(data[0]);
          setAllDeals(data[0].allDeals ?? []);
        }
      })
      .catch(() => {});
  }, [params.id]);

  async function saveTargetPrice(price: number | null) {
    try {
      const res = await fetch(`/api/items/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPrice: price }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItem((prev) => prev ? { ...prev, targetPrice: updated.targetPrice } : prev);
        toast(price ? `Target price set to $${price.toFixed(2)}` : "Target price cleared", "success");
      }
    } catch {
      toast("Failed to save target price", "error");
    }
    setEditingTarget(false);
  }

  async function deleteEntry(entryId: number) {
    setDeletingId(entryId);
    // Save for undo
    const entry = item?.priceEntries.find((e) => e.id === entryId);
    try {
      const res = await fetch(`/api/prices/${entryId}`, { method: "DELETE" });
      if (res.ok && entry) {
        setItem((prev) =>
          prev ? { ...prev, priceEntries: prev.priceEntries.filter((e) => e.id !== entryId) } : prev
        );
        toast("Entry deleted", "info", 5000);
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return (
    <div className="px-4 py-8 text-center text-gray-500">
      <div className="text-4xl animate-pulse">⏳</div>
      <p className="mt-2">Loading…</p>
    </div>
  );

  if (error || !item) return (
    <div className="px-4 py-8 text-center">
      <p className="text-4xl mb-2">😕</p>
      <p className="text-gray-600">{error || "Item not found"}</p>
      <button onClick={() => router.back()} className="mt-4 text-brand-600 font-medium">← Go back</button>
    </div>
  );

  const latest = item.priceEntries[0];
  const canonicalUnit = item.stats?.canonicalUnit ?? item.unit;

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 mt-1 text-xl">←</button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{item.name}</h2>
          <p className="text-sm text-gray-500">{item.category}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              try {
                const raw = localStorage.getItem("grocery-shopping-list");
                const list: { id: string; name: string; checked: boolean; category: string; addedAt: number }[] = raw ? JSON.parse(raw) : [];
                if (!list.some((i) => i.name.toLowerCase() === item.name.toLowerCase() && !i.checked)) {
                  list.unshift({
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    name: item.name,
                    checked: false,
                    category: item.category,
                    addedAt: Date.now(),
                  });
                  localStorage.setItem("grocery-shopping-list", JSON.stringify(list));
                }
              } catch { /* ignore */ }
            }}
            className="px-3 py-1.5 bg-gray-100 hover:bg-brand-100 text-gray-700 hover:text-brand-700 rounded-lg text-sm font-medium transition-colors"
            title="Add to shopping list"
          >
            🛒
          </button>
          <Link href={`/add?item=${encodeURIComponent(item.name)}`}
            className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-medium">
            + Add
          </Link>
        </div>
      </div>

      {/* Flyer deal banner — appears when Flipp has a match */}
      {deal && <FlyerDealBanner deal={deal} onViewAll={() => setShowDealsModal(true)} />}

      {/* Target price */}
      {editingTarget ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-blue-800">Set your target price per {canonicalUnit.replace("per ", "")}</p>
          <div className="flex gap-2">
            <input
              type="number"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder={item.targetPrice?.toFixed(2) || "0.00"}
              step="0.01"
              min="0"
              inputMode="decimal"
              autoFocus
              className="flex-1 px-3 py-2 border border-blue-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={() => saveTargetPrice(parseFloat(targetInput) || null)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">
              Save
            </button>
            <button onClick={() => setEditingTarget(false)}
              className="px-4 py-2 border border-blue-300 text-blue-700 rounded-xl text-sm font-medium">
              ✕
            </button>
          </div>
          {item.targetPrice && (
            <p className="text-xs text-blue-600">Current target: ${item.targetPrice.toFixed(2)}/{canonicalUnit.replace("per ", "")}</p>
          )}
        </div>
      ) : item.targetPrice && item.stats ? (() => {
        const latestUnit = latest?.unitPrice ?? 0;
        const belowTarget = latestUnit > 0 && latestUnit <= item.targetPrice;
        const pctDiff = latestUnit > 0 ? ((latestUnit - item.targetPrice) / item.targetPrice * 100).toFixed(1) : null;
        return (
          <div
            onClick={() => { setEditingTarget(true); setTargetInput(item.targetPrice!.toFixed(2)); }}
            className={`rounded-xl border p-3 cursor-pointer transition-colors ${
              belowTarget
                ? "bg-green-50 border-green-200"
                : "bg-orange-50 border-orange-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  🎯 Target: <strong>${item.targetPrice.toFixed(2)}/{canonicalUnit.replace("per ", "")}</strong>
                </p>
                {pctDiff !== null && (
                  <p className={`text-xs font-medium mt-0.5 ${belowTarget ? "text-green-700" : "text-orange-700"}`}>
                    {belowTarget
                      ? `✅ ${Math.abs(parseFloat(pctDiff)).toFixed(0)}% below your target!`
                      : `📈 ${parseFloat(pctDiff).toFixed(0)}% above your target`}
                  </p>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); saveTargetPrice(null); }}
                className="text-gray-400 hover:text-red-500 text-sm"
                title="Remove target"
              >
                ×
              </button>
            </div>
          </div>
        );
      })() : !editingTarget && !item.targetPrice && item.stats ? (
        <button
          onClick={() => setEditingTarget(true)}
          className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-brand-300 hover:text-brand-600 transition-colors"
        >
          🎯 Set a target price
        </button>
      ) : null}

      {/* Deal indicator (latest manual entry vs own historical average) */}
      {item.stats && latest && item.priceEntries.length >= 3 && (
        <DealIndicator
          price={latest.unitPrice}
          unit={latest.unit || item.unit}
          avg={item.stats.avg}
          canonicalUnit={canonicalUnit}
        />
      )}

      {/* Stats grid */}
      {item.stats && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Latest", value: `$${item.stats.latest?.toFixed(2) ?? "—"}`, sub: item.stats.latestStore, color: "text-brand-600" },
            { label: "Average", value: `$${item.stats.avg.toFixed(2)}`, sub: `${item.priceEntries.length} entries`, color: "text-gray-900" },
            { label: "Lowest ever", value: `$${item.stats.min.toFixed(2)}`, sub: canonicalUnit, color: "text-green-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 truncate">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {item.stats && (
        <p className="text-xs text-center text-gray-400">
          Stats normalized to <strong>{canonicalUnit}</strong> for fair comparison
        </p>
      )}

      {/* Price trend chart */}
      {item.priceEntries.length >= 2 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Price Trend
          </h3>
          <PriceChart entries={item.priceEntries} />
        </div>
      )}

      {/* Store comparison */}
      {item.priceEntries.length >= 2 && (() => {
        // Group by store, compute average unit price per store
        const storeMap = new Map<string, { total: number; count: number; best: number }>();
        item.priceEntries.forEach((entry) => {
          const store = entry.store || "Unknown";
          const existing = storeMap.get(store) || { total: 0, count: 0, best: Infinity };
          existing.total += entry.unitPrice;
          existing.count += 1;
          existing.best = Math.min(existing.best, entry.unitPrice);
          storeMap.set(store, existing);
        });

        if (storeMap.size < 2) return null;

        const storeStats = Array.from(storeMap.entries())
          .map(([store, data]) => ({
            store,
            avg: data.total / data.count,
            best: data.best,
            count: data.count,
          }))
          .sort((a, b) => a.best - b.best);

        const cheapestStore = storeStats[0];

        return (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              🏪 Store Comparison
            </h3>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {storeStats.map((s, idx) => (
                <div
                  key={s.store}
                  className={`flex items-center justify-between px-4 py-3 ${
                    idx === 0 ? "bg-green-50" : ""
                  } ${idx < storeStats.length - 1 ? "border-b border-gray-100" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {idx === 0 && <span className="text-sm">👑</span>}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.store}</p>
                      <p className="text-xs text-gray-400">{s.count} {s.count === 1 ? "entry" : "entries"}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${idx === 0 ? "text-green-700" : "text-gray-700"}`}>
                      ${s.best.toFixed(2)}
                      <span className="text-xs font-normal text-gray-400"> best</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      ${s.avg.toFixed(2)} avg
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-center text-gray-400 mt-1">
              Cheapest: <strong className="text-green-600">{cheapestStore.store}</strong> at ${cheapestStore.best.toFixed(2)}/{canonicalUnit.replace("per ", "")}
            </p>
          </div>
        );
      })()}

      {/* Price history */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Price History ({item.priceEntries.length})
        </h3>
        {item.priceEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Link href={`/add?item=${encodeURIComponent(item.name)}`} className="text-brand-600 font-medium">
              Add first price →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {item.priceEntries.map((entry, idx) => {
              const entryUnit = entry.unit || item.unit;
              const converted = sameUnitGroup(entryUnit, canonicalUnit) && entryUnit !== canonicalUnit
                ? convertUnitPrice(entry.unitPrice, entryUnit, canonicalUnit)
                : null;
              const isFlyer = entry.source === "flyer";
              const flyerExpired = isFlyer &&
                new Date(entry.date).getTime() + 7 * 24 * 60 * 60 * 1000 < Date.now();
              return (
                <div key={entry.id}
                  className={`bg-white rounded-xl border p-4 flex justify-between items-start gap-3 ${idx === 0 ? "border-brand-200 shadow-sm" : "border-gray-200"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">
                        ${entry.unitPrice.toFixed(2)}/{entryUnit}
                      </p>
                      {converted !== null && (
                        <span className="text-xs text-gray-400">
                          = ${converted.toFixed(2)}/{canonicalUnit}
                        </span>
                      )}
                      {idx === 0 && (
                        <span className="text-xs px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded font-medium">latest</span>
                      )}
                      {isFlyer && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          flyerExpired
                            ? "bg-gray-100 text-gray-400"
                            : "bg-orange-100 text-orange-700"
                        }`}>
                          {flyerExpired ? "flyer (expired)" : "🏷️ flyer deal"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 font-medium">{entry.store}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(entry.date)}</p>
                    {entry.quantity !== 1 && (
                      <p className="text-xs text-gray-400">${entry.price.toFixed(2)} for {entry.quantity} {entryUnit}</p>
                    )}
                    {entry.notes && <p className="text-xs text-gray-500 mt-1 italic">{entry.notes}</p>}
                  </div>
                  <button onClick={() => deleteEntry(entry.id)} disabled={deletingId === entry.id}
                    className="text-gray-300 hover:text-red-400 text-xl leading-none transition-colors disabled:opacity-50"
                    title="Delete entry">
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All Flyer Deals Modal */}
      {showDealsModal && <AllDealsModal deals={allDeals} onClose={() => setShowDealsModal(false)} />}
    </div>
  );
}

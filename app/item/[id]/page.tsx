"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { convertUnitPrice, sameUnitGroup } from "@/lib/units";
import type { DealResult } from "@/app/api/flyer-deals/route";

interface PriceEntry {
  id: number;
  price: number;
  quantity: number;
  unitPrice: number;
  unit: string;
  store: string;
  date: string;
  notes: string | null;
}

interface ItemDetail {
  id: number;
  name: string;
  category: string;
  unit: string;
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

function FlyerDealBanner({ deal }: { deal: DealResult }) {
  const { bestDeal, latestUnitPrice, latestUnit, savingsPercent, isCheaper,
          flyerUnitPrice, flyerUnit } = deal;
  const validTo = bestDeal.validTo
    ? new Date(bestDeal.validTo).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : null;
  const flippSearchUrl = `https://flipp.com/search?q=${encodeURIComponent(bestDeal.name)}`;

  // Colour scheme: green = confirmed cheaper, orange = on sale / can't compare, gray = unknown
  const colour = isCheaper
    ? { bg: "bg-green-50", border: "border-green-200", heading: "text-green-800",
        price: "text-green-700", divider: "border-green-100" }
    : bestDeal.saleStory
    ? { bg: "bg-orange-50", border: "border-orange-200", heading: "text-orange-800",
        price: "text-orange-700", divider: "border-orange-100" }
    : { bg: "bg-gray-50", border: "border-gray-200", heading: "text-gray-700",
        price: "text-gray-800", divider: "border-gray-100" };

  const canCompare = flyerUnitPrice !== null && latestUnitPrice !== null && flyerUnit === latestUnit;

  return (
    <div className={`rounded-xl border p-4 ${colour.bg} ${colour.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-bold ${colour.heading}`}>
              🏷️ {isCheaper ? "On Sale This Week!" : "On Flyer This Week"}
            </p>
            <a
              href={flippSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-600 underline font-medium"
            >
              View on Flipp →
            </a>
          </div>
          <p className="text-sm text-gray-700 mt-1 font-medium truncate">{bestDeal.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{bestDeal.merchantName}</p>
          {bestDeal.saleStory && (
            <p className="mt-1 text-xs text-orange-600 font-medium">{bestDeal.saleStory}</p>
          )}
        </div>
        <div className="text-right shrink-0">
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
            <span className="text-green-600 font-bold">Save {savingsPercent}%</span>
          )}
          {!isCheaper && canCompare && (
            <span className="text-gray-400">Above your tracked price</span>
          )}
          {flyerUnitPrice === null && (
            <span className="text-gray-400">
              Unit price unknown — open Flyer tab to log weight
            </span>
          )}
        </div>
        {validTo && <span className="text-gray-400">Valid until {validTo}</span>}
      </div>
    </div>
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
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deal, setDeal] = useState<DealResult | null>(null);

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
        if (Array.isArray(data) && data.length > 0) setDeal(data[0]);
      })
      .catch(() => {});
  }, [params.id]);

  async function deleteEntry(entryId: number) {
    setDeletingId(entryId);
    try {
      const res = await fetch(`/api/prices/${entryId}`, { method: "DELETE" });
      if (res.ok) {
        setItem((prev) =>
          prev ? { ...prev, priceEntries: prev.priceEntries.filter((e) => e.id !== entryId) } : prev
        );
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
        <Link href={`/add?item=${encodeURIComponent(item.name)}`}
          className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-medium">
          + Add
        </Link>
      </div>

      {/* Flyer deal banner — appears when Flipp has a match */}
      {deal && <FlyerDealBanner deal={deal} />}

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
    </div>
  );
}

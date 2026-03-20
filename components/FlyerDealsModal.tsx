"use client";

import { useState } from "react";

export interface FlyerDealEntry {
  id?: number;
  name: string;
  currentPrice: number;
  merchantName: string;
  unitPrice: number | null;
  unit: string | null;
  saleStory: string | null;
  validTo: string | null;
  imageUrl: string | null;
}

interface Props {
  itemName: string;
  deals: FlyerDealEntry[];
  onClose: () => void;
}

function formatValidTo(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function getExpiryBadge(validTo: string | null): string | null {
  if (!validTo) return null;
  const hoursLeft = (new Date(validTo).getTime() - Date.now()) / 3600000;
  if (hoursLeft < 0) return null;
  if (hoursLeft <= 24) return "last day";
  if (hoursLeft <= 48) return "ends tomorrow";
  return null;
}

export default function FlyerDealsModal({ itemName, deals, onClose }: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [addedToList, setAddedToList] = useState<Set<number>>(new Set());
  const [addingToList, setAddingToList] = useState<Set<number>>(new Set());

  async function addToShoppingList(d: FlyerDealEntry, idx: number) {
    const key = d.id ?? idx;
    setAddingToList((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: itemName, category: "Other" }),
      });
      if (res.ok) {
        setAddedToList((prev) => new Set(prev).add(key));
      }
    } catch {
      // Silently ignore
    } finally {
      setAddingToList((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />

      {lightbox && (
        <>
          <div className="fixed inset-0 bg-black/80 z-[80]" onClick={() => setLightbox(null)} />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
            <img src={lightbox} alt="Flyer deal"
              className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()} />
          </div>
        </>
      )}

      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
          <div className="px-5 pt-5 pb-2 border-b border-gray-100">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-bold text-gray-900">
                🏷️ Flyer deals for <span className="text-brand-600">{itemName}</span>
              </h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{deals.length} deal{deals.length !== 1 ? "s" : ""} found this week</p>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
            {deals.map((d, i) => {
              const expiryBadge = getExpiryBadge(d.validTo);
              const key = d.id ?? i;
              const isAdded = addedToList.has(key);
              const isAdding = addingToList.has(key);
              return (
              <div key={key} className="bg-gray-50 rounded-xl p-3 flex gap-3 items-start">
                {d.imageUrl ? (
                  <img
                    src={d.imageUrl}
                    alt={d.name}
                    className="w-20 h-20 rounded-xl object-cover shrink-0 bg-white cursor-pointer hover:opacity-80 transition-opacity shadow-sm"
                    onClick={() => setLightbox(d.imageUrl!)}
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-gray-200 shrink-0 flex items-center justify-center text-2xl">🏷️</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{d.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{d.merchantName}</p>
                  {d.saleStory && <p className="text-xs text-orange-600 font-medium mt-0.5">{d.saleStory}</p>}
                  <div className="flex items-center gap-2 mt-0.5">
                    {d.validTo && <p className="text-xs text-gray-400">Until {formatValidTo(d.validTo)}</p>}
                    {expiryBadge && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                        ⏰ {expiryBadge}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div>
                      <span className="text-lg font-bold text-green-700">${d.currentPrice.toFixed(2)}</span>
                      {d.unitPrice && d.unit && (
                        <span className="text-xs text-gray-500 ml-1">(${d.unitPrice.toFixed(2)}/{d.unit.replace("per ", "")})</span>
                      )}
                    </div>
                    {isAdded ? (
                      <span className="text-xs text-green-600 font-semibold">✓ Added to list</span>
                    ) : (
                      <button
                        onClick={() => addToShoppingList(d, i)}
                        disabled={isAdding}
                        className="text-xs px-2 py-1 bg-brand-50 text-brand-700 rounded-lg font-medium hover:bg-brand-100 transition-colors disabled:opacity-50"
                      >
                        {isAdding ? "Adding…" : "🛒 Add to list"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="px-5 pb-5 pt-2">
            <button onClick={onClose}
              className="w-full py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

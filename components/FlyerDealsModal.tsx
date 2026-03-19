"use client";

import { useState } from "react";
import type { DealResult } from "@/app/api/flyer-deals/route";

interface Props {
  deal: DealResult;
  onClose: () => void;
}

function formatValidTo(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export default function FlyerDealsModal({ deal, onClose }: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null);

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
                🏷️ Flyer deals for <span className="text-brand-600">{deal.itemName}</span>
              </h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{deal.allDeals.length} deal{deal.allDeals.length !== 1 ? "s" : ""} found this week</p>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
            {deal.allDeals.map((d) => (
              <div key={d.id} className="bg-gray-50 rounded-xl p-3 flex gap-3 items-start">
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
                  {d.validTo && <p className="text-xs text-gray-400 mt-0.5">Until {formatValidTo(d.validTo)}</p>}
                  <div className="mt-1.5">
                    <span className="text-lg font-bold text-green-700">${d.currentPrice.toFixed(2)}</span>
                    {d.unitPrice && d.unit && (
                      <span className="text-xs text-gray-500 ml-1">(${d.unitPrice.toFixed(2)}/{d.unit.replace("per ", "")})</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
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

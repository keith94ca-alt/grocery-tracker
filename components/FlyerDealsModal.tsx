"use client";

import type { DealResult } from "@/app/api/flyer-deals/route";

interface Props {
  deal: DealResult;
  onClose: () => void;
}

function formatValidTo(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export default function FlyerDealsModal({ deal, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
          <div className="px-5 pt-5 pb-2 border-b border-gray-100">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-bold text-gray-900">
                🏷️ Flyer deals for <span className="text-brand-600">{deal.itemName}</span>
              </h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{deal.allDeals.length} deal{deal.allDeals.length !== 1 ? "s" : ""} found this week</p>
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
            {deal.allDeals.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
                  <p className="text-xs text-gray-500">{d.merchantName}</p>
                  {d.saleStory && <p className="text-xs text-orange-600 font-medium mt-0.5">{d.saleStory}</p>}
                  {d.validTo && <p className="text-xs text-gray-400 mt-0.5">Until {formatValidTo(d.validTo)}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-green-700">${d.currentPrice.toFixed(2)}</p>
                  {d.unitPrice && d.unit && (
                    <p className="text-xs text-gray-500">${d.unitPrice.toFixed(2)}/{d.unit.replace("per ", "")}</p>
                  )}
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

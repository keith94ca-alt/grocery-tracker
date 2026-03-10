"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface PriceEntry {
  id: number;
  price: number;
  quantity: number;
  unitPrice: number;
  store: string;
  date: string;
  notes: string | null;
  source: string;
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
  } | null;
}

function DealIndicator({ price, avg, unit }: { price: number; avg: number; unit: string }) {
  const ratio = price / avg;
  if (ratio <= 0.9) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p className="text-3xl">🟢</p>
        <p className="font-bold text-green-800 mt-1">Great Deal!</p>
        <p className="text-sm text-green-700">
          ${price.toFixed(2)}/{unit} — {Math.round((1 - ratio) * 100)}% below average
        </p>
      </div>
    );
  }
  if (ratio <= 1.1) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
        <p className="text-3xl">🟡</p>
        <p className="font-bold text-yellow-800 mt-1">Average Price</p>
        <p className="text-sm text-yellow-700">
          ${price.toFixed(2)}/{unit} — within 10% of average
        </p>
      </div>
    );
  }
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
      <p className="text-3xl">🔴</p>
      <p className="font-bold text-red-800 mt-1">Above Average</p>
      <p className="text-sm text-red-700">
        ${price.toFixed(2)}/{unit} — {Math.round((ratio - 1) * 100)}% above average
      </p>
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function ItemPage() {
  const params = useParams();
  const router = useRouter();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/items/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setItem(data);
        }
      })
      .catch(() => setError("Failed to load item"))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function deleteEntry(entryId: number) {
    setDeletingId(entryId);
    try {
      const res = await fetch(`/api/prices/${entryId}`, { method: "DELETE" });
      if (res.ok) {
        setItem((prev) =>
          prev
            ? {
                ...prev,
                priceEntries: prev.priceEntries.filter((e) => e.id !== entryId),
              }
            : prev
        );
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-gray-500">
        <div className="animate-pulse text-4xl">⏳</div>
        <p className="mt-2">Loading…</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-4xl mb-2">😕</p>
        <p className="text-gray-600">{error || "Item not found"}</p>
        <button onClick={() => router.back()} className="mt-4 text-brand-600 font-medium">
          ← Go back
        </button>
      </div>
    );
  }

  const latestPrice = item.priceEntries[0]?.unitPrice;

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 mt-1">
          ←
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{item.name}</h2>
          <p className="text-sm text-gray-500">{item.category} · {item.unit}</p>
        </div>
        <Link
          href={`/add?item=${encodeURIComponent(item.name)}`}
          className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-medium"
        >
          + Add
        </Link>
      </div>

      {/* Deal indicator */}
      {item.stats && latestPrice && item.priceEntries.length >= 3 && (
        <DealIndicator price={latestPrice} avg={item.stats.avg} unit={item.unit} />
      )}

      {/* Stats grid */}
      {item.stats && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Latest", value: `$${latestPrice?.toFixed(2) ?? "—"}`, sub: item.stats.latestStore, color: "text-brand-600" },
            { label: "Average", value: `$${item.stats.avg.toFixed(2)}`, sub: `${item.priceEntries.length} entries`, color: "text-gray-900" },
            { label: "Lowest ever", value: `$${item.stats.min.toFixed(2)}`, sub: `/${item.unit}`, color: "text-green-600" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-400 truncate">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Price history */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Price History ({item.priceEntries.length})
        </h3>
        {item.priceEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No entries yet</p>
            <Link href={`/add?item=${encodeURIComponent(item.name)}`} className="mt-2 block text-brand-600 font-medium">
              Add first price →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {item.priceEntries.map((entry, idx) => (
              <div
                key={entry.id}
                className={`bg-white rounded-xl border p-4 flex justify-between items-start gap-3 ${
                  idx === 0 ? "border-brand-200 shadow-sm" : "border-gray-200"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">
                      ${entry.unitPrice.toFixed(2)}/{item.unit}
                    </p>
                    {entry.price !== entry.unitPrice * entry.quantity && entry.quantity !== 1 && (
                      <span className="text-xs text-gray-500">
                        (${entry.price.toFixed(2)} for {entry.quantity})
                      </span>
                    )}
                    {idx === 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded font-medium">latest</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 font-medium">{entry.store}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(entry.date)}</p>
                  {entry.notes && (
                    <p className="text-xs text-gray-500 mt-1 italic">{entry.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  disabled={deletingId === entry.id}
                  className="text-gray-300 hover:text-red-400 text-lg leading-none transition-colors disabled:opacity-50"
                  title="Delete entry"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

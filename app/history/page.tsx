"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Entry {
  id: number;
  itemId: number;
  price: number;
  quantity: number;
  unitPrice: number;
  store: string;
  date: string;
  notes: string | null;
  source: string;
  item: { name: string; unit: string };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  useEffect(() => {
    fetch(`/api/prices?limit=200`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEntries(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const visible = entries.slice(0, (page + 1) * PAGE_SIZE);
  const hasMore = visible.length < entries.length;

  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-gray-500 animate-pulse">
        <p className="text-4xl">⏳</p>
        <p className="mt-2">Loading history…</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-gray-400">
        <p className="text-5xl mb-3">📋</p>
        <p className="font-medium text-gray-600">No price entries yet</p>
        <Link href="/add" className="mt-4 inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium">
          Add your first price
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Price History</h2>
        <span className="text-sm text-gray-500">{entries.length} entries</span>
      </div>

      <div className="space-y-2">
        {visible.map((entry) => (
          <Link
            key={entry.id}
            href={`/item/${entry.itemId}`}
            className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{entry.item.name}</p>
                <p className="text-sm text-gray-500 mt-0.5">{entry.store}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(entry.date)}</p>
                {entry.notes && (
                  <p className="text-xs text-gray-400 italic mt-0.5">{entry.notes}</p>
                )}
              </div>
              <div className="text-right ml-3">
                <p className="font-bold text-brand-600">
                  ${entry.unitPrice.toFixed(2)}
                  <span className="text-xs font-normal text-gray-500">/{entry.item.unit}</span>
                </p>
                {entry.quantity !== 1 && (
                  <p className="text-xs text-gray-400">${entry.price.toFixed(2)} total</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setPage((p) => p + 1)}
          className="w-full py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50"
        >
          Load more ({entries.length - visible.length} remaining)
        </button>
      )}
    </div>
  );
}

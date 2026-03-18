"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { HistoryEntrySkeleton } from "@/components/Skeletons";
import { normalizePrice } from "@/lib/units";

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

type SortField = "date" | "price" | "item" | "store";
type SortDir = "asc" | "desc";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const PAGE_SIZE = 30;

  useEffect(() => {
    fetch(`/api/prices?limit=200`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEntries(data);
      })
      .finally(() => setLoading(false));
  }, []);

  // Get unique stores
  const stores = useMemo(() => {
    const s = new Set(entries.map((e) => e.store));
    return Array.from(s).sort();
  }, [entries]);

  // Apply filters and sorting
  const filtered = useMemo(() => {
    let result = [...entries];

    // Search filter
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      result = result.filter((e) =>
        e.item.name.toLowerCase().includes(q) ||
        e.store.toLowerCase().includes(q) ||
        (e.notes?.toLowerCase().includes(q))
      );
    }

    // Store filter
    if (storeFilter) {
      result = result.filter((e) => e.store === storeFilter);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case "price":
          cmp = a.unitPrice - b.unitPrice;
          break;
        case "item":
          cmp = a.item.name.localeCompare(b.item.name);
          break;
        case "store":
          cmp = a.store.localeCompare(b.store);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [entries, searchFilter, storeFilter, sortField, sortDir]);

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className={`ml-1 text-xs ${sortField === field ? "text-brand-600" : "text-gray-300"}`}>
      {sortField === field ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  if (loading) {
    return (
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Price History</h2>
          <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <HistoryEntrySkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-gray-400">
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Price History</h2>
        <div className="flex items-center gap-3">
          <a href="/api/export" className="text-xs text-brand-600 font-medium hover:underline">
            📥 CSV
          </a>
          <a href="/api/export/json" className="text-xs text-brand-600 font-medium hover:underline">
            📥 JSON
          </a>
          <label className="text-xs text-gray-500 font-medium cursor-pointer hover:text-brand-600">
            📤 Import
            <input type="file" accept=".csv,.json" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                const content = reader.result as string;
                const isJson = file.name.endsWith(".json");
                try {
                  const res = await fetch("/api/import", {
                    method: "POST",
                    headers: { "Content-Type": isJson ? "application/json" : "text/csv" },
                    body: content,
                  });
                  const result = await res.json();
                  if (res.ok) {
                    alert(`Imported ${result.imported} entries (${result.skipped} skipped)`);
                    window.location.reload();
                  } else {
                    alert(`Import failed: ${result.error}`);
                  }
                } catch {
                  alert("Import failed");
                }
              };
              reader.readAsText(file);
            }} />
          </label>
          <span className="text-sm text-gray-500">{filtered.length} entries</span>
        </div>
      </div>

      {/* Search */}
      <input
        type="search"
        value={searchFilter}
        onChange={(e) => { setSearchFilter(e.target.value); setPage(0); }}
        placeholder="Search items, stores, notes…"
        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {/* Sort buttons */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
        {([
          ["date", "Date"],
          ["price", "Price"],
          ["item", "Item"],
          ["store", "Store"],
        ] as [SortField, string][]).map(([field, label]) => (
          <button
            key={field}
            onClick={() => toggleSort(field)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              sortField === field
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            {label} <SortIcon field={field} />
          </button>
        ))}

        {/* Store filter */}
        {stores.length > 1 && (
          <>
            <span className="text-gray-300 self-center">|</span>
            <select
              value={storeFilter || ""}
              onChange={(e) => { setStoreFilter(e.target.value || null); setPage(0); }}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-300 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">🔍</p>
          <p className="font-medium text-gray-600">No matching entries</p>
          <button onClick={() => { setSearchFilter(""); setStoreFilter(null); }} className="mt-2 text-sm text-brand-600 font-medium">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {visible.map((entry) => {
              const norm = normalizePrice(entry.unitPrice, entry.unit);
              return (
            <Link
              key={entry.id}
              href={`/item/${entry.itemId}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-brand-200 transition-all active:scale-[0.98]"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{entry.item.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{entry.store}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(entry.date)}</p>
                  {entry.notes && (
                    <p className="text-xs text-gray-400 italic mt-0.5 truncate">{entry.notes}</p>
                  )}
                </div>
                <div className="text-right ml-3">
                  <p className="font-bold text-brand-600">
                    ${norm.price.toFixed(2)}
                    <span className="text-xs font-normal text-gray-500">/{norm.unit.replace("per ", "")}</span>
                  </p>
                  {entry.quantity !== 1 && (
                    <p className="text-xs text-gray-400">${entry.price.toFixed(2)} total</p>
                  )}
                </div>
              </div>
            </Link>
              );
            })}
          </div>
      )}

      {hasMore && (
        <button
          onClick={() => setPage((p) => p + 1)}
          className="w-full py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-colors"
        >
          Load more ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  );
}

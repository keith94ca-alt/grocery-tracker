"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { simplifyFlyerName } from "@/lib/flipp";
import type { FlyerBrowseItem, TrackedMatch } from "@/app/api/flyer-items/route";
import type { FlippItem } from "@/lib/flipp";

const CATEGORIES = ["Meat", "Dairy & Eggs", "Produce", "Pantry", "Bakery", "Beverages", "Other"];

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalState {
  flippItem: FlippItem;
  trackedMatch: TrackedMatch | null;
}

function AddModal({
  state,
  onClose,
  onAdded,
}: {
  state: ModalState;
  onClose: () => void;
  onAdded: (flippId: number, itemName: string) => void;
}) {
  const { flippItem, trackedMatch } = state;

  const defaultName = trackedMatch?.name ?? simplifyFlyerName(flippItem.name);
  const [itemName, setItemName] = useState(defaultName);
  const [category, setCategory] = useState(trackedMatch?.category ?? "Meat");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Determine what quantity/unit to send
  const qty = flippItem.unitPrice && flippItem.unit
    ? flippItem.currentPrice / flippItem.unitPrice  // qty in canonical units (kg or L)
    : 1;
  const unit = flippItem.unit ?? "each";

  async function handleAdd() {
    if (!itemName.trim()) { setError("Item name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: itemName.trim(),
          category,
          unit,
          price: flippItem.currentPrice,
          quantity: qty,
          store: flippItem.merchantName,
          date: new Date().toISOString(),
          source: "flyer",
          notes: flippItem.saleStory ?? undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save");
        return;
      }
      onAdded(flippItem.id, itemName.trim());
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const unitLabel = unit.replace("per ", "");
  const validTo = flippItem.validTo
    ? new Date(flippItem.validTo).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-w-lg mx-auto">
        <div className="px-5 pt-5 pb-8 space-y-4">
          {/* Handle */}
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />

          <h2 className="text-lg font-bold text-gray-900">
            {trackedMatch ? "Update price" : "Track this item"}
          </h2>

          {/* Flyer item info (read-only) */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm">
            <p className="font-medium text-gray-800 truncate">{flippItem.name}</p>
            <p className="text-gray-500 mt-0.5">{flippItem.merchantName}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xl font-bold text-orange-700">
                ${flippItem.currentPrice.toFixed(2)}
                {flippItem.unitPrice && (
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    (${flippItem.unitPrice.toFixed(2)}/{unitLabel})
                  </span>
                )}
              </span>
              {validTo && <span className="text-xs text-gray-400">Until {validTo}</span>}
            </div>
            {flippItem.saleStory && (
              <p className="text-xs text-orange-600 mt-1 font-medium">{flippItem.saleStory}</p>
            )}
          </div>

          {/* Item name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {trackedMatch ? "Tracking as" : "Save as"}
            </label>
            {trackedMatch ? (
              <div className="flex items-center gap-2">
                <Link href={`/item/${trackedMatch.id}`}
                  className="flex-1 px-3 py-2.5 bg-gray-100 rounded-xl text-sm font-medium text-brand-700 truncate">
                  {trackedMatch.name} →
                </Link>
                <span className="text-xs text-gray-400 shrink-0">existing item</span>
              </div>
            ) : (
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Item name"
              />
            )}
          </div>

          {/* Category — only for new items */}
          {!trackedMatch && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
            >
              {saving ? "Saving…" : trackedMatch ? "Update Price" : "Start Tracking"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────

function FlyerCard({
  item,
  added,
  onAction,
}: {
  item: FlyerBrowseItem;
  added: boolean;
  onAction: () => void;
}) {
  const { flippItem, trackedMatch } = item;
  const unitLabel = flippItem.unit?.replace("per ", "");

  return (
    <div className={`bg-white rounded-xl border p-4 flex gap-3 items-start ${
      added ? "border-green-200 opacity-60" : trackedMatch ? "border-brand-200" : "border-gray-200"
    }`}>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm leading-snug">{flippItem.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{flippItem.merchantName}</p>
        {flippItem.saleStory && (
          <p className="text-xs text-orange-600 font-medium mt-0.5">{flippItem.saleStory}</p>
        )}
        {trackedMatch && !added && (
          <p className="text-xs text-brand-600 mt-1">
            → tracked as <strong>{trackedMatch.name}</strong>
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-base font-bold text-gray-900">${flippItem.currentPrice.toFixed(2)}</p>
        {flippItem.unitPrice && unitLabel && (
          <p className="text-xs text-gray-500">${flippItem.unitPrice.toFixed(2)}/{unitLabel}</p>
        )}
        {added ? (
          <span className="mt-2 inline-block text-xs text-green-600 font-semibold">✓ Added</span>
        ) : (
          <button
            onClick={onAction}
            className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
              trackedMatch
                ? "bg-brand-100 text-brand-700"
                : "bg-orange-100 text-orange-700"
            }`}
          >
            {trackedMatch ? "Update Price" : "Track This"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlyerPage() {
  const [items, setItems] = useState<FlyerBrowseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"new" | "tracked">("new");
  const [filter, setFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("All");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/flyer-items")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setItems(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stores = useMemo(() => {
    const s = new Set(items.map((i) => i.flippItem.merchantName));
    return ["All", ...Array.from(s).sort()];
  }, [items]);

  const newItems = items.filter((i) => !i.trackedMatch);
  const trackedItems = items.filter((i) => i.trackedMatch);

  const displayed = (tab === "new" ? newItems : trackedItems).filter((i) => {
    const matchesStore = storeFilter === "All" || i.flippItem.merchantName === storeFilter;
    const matchesFilter =
      !filter ||
      i.flippItem.name.toLowerCase().includes(filter.toLowerCase()) ||
      i.trackedMatch?.name.toLowerCase().includes(filter.toLowerCase());
    return matchesStore && matchesFilter;
  });

  function handleAdded(flippId: number, itemName: string) {
    setAdded((prev) => new Set(prev).add(flippId));
    setModal(null);
    // If we just added a new item, move it to "tracked" tab next time
    setItems((prev) =>
      prev.map((i) =>
        i.flippItem.id === flippId && !i.trackedMatch
          ? { ...i, trackedMatch: { id: 0, name: itemName, unit: "each", category: "Other" } }
          : i
      )
    );
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">🏷️ This Week&apos;s Flyers</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Ontario grocery chains · Refreshes every Thursday
        </p>
      </div>

      {/* Search */}
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter items…"
        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {/* Store filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {stores.map((s) => (
          <button
            key={s}
            onClick={() => setStoreFilter(s)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              storeFilter === s
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab("new")}
          className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === "new"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500"
          }`}
        >
          New Finds {!loading && `(${newItems.length})`}
        </button>
        <button
          onClick={() => setTab("tracked")}
          className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === "tracked"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-gray-500"
          }`}
        >
          On Your List {!loading && `(${trackedItems.length})`}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 space-y-2">
          <div className="text-5xl animate-pulse">🏷️</div>
          <p className="text-sm">Loading this week&apos;s flyers…</p>
          <p className="text-xs text-gray-400">First load may take a few seconds</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">🔍</p>
          <p className="text-sm">
            {tab === "new"
              ? "No new flyer items found this week"
              : "None of your tracked items are on flyer this week"}
          </p>
        </div>
      ) : (
        <div className="space-y-2 pb-4">
          {displayed.map((item) => (
            <FlyerCard
              key={item.flippItem.id}
              item={item}
              added={added.has(item.flippItem.id)}
              onAction={() => setModal({ flippItem: item.flippItem, trackedMatch: item.trackedMatch })}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <AddModal
          state={modal}
          onClose={() => setModal(null)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}

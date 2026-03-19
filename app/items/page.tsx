"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ItemCardSkeleton } from "@/components/Skeletons";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";
import FlyerDealsModal, { type FlyerDealEntry } from "@/components/FlyerDealsModal";
import type { DealResult } from "@/app/api/flyer-deals/route";

const CATEGORIES = [
  "Produce", "Meat", "Seafood", "Dairy", "Bakery",
  "Deli", "Frozen", "Pantry", "Beverages", "Snacks",
  "Household", "Personal Care", "Other",
];

interface ManagedItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  watched: boolean;
  targetPrice: number | null;
  _count: { priceEntries: number };
  lastPrice?: { unitPrice: number; store: string; date: string; unit: string } | null;
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({
  item,
  onClose,
  onSaved,
}: {
  item: ManagedItem;
  onClose: () => void;
  onSaved: (updated: ManagedItem) => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [targetPrice, setTargetPrice] = useState(item.targetPrice?.toString() || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          targetPrice: targetPrice ? parseFloat(targetPrice) : null,
        }),
      });
      if (res.status === 409) { setError("An item with that name already exists"); return; }
      if (!res.ok) { setError("Failed to save — try again"); return; }
      const updated = await res.json();
      toast(`Updated ${name.trim()}`, "success");
      onSaved({ ...updated, _count: item._count });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Edit Item</h2>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Price <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input type="number" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="e.g., 19.99" step="0.01" min="0" inputMode="decimal"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Get alerted when a deal beats this price
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation ───────────────────────────────────────────────────────
function DeleteConfirm({
  item,
  onClose,
  onDeleted,
}: {
  item: ManagedItem;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        toast(`Deleted ${item.name}`, "info");
        onDeleted(item.id);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ConfirmDialog
      title={`Delete ${item.name}?`}
      message={`This will permanently delete "${item.name}" and all ${item._count.priceEntries} price ${item._count.priceEntries === 1 ? "entry" : "entries"} you've logged for it. Your price history and averages for this item will be lost.`}
      confirmLabel={deleting ? "Deleting…" : "Delete Item"}
      onConfirm={handleDelete}
      onCancel={onClose}
    />
  );
}

// ── Watch Modal ───────────────────────────────────────────────────────────────
function WatchModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (item: ManagedItem) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [targetPrice, setTargetPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: number; name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  function handleNameChange(val: string) {
    setName(val);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        if (Array.isArray(data)) setSuggestions(data.slice(0, 5));
      } catch { /* ignore */ }
      setShowSuggestions(true);
    }, 250);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Item name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          unit: "each",
          watched: true,
          targetPrice: targetPrice ? parseFloat(targetPrice) : undefined,
        }),
      });
      if (!res.ok) { setError("Failed to save — try again"); return; }
      const created = await res.json();
      toast(`Now watching ${name.trim()}`, "success");
      onAdded({ ...created, _count: { priceEntries: 0 } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Watch an Item</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Track items without logging a price. Get notified when deals appear.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="space-y-3">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Item name</label>
            <input type="text" value={name} onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="e.g. Chicken Thighs" autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button type="button" onMouseDown={() => { setName(s.name); setSuggestions([]); setShowSuggestions(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Price <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input type="number" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="e.g., 19.99" step="0.01" min="0" inputMode="decimal"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {saving ? "Saving…" : "⭐ Watch"}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400">
          Want to log a price now?{" "}
          <Link href="/add" className="text-brand-600 font-medium" onClick={onClose}>
            Use the Add form →
          </Link>
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ItemsPage() {
  const [items, setItems] = useState<ManagedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<ManagedItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<ManagedItem | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [showWatchModal, setShowWatchModal] = useState(false);
  const [flyerDeals, setFlyerDeals] = useState<Map<string, DealResult>>(new Map());
  const [flyerModal, setFlyerModal] = useState<{ itemName: string; deals: FlyerDealEntry[] } | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Use stats=true to get latest price info
      const res = await fetch("/api/items?stats=true");
      const data = await res.json();
      if (Array.isArray(data)) {
        const items: ManagedItem[] = data.map((d: { id: number; name: string; category: string; unit: string; watched: boolean; targetPrice: number | null; stats: { count: number; latest: number | null; latestStore: string | null; latestDate: string | null; canonicalUnit: string } | null }) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          unit: d.unit,
          watched: d.watched,
          targetPrice: d.targetPrice,
          _count: { priceEntries: d.stats?.count ?? 0 },
          lastPrice: d.stats?.latest ? {
            unitPrice: d.stats.latest,
            store: d.stats.latestStore ?? "",
            date: d.stats.latestDate ?? "",
            unit: d.stats.canonicalUnit,
          } : null,
        }));
        setItems(items.sort((a, b) => a.name.localeCompare(b.name)));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadFlyerDeals = useCallback(() => {
    fetch("/api/flyer-deals")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const map = new Map<string, DealResult>();
        data.forEach((d: DealResult) => {
          map.set(d.itemName.toLowerCase(), d);
        });
        setFlyerDeals(map);
      })
      .catch(() => {});
  }, []);

  // Load flyer deals after items are loaded, and on focus return
  useEffect(() => {
    if (!loading) loadFlyerDeals();
  }, [loading, loadFlyerDeals]);

  const refreshAll = useCallback(() => { load(); loadFlyerDeals(); }, [load, loadFlyerDeals]);
  useRefreshOnFocus(refreshAll);

  async function toggleWatched(item: ManagedItem) {
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watched: !item.watched }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, watched: !i.watched } : i))
        );
        toast(item.watched ? `Removed ${item.name} from watchlist` : `Now watching ${item.name}`, "success");
      }
    } finally {
      setTogglingId(null);
    }
  }

  const filtered = search.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const watched = filtered.filter((i) => i.watched);
  const rest = filtered.filter((i) => !i.watched);

  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-xl leading-none">←</Link>
          <h1 className="text-xl font-bold text-gray-900">
            My Items
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-400">({items.length})</span>
            )}
          </h1>
        </div>
        <button onClick={() => setShowWatchModal(true)}
          className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-semibold">
          ⭐ Watch
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <ItemCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">📦</p>
          <p className="font-medium text-gray-600">
            {search ? `No items matching "${search}"` : "No items yet"}
          </p>
          {!search && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-500">Start tracking grocery prices</p>
              <Link href="/add" className="inline-block px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">
                Add Your First Price
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {/* Watchlist section */}
          {watched.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                ⭐ Watchlist ({watched.length})
              </h2>
              {watched.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  toggling={togglingId === item.id}
                  flyerDeal={flyerDeals.get(item.name.toLowerCase())}
                  onEdit={() => setEditItem(item)}
                  onDelete={() => setDeleteItem(item)}
                  onToggleWatch={() => toggleWatched(item)}
                  onFlyerClick={(deal) => setFlyerModal({ itemName: item.name, deals: deal.allDeals })}
                />
              ))}
            </div>
          )}

          {/* All other items */}
          {rest.length > 0 && (
            <div className="space-y-2">
              {watched.length > 0 && (
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  All items ({rest.length})
                </h2>
              )}
              {rest.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  toggling={togglingId === item.id}
                  flyerDeal={flyerDeals.get(item.name.toLowerCase())}
                  onEdit={() => setEditItem(item)}
                  onDelete={() => setDeleteItem(item)}
                  onToggleWatch={() => toggleWatched(item)}
                  onFlyerClick={(deal) => setFlyerModal({ itemName: item.name, deals: deal.allDeals })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showWatchModal && (
        <WatchModal
          onClose={() => setShowWatchModal(false)}
          onAdded={(newItem) => {
            setItems((prev) => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
            setShowWatchModal(false);
          }}
        />
      )}

      {editItem && (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
            setEditItem(null);
          }}
        />
      )}

      {deleteItem && (
        <DeleteConfirm
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((i) => i.id !== id));
            setDeleteItem(null);
          }}
        />
      )}

      {flyerModal && (
        <FlyerDealsModal itemName={flyerModal.itemName} deals={flyerModal.deals} onClose={() => setFlyerModal(null)} />
      )}
    </div>
  );
}

// ── Item Row ──────────────────────────────────────────────────────────────────
function ItemRow({
  item,
  toggling,
  flyerDeal,
  onEdit,
  onDelete,
  onToggleWatch,
  onFlyerClick,
}: {
  item: ManagedItem;
  toggling: boolean;
  flyerDeal?: DealResult;
  onEdit: () => void;
  onDelete: () => void;
  onToggleWatch: () => void;
  onFlyerClick: (deal: DealResult) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm flex items-center gap-3">
      {/* Watch star */}
      <button onClick={onToggleWatch} disabled={toggling}
        className={`text-xl leading-none shrink-0 transition-opacity ${toggling ? "opacity-40" : ""}`}
        title={item.watched ? "Remove from watchlist" : "Add to watchlist"}>
        {item.watched ? "⭐" : "☆"}
      </button>

      {/* Info */}
      <Link href={`/item/${item.id}`} className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{item.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {item.lastPrice ? (
            <>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-xs font-medium">🏪 Normal</span>
              <span className="text-xs text-brand-600 font-medium">
                ${item.lastPrice.unitPrice.toFixed(2)}/{item.lastPrice.unit.replace("per ", "")} · {item.lastPrice.store}
              </span>
            </>
          ) : (
            <span className="text-xs text-gray-500">
              {item.category} · {item._count.priceEntries} {item._count.priceEntries === 1 ? "entry" : "entries"}
            </span>
          )}
          {item.targetPrice && (
            <span className="text-xs text-blue-600">🎯 ${item.targetPrice.toFixed(2)}</span>
          )}
          {flyerDeal && (
            <button
              onClick={(e) => { e.preventDefault(); onFlyerClick(flyerDeal); }}
              className="text-xs text-green-600 font-medium hover:underline active:opacity-70">
              🏷️ ${flyerDeal.bestDeal.currentPrice.toFixed(2)} at {flyerDeal.bestDeal.merchantName}
              {flyerDeal.allDeals.length > 1 && <span className="text-gray-400 ml-1">+{flyerDeal.allDeals.length - 1} more</span>}
            </button>
          )}
        </div>
      </Link>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit}
          className="p-2 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-gray-50 transition-colors"
          title="Edit">
          ✏️
        </button>
        <button onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          title="Delete">
          🗑️
        </button>
      </div>
    </div>
  );
}

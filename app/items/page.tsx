"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const CATEGORIES = [
  "Produce", "Meat", "Seafood", "Dairy", "Bakery",
  "Deli", "Frozen", "Pantry", "Beverages", "Snacks",
  "Household", "Personal Care", "Other",
];

const UNITS = ["each", "per lb", "per kg", "per 100g", "per L", "per 100mL"];

interface ManagedItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  watched: boolean;
  _count: { priceEntries: number };
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
  const [unit, setUnit] = useState(item.unit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category, unit }),
      });
      if (res.status === 409) { setError("An item with that name already exists"); return; }
      if (!res.ok) { setError("Failed to save — try again"); return; }
      const updated = await res.json();
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
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
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

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (res.ok) onDeleted(item.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Delete Item?</h2>
        <p className="text-sm text-gray-600">
          <strong>{item.name}</strong> and all {item._count.priceEntries} price{" "}
          {item._count.priceEntries === 1 ? "entry" : "entries"} will be permanently deleted.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/items");
      const data = await res.json();
      if (Array.isArray(data)) {
        setItems(data.sort((a: ManagedItem, b: ManagedItem) => a.name.localeCompare(b.name)));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        <Link
          href="/add"
          className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-semibold"
        >
          + Add
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl animate-pulse">⏳</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">📦</p>
          <p className="font-medium text-gray-600">
            {search ? `No items matching "${search}"` : "No items yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
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
                  onEdit={() => setEditItem(item)}
                  onDelete={() => setDeleteItem(item)}
                  onToggleWatch={() => toggleWatched(item)}
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
                  onEdit={() => setEditItem(item)}
                  onDelete={() => setDeleteItem(item)}
                  onToggleWatch={() => toggleWatched(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
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

      {/* Delete confirmation */}
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
    </div>
  );
}

// ── Item Row ──────────────────────────────────────────────────────────────────
function ItemRow({
  item,
  toggling,
  onEdit,
  onDelete,
  onToggleWatch,
}: {
  item: ManagedItem;
  toggling: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleWatch: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm flex items-center gap-3">
      {/* Watch star */}
      <button
        onClick={onToggleWatch}
        disabled={toggling}
        className={`text-xl leading-none shrink-0 transition-opacity ${toggling ? "opacity-40" : ""}`}
        title={item.watched ? "Remove from watchlist" : "Add to watchlist"}
      >
        {item.watched ? "⭐" : "☆"}
      </button>

      {/* Info */}
      <Link href={`/item/${item.id}`} className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{item.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.category} · {item.unit} · {item._count.priceEntries}{" "}
          {item._count.priceEntries === 1 ? "entry" : "entries"}
        </p>
      </Link>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-2 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-gray-50 transition-colors"
          title="Edit"
        >
          ✏️
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

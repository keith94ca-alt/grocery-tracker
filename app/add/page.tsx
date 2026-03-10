"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const CATEGORIES = [
  "Produce", "Meat", "Seafood", "Dairy", "Bakery",
  "Deli", "Frozen", "Pantry", "Beverages", "Snacks",
  "Household", "Personal Care", "Other",
];

const UNITS = ["each", "per lb", "per kg", "per 100g", "per L", "per 100mL"];

function AddForm() {
  const searchParams = useSearchParams();
  const itemInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    itemName: searchParams.get("item") || "",
    category: "Other",
    unit: "each",
    price: "",
    quantity: "1",
    store: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [itemSuggestions, setItemSuggestions] = useState<{ id: number; name: string; category: string; unit: string }[]>([]);
  const [storeSuggestions, setStoreSuggestions] = useState<{ id: number; name: string }[]>([]);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!form.itemName) {
      itemInputRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (form.itemName.length < 1) {
      setItemSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(form.itemName)}`);
        const data = await res.json();
        if (Array.isArray(data)) setItemSuggestions(data.slice(0, 6));
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [form.itemName]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const q = form.store ? `?q=${encodeURIComponent(form.store)}` : "";
        const res = await fetch(`/api/stores${q}`);
        const data = await res.json();
        if (Array.isArray(data)) setStoreSuggestions(data.slice(0, 6));
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [form.store]);

  const unitPrice =
    parseFloat(form.price) > 0 && parseFloat(form.quantity) > 0
      ? parseFloat(form.price) / parseFloat(form.quantity)
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        setForm((prev) => ({
          itemName: "",
          category: "Other",
          unit: "each",
          price: "",
          quantity: "1",
          store: prev.store,
          date: new Date().toISOString().split("T")[0],
          notes: "",
        }));
        setSuccess(false);
        itemInputRef.current?.focus();
      }, 2500);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  function selectItem(item: { name: string; category: string; unit: string }) {
    setForm((prev) => ({ ...prev, itemName: item.name, category: item.category, unit: item.unit }));
    setShowItemDropdown(false);
  }

  function selectStore(store: { name: string }) {
    setForm((prev) => ({ ...prev, store: store.name }));
    setShowStoreDropdown(false);
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Add Price Entry</h2>

      {/* Fixed toast notification */}
      {success && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl text-sm font-medium flex items-center gap-2 animate-bounce">
          ✅ Saved!
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="space-y-1.5 relative">
        <label className="block text-sm font-medium text-gray-700">Item name *</label>
        <input
          ref={itemInputRef}
          type="text"
          value={form.itemName}
          onChange={(e) => { setForm((prev) => ({ ...prev, itemName: e.target.value })); setShowItemDropdown(true); }}
          onFocus={() => setShowItemDropdown(true)}
          onBlur={() => setTimeout(() => setShowItemDropdown(false), 150)}
          placeholder="e.g., Ribeye Steak"
          required
          className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {showItemDropdown && itemSuggestions.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
            {itemSuggestions.map((item) => (
              <li key={item.id}>
                <button type="button" onMouseDown={() => selectItem(item)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm border-b last:border-0 border-gray-100">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-gray-500 ml-2">{item.category} · {item.unit}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Category</label>
          <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Unit</label>
          <select value={form.unit} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500">
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Price ($) *</label>
          <input type="number" value={form.price}
            onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
            placeholder="0.00" step="0.01" min="0.01" required inputMode="decimal"
            className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Quantity</label>
          <input type="number" value={form.quantity}
            onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
            placeholder="1" step="0.001" min="0.001" inputMode="decimal"
            className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>

      {unitPrice !== null && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-700">
          Unit price: <strong>${unitPrice.toFixed(2)}/{form.unit}</strong>
        </div>
      )}

      <div className="space-y-1.5 relative">
        <label className="block text-sm font-medium text-gray-700">Store *</label>
        <input type="text" value={form.store}
          onChange={(e) => { setForm((prev) => ({ ...prev, store: e.target.value })); setShowStoreDropdown(true); }}
          onFocus={() => setShowStoreDropdown(true)}
          onBlur={() => setTimeout(() => setShowStoreDropdown(false), 150)}
          placeholder="e.g., St. Jacobs Market" required
          className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        {showStoreDropdown && storeSuggestions.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
            {storeSuggestions.map((store) => (
              <li key={store.id}>
                <button type="button" onMouseDown={() => selectStore(store)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm border-b last:border-0 border-gray-100 font-medium">
                  {store.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Date</label>
        <input type="date" value={form.date}
          onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
          className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Notes <span className="text-gray-400">(optional)</span>
        </label>
        <input type="text" value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="e.g., on sale, organic, AAA grade"
          className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <button type="submit" disabled={submitting}
        className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-base shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {submitting ? "Saving…" : "Save Price Entry"}
      </button>
    </form>
  );
}

export default function AddPage() {
  return (
    <Suspense fallback={<div className="px-4 py-4 text-gray-500">Loading…</div>}>
      <AddForm />
    </Suspense>
  );
}

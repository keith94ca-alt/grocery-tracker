"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";

interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  category: string;
  addedAt: number;
  priceLogged: boolean;
  price?: number;
}

const CATEGORIES = [
  "Produce", "Meat", "Seafood", "Dairy", "Bakery",
  "Deli", "Frozen", "Pantry", "Beverages", "Snacks",
  "Household", "Personal Care", "Other",
];

const UNITS = ["each", "per lb", "per kg", "per 100g", "per L", "per 100mL"];

const STORAGE_KEY = "grocery-shopping-list";

function loadList(): ShoppingItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveList(items: ShoppingItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// Price logging modal
function PriceModal({
  item,
  onClose,
  onSaved,
}: {
  item: ShoppingItem;
  onClose: () => void;
  onSaved: (price: number) => void;
}) {
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("each");
  const [store, setStore] = useState("");
  const [storeSuggestions, setStoreSuggestions] = useState<{ id: number; name: string }[]>([]);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const priceInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    priceInputRef.current?.focus();
  }, []);

  // Store autocomplete
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const q = store ? `?q=${encodeURIComponent(store)}` : "";
        const res = await fetch(`/api/stores${q}`);
        const data = await res.json();
        if (Array.isArray(data)) setStoreSuggestions(data.slice(0, 5));
      } catch {}
    }, 200);
    return () => clearTimeout(timer);
  }, [store]);

  async function handleSave() {
    const p = parseFloat(price);
    if (!p || p <= 0) { setError("Enter a valid price"); return; }
    if (!store.trim()) { setError("Store is required"); return; }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: item.name,
          category: item.category,
          unit,
          price: p,
          quantity: parseFloat(quantity) || 1,
          store: store.trim(),
          date: new Date().toISOString(),
          source: "manual",
          notes: "Logged from shopping list",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }
      toast(`Logged ${item.name} at $${p.toFixed(2)}`, "success");
      onSaved(p);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const unitPrice = price && parseFloat(price) > 0 && parseFloat(quantity) > 0
    ? parseFloat(price) / parseFloat(quantity)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl lg:rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">💰 Log price for {item.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {/* Price + quantity */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price paid ($) *</label>
            <input
              ref={priceInputRef}
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              step="0.01"
              min="0.01"
              inputMode="decimal"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Unit */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>

        {/* Store */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">Store *</label>
          <input
            type="text"
            value={store}
            onChange={(e) => { setStore(e.target.value); setShowStoreDropdown(true); }}
            onFocus={() => setShowStoreDropdown(true)}
            onBlur={() => setTimeout(() => setShowStoreDropdown(false), 150)}
            placeholder="e.g., Costco"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {showStoreDropdown && storeSuggestions.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {storeSuggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={() => { setStore(s.name); setShowStoreDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Unit price preview */}
        {unitPrice && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm">
            <span className="text-green-700">Unit price: </span>
            <strong className="text-green-800">${unitPrice.toFixed(2)}</strong>
            <span className="text-green-600">/{unit.replace("per ", "")}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600">
            Skip (no price)
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "💾 Save Price"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShoppingListPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: number; name: string; category: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [priceModalItem, setPriceModalItem] = useState<ShoppingItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  useEffect(() => { setItems(loadList()); }, []);
  useEffect(() => { saveList(items); }, [items]);

  function handleNameChange(val: string) {
    setNewName(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        if (Array.isArray(data)) setSuggestions(data.slice(0, 5));
      } catch {}
      setShowSuggestions(true);
    }, 250);
  }

  function addItem(name: string, category?: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase() && !i.checked)) return;

    const newItem: ShoppingItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: trimmed,
      checked: false,
      category: category || newCategory,
      addedAt: Date.now(),
      priceLogged: false,
    };
    setItems((prev) => [newItem, ...prev]);
    setNewName("");
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function toggleItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (!item.checked) {
      // Checking the item — show price modal
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: true } : i)));
      setPriceModalItem(item);
    } else {
      // Unchecking
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: false, priceLogged: false } : i)));
    }
  }

  function handlePriceSaved(price: number) {
    if (!priceModalItem) return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === priceModalItem.id ? { ...i, priceLogged: true, price } : i
      )
    );
    setPriceModalItem(null);
  }

  function handlePriceSkip() {
    setPriceModalItem(null);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  // Clear completed: only remove items without prices logged
  function clearChecked() {
    const removed = items.filter((i) => i.checked && !i.priceLogged).length;
    setItems((prev) => prev.filter((i) => !i.checked || i.priceLogged));
    if (removed > 0) toast(`Cleared ${removed} untracked items`, "info");
  }

  function clearAll() {
    setItems([]);
  }

  const sorted = [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  const filtered = filter ? sorted.filter((i) => i.category === filter) : sorted;
  const uncheckedCount = items.filter((i) => !i.checked).length;
  const checkedCount = items.filter((i) => i.checked).length;
  const loggedCount = items.filter((i) => i.priceLogged).length;

  const grouped = new Map<string, ShoppingItem[]>();
  filtered.forEach((item) => {
    const cat = item.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  });

  const activeCategories = [...new Set(items.map((i) => i.category))].sort();

  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-xl leading-none">←</Link>
          <h1 className="text-xl font-bold text-gray-900">🛒 Shopping List</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/history" className="text-xs text-brand-600 font-medium">History →</Link>
          {items.length > 0 && (
            <>
              <span className="text-sm text-gray-500">{uncheckedCount} to buy</span>
              {checkedCount > 0 && (
                <button
                  onClick={clearChecked}
                  className="text-xs text-red-500 font-medium hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                  title="Remove unchecked-price items from list"
                >
                  Clear ✓ ({checkedCount}{loggedCount > 0 ? ` · ${loggedCount} logged` : ""})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(newName); } }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Add item…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button type="button" onMouseDown={() => addItem(s.name, s.category)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between">
                      <span>{s.name}</span>
                      <span className="text-xs text-gray-400">{s.category}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => addItem(newName)}
            disabled={!newName.trim()}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-gray-400">Category:</span>
          <button
            onClick={() => setShowCategoryPicker(!showCategoryPicker)}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            {newCategory} ▾
          </button>
        </div>
        {showCategoryPicker && (
          <div className="mt-2 flex flex-wrap gap-1">
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => { setNewCategory(cat); setShowCategoryPicker(false); }}
                className={`text-xs px-2 py-1 rounded-full border ${
                  newCategory === cat ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-300"
                }`}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category filter */}
      {activeCategories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          <button onClick={() => setFilter(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === null ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-300"
            }`}>
            All ({items.length})
          </button>
          {activeCategories.map((cat) => {
            const count = items.filter((i) => i.category === cat).length;
            return (
              <button key={cat} onClick={() => setFilter(filter === cat ? null : cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === cat ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-300"
                }`}>
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">🛒</p>
          <p className="font-medium text-gray-600">Your shopping list is empty</p>
          <p className="text-sm mt-1">Add items above or from the flyer page</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">✅</p>
          <p className="font-medium text-gray-600">All items in {filter} checked off!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([category, catItems]) => (
            <div key={category} className="space-y-1">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                {category}
              </h3>
              {catItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-3 transition-all ${
                    item.checked
                      ? item.priceLogged
                        ? "border-green-200 bg-green-50/30"
                        : "border-gray-100 opacity-60"
                      : "border-gray-200 shadow-sm"
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleItem(item.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                      item.checked
                        ? "bg-brand-600 border-brand-600 text-white"
                        : "border-gray-300 hover:border-brand-400"
                    }`}
                  >
                    {item.checked && <span className="text-sm">✓</span>}
                  </button>

                  {/* Name + status */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm block ${
                        item.checked && !item.priceLogged ? "line-through text-gray-400" : "font-medium text-gray-900"
                      }`}
                    >
                      {item.name}
                    </span>
                    {item.priceLogged && (
                      <span className="text-xs text-green-600 font-medium">
                        💰 ${item.price?.toFixed(2)} tracked
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Log price button for checked items without price */}
                    {item.checked && !item.priceLogged && (
                      <button
                        onClick={() => setPriceModalItem(item)}
                        className="px-2 py-1 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
                        title="Log price"
                      >
                        💰
                      </button>
                    )}
                    {/* View tracked item */}
                    {item.priceLogged && (
                      <span className="text-xs text-green-600">✅</span>
                    )}
                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none transition-colors p-1"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Clear all */}
      {items.length > 0 && (
        <div className="pt-4 border-t border-gray-100 text-center">
          <button onClick={clearAll} className="text-sm text-gray-400 hover:text-red-500 font-medium">
            Clear entire list
          </button>
        </div>
      )}

      {/* Price modal */}
      {priceModalItem && (
        <PriceModal
          item={priceModalItem}
          onClose={handlePriceSkip}
          onSaved={handlePriceSaved}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import type { DealResult } from "@/app/api/flyer-deals/route";
import type { FlyerMatch } from "@/app/api/flyer-match/route";

interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  category: string;
  addedAt: number;
  priceLogged: boolean;
  price?: number;
  priceExpanded?: boolean;
  priceType?: string;
}

interface InlinePriceForm {
  price: string;
  quantity: string;
  unit: string;
  store: string;
  priceType: string;
  saving: boolean;
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

export default function ShoppingListPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: number; name: string; category: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [flyerDeals, setFlyerDeals] = useState<Map<string, DealResult>>(new Map());
  const [untrackedFlyerDeals, setUntrackedFlyerDeals] = useState<Map<string, FlyerMatch>>(new Map());
  const [normalPrices, setNormalPrices] = useState<Map<string, { price: number; unit: string; store: string }>>(new Map());
  const [priceForms, setPriceForms] = useState<Map<string, InlinePriceForm>>(new Map());
  const [lightboxImg, setLightboxImg] = useState<{ src: string; alt: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  useEffect(() => { setItems(loadList()); }, []);
  useEffect(() => { saveList(items); }, [items]);

  // Load flyer deals and normal prices on mount
  useEffect(() => {
    // Flyer deals
    fetch("/api/flyer-deals")
      .then((r) => r.json())
      .then((data: DealResult[]) => {
        if (!Array.isArray(data)) return;
        const map = new Map<string, DealResult>();
        data.forEach((d) => {
          if (d.isCheaper) map.set(d.itemName.toLowerCase(), d);
        });
        setFlyerDeals(map);
      })
      .catch(() => {});

    // Normal prices for all tracked items
    fetch("/api/items")
      .then((r) => r.json())
      .then(async (itemData) => {
        if (!Array.isArray(itemData)) return;
        const names = itemData.map((i: { name: string }) => i.name);
        if (names.length === 0) return;
        const res = await fetch(`/api/normal-prices?names=${encodeURIComponent(names.join(","))}`);
        const normals: { itemName: string; price: number; unit: string; store: string }[] = await res.json();
        if (Array.isArray(normals)) {
          const map = new Map<string, { price: number; unit: string; store: string }>();
          normals.forEach((n) => {
            map.set(n.itemName.toLowerCase(), { price: n.price, unit: n.unit, store: n.store });
          });
          setNormalPrices(map);
        }
      })
      .catch(() => {});
  }, []);

  // After items load, check flyer deals for untracked items
  useEffect(() => {
    if (items.length === 0) return;
    const trackedLower = new Set(Array.from(flyerDeals.keys()));
    const toCheck = items.filter((i) => !trackedLower.has(i.name.toLowerCase()));
    if (toCheck.length === 0) return;

    let cancelled = false;
    async function checkUntracked() {
      const results = new Map<string, FlyerMatch>();
      for (const item of toCheck.slice(0, 20)) {
        try {
          const res = await fetch(`/api/flyer-match?name=${encodeURIComponent(item.name)}`);
          const data: FlyerMatch[] = await res.json();
          if (Array.isArray(data) && data.length > 0 && !cancelled) {
            results.set(item.name.toLowerCase(), data[0]);
          }
        } catch {}
      }
      if (!cancelled && results.size > 0) {
        setUntrackedFlyerDeals(results);
      }
    }
    checkUntracked();
    return () => { cancelled = true; };
  }, [items, flyerDeals]);

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
      // Checking: expand price form
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: true, priceExpanded: true } : i)));
      setPriceForms((prev) => {
        const next = new Map(prev);
        next.set(id, { price: "", quantity: "1", unit: "each", store: "", priceType: "normal", saving: false });
        return next;
      });
    } else {
      // Unchecking: collapse and clear form
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: false, priceLogged: false, priceExpanded: false } : i)));
      setPriceForms((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function togglePriceForm(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, priceExpanded: !i.priceExpanded } : i))
    );
  }

  function updatePriceForm(id: string, field: keyof InlinePriceForm, value: string) {
    setPriceForms((prev) => {
      const next = new Map(prev);
      const form = next.get(id);
      if (form) next.set(id, { ...form, [field]: value });
      return next;
    });
  }

  async function logPrice(id: string) {
    const item = items.find((i) => i.id === id);
    const form = priceForms.get(id);
    if (!item || !form) return;

    const p = parseFloat(form.price);
    if (!p || p <= 0) { toast("Enter a valid price", "error"); return; }
    if (!form.store.trim()) { toast("Store is required", "error"); return; }

    setPriceForms((prev) => {
      const next = new Map(prev);
      const f = next.get(id);
      if (f) next.set(id, { ...f, saving: true });
      return next;
    });

    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: item.name,
          category: item.category,
          unit: form.unit,
          price: p,
          quantity: parseFloat(form.quantity) || 1,
          store: form.store.trim(),
          date: new Date().toISOString(),
          source: "manual",
          priceType: form.priceType || "normal",
          notes: "Logged from shopping list",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Failed to save", "error");
        return;
      }
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, priceLogged: true, price: p, priceExpanded: false } : i))
      );
      toast(`Logged ${item.name} at $${p.toFixed(2)}`, "success");
    } catch {
      toast("Network error", "error");
    } finally {
      setPriceForms((prev) => {
        const next = new Map(prev);
        const f = next.get(id);
        if (f) next.set(id, { ...f, saving: false });
        return next;
      });
    }
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setPriceForms((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function clearChecked() {
    const removed = items.filter((i) => i.checked && !i.priceLogged).length;
    setItems((prev) => prev.filter((i) => !i.checked || i.priceLogged));
    if (removed > 0) toast(`Cleared ${removed} untracked items`, "info");
  }

  function clearAll() { setItems([]); }

  // Find best flyer deal for an item (tracked items)
  function findFlyerDeal(itemName: string): DealResult | undefined {
    const lower = itemName.toLowerCase();
    const exact = flyerDeals.get(lower);
    if (exact) return exact;
    for (const [key, deal] of flyerDeals) {
      if (lower.includes(key) || key.includes(lower)) return deal;
    }
    return undefined;
  }

  // Find flyer deal for untracked items (direct flyer match)
  function findUntrackedFlyerDeal(itemName: string): FlyerMatch | undefined {
    return untrackedFlyerDeals.get(itemName.toLowerCase());
  }

  // Find cheapest normal price for an item
  function findNormalPrice(itemName: string): { price: number; unit: string; store: string } | undefined {
    const lower = itemName.toLowerCase();
    return normalPrices.get(lower);
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
                <button onClick={clearChecked}
                  className="text-xs text-red-500 font-medium hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
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
          <button onClick={() => addItem(newName)} disabled={!newName.trim()}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            Add
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-gray-400">Category:</span>
          <button onClick={() => setShowCategoryPicker(!showCategoryPicker)}
            className="text-xs font-medium text-brand-600 hover:text-brand-700">
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

      {/* Clear all — top of list */}
      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{items.length} {items.length === 1 ? "item" : "items"} · {uncheckedCount} to buy</span>
          <button onClick={clearAll}
            className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors">
            Clear all
          </button>
        </div>
      )}

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
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">{category}</h3>
              {catItems.map((item) => {
                const trackedDeal = !item.checked ? findFlyerDeal(item.name) : undefined;
                const untrackedDeal = !item.checked && !trackedDeal ? findUntrackedFlyerDeal(item.name) : undefined;
                const normalPrice = !item.checked && !trackedDeal && !untrackedDeal ? findNormalPrice(item.name) : undefined;
                const form = priceForms.get(item.id);
                const unitPrice = form?.price && parseFloat(form.price) > 0 && parseFloat(form.quantity || "1") > 0
                  ? (parseFloat(form.price) / parseFloat(form.quantity || "1")).toFixed(2)
                  : null;

                return (
                  <div key={item.id}>
                    {/* Main item row */}
                    <div
                      className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-3 transition-all ${
                        item.checked
                          ? item.priceLogged ? "border-green-200 bg-green-50/30" : "border-gray-100 opacity-70"
                          : "border-gray-200 shadow-sm"
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleItem(item.id)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                          item.checked ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300 hover:border-brand-400"
                        }`}
                      >
                        {item.checked && <span className="text-sm">✓</span>}
                      </button>

                      {/* Name + status */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm ${item.checked && !item.priceLogged ? "line-through text-gray-400" : "font-medium text-gray-900"}`}>
                            {item.name}
                          </span>
                          {item.priceLogged && (
                            <span className="text-xs text-green-600 font-medium">💰 ${item.price?.toFixed(2)}</span>
                          )}
                        </div>
                        {/* Tracked flyer deal — clickable */}
                        {trackedDeal && !item.checked && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <button
                              onClick={() => {
                                if (trackedDeal.bestDeal.imageUrl) {
                                  setLightboxImg({ src: trackedDeal.bestDeal.imageUrl, alt: trackedDeal.bestDeal.name });
                                } else {
                                  window.open(
                                    trackedDeal.bestDeal.pageUrl ?? `https://flipp.com/search?q=${encodeURIComponent(trackedDeal.bestDeal.name)}`,
                                    "_blank"
                                  );
                                }
                              }}
                              className="text-xs text-green-700 font-medium hover:underline flex items-center gap-1"
                            >
                              🏷️ ${trackedDeal.bestDeal.currentPrice.toFixed(2)}
                              {trackedDeal.flyerUnitPrice && trackedDeal.flyerUnit
                                ? ` ($${trackedDeal.flyerUnitPrice.toFixed(2)}/${trackedDeal.flyerUnit.replace("per ", "")})`
                                : ""}
                              {" "}{trackedDeal.bestDeal.merchantName}
                            </button>
                            {trackedDeal.savingsPercent && (
                              <span className="text-xs text-green-600">↓{trackedDeal.savingsPercent}%</span>
                            )}
                          </div>
                        )}
                        {/* Untracked flyer deal — clickable */}
                        {!trackedDeal && untrackedDeal && !item.checked && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <button
                              onClick={() => {
                                if (untrackedDeal.imageUrl) {
                                  setLightboxImg({ src: untrackedDeal.imageUrl, alt: untrackedDeal.name });
                                } else {
                                  window.open(
                                    untrackedDeal.pageUrl ?? `https://flipp.com/search?q=${encodeURIComponent(untrackedDeal.name)}`,
                                    "_blank"
                                  );
                                }
                              }}
                              className="text-xs text-green-700 font-medium hover:underline flex items-center gap-1"
                            >
                              🏷️ ${untrackedDeal.currentPrice.toFixed(2)}
                              {untrackedDeal.unitPrice && untrackedDeal.unit
                                ? ` ($${untrackedDeal.unitPrice.toFixed(2)}/${untrackedDeal.unit.replace("per ", "")})`
                                : ""}
                              {" "}{untrackedDeal.merchantName}
                            </button>
                          </div>
                        )}
                        {/* Cheapest normal price line (when no flyer deal) */}
                        {!trackedDeal && !untrackedDeal && !item.checked && normalPrice && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">
                              🏪 Normal ${normalPrice.price.toFixed(2)}/{normalPrice.unit.replace("per ", "")} at {normalPrice.store}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Expand/collapse price form — arrow indicates collapsible */}
                        {item.checked && !item.priceLogged && (
                          <button
                            onClick={() => togglePriceForm(item.id)}
                            className="px-2 py-1 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
                          >
                            {item.priceExpanded ? "▾" : "💰"}
                          </button>
                        )}
                        {item.priceLogged && <span className="text-xs text-green-600">✅</span>}
                        {/* Remove button — hidden when price form is expanded */}
                        {!item.priceExpanded && (
                          <button onClick={() => removeItem(item.id)}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none transition-colors p-1"
                            title="Remove">
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline price form (expanded) */}
                    {item.checked && item.priceExpanded && !item.priceLogged && form && (
                      <div className="bg-white border border-brand-200 border-t-0 rounded-b-xl px-4 pb-3 pt-2 -mt-1 space-y-2 animate-fade-in">
                        <p className="text-xs font-medium text-gray-500">Log what you paid (optional)</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-400 mb-0.5">Price ($)</label>
                            <input type="number" value={form.price}
                              onChange={(e) => updatePriceForm(item.id, "price", e.target.value)}
                              placeholder="0.00" step="0.01" min="0" inputMode="decimal"
                              className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-0.5">Qty</label>
                            <input type="number" value={form.quantity}
                              onChange={(e) => updatePriceForm(item.id, "quantity", e.target.value)}
                              step="0.01" min="0.01" inputMode="decimal"
                              className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-0.5">Unit</label>
                            <select value={form.unit}
                              onChange={(e) => updatePriceForm(item.id, "unit", e.target.value)}
                              className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                              {UNITS.map((u) => <option key={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-0.5">Store</label>
                          <input type="text" value={form.store}
                            onChange={(e) => updatePriceForm(item.id, "store", e.target.value)}
                            placeholder="e.g., Costco"
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                        {/* Normal / Sale toggle */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-0.5">Price type</label>
                          <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
                            <button
                              type="button"
                              onClick={() => updatePriceForm(item.id, "priceType", "normal")}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                                form.priceType === "normal"
                                  ? "bg-white text-gray-900 shadow-sm"
                                  : "text-gray-500"
                              }`}
                            >
                              🏪 Normal
                            </button>
                            <button
                              type="button"
                              onClick={() => updatePriceForm(item.id, "priceType", "sale")}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                                form.priceType === "sale"
                                  ? "bg-white text-gray-900 shadow-sm"
                                  : "text-gray-500"
                              }`}
                            >
                              🏷️ On Sale
                            </button>
                          </div>
                        </div>
                        {/* Unit price preview */}
                        {unitPrice && (
                          <p className="text-xs text-green-700">
                            Unit price: <strong>${unitPrice}/{form.unit.replace("per ", "")}</strong>
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => togglePriceForm(item.id)}
                            className="flex-1 py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                            Skip
                          </button>
                          <button onClick={() => logPrice(item.id)} disabled={form.saving}
                            className="flex-1 py-2 text-xs font-semibold text-white bg-brand-600 rounded-lg disabled:opacity-50">
                            {form.saving ? "Saving…" : "💾 Save Price"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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

      {/* Lightbox */}
      {lightboxImg && (
        <>
          <div className="fixed inset-0 bg-black/70 z-[80]" onClick={() => setLightboxImg(null)} />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" onClick={() => setLightboxImg(null)}>
            <img
              src={lightboxImg.src}
              alt={lightboxImg.alt}
              className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </>
      )}
    </div>
  );
}

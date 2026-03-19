"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { DealResult } from "@/app/api/flyer-deals/route";
import type { FlyerMatch } from "@/app/api/flyer-match/route";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";
import FlyerDealsModal from "@/components/FlyerDealsModal";

interface ShoppingListItem {
  id: string;
  name: string;
  checked: boolean;
  category: string;
  priceLogged: boolean;
  price?: number;
  priceExpanded?: boolean;
  sortOrder?: number;
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

const UNITS = ["each", "per lb", "per kg", "per 100g", "per L", "per 100mL", "per dozen", "per bunch"];

export default function ShoppingListPage() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [confirmAction, setConfirmAction] = useState<{ type: "clearChecked" | "clearAll" | "removeItem"; itemId?: string; itemName?: string } | null>(null);
  const [flyerModal, setFlyerModal] = useState<DealResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  // Load from API
  useEffect(() => {
    fetch("/api/shopping-list")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setItems(data.map((d: { id: number; name: string; category: string; checked: boolean; priceLogged: boolean; price: number | null; sortOrder: number }) => ({
            id: String(d.id),
            name: d.name,
            category: d.category,
            checked: d.checked,
            priceLogged: d.priceLogged,
            price: d.price ?? undefined,
            sortOrder: d.sortOrder,
          })));
        }
      })
      .catch(() => toast("Failed to load shopping list", "error"))
      .finally(() => setLoading(false));
  }, []);

  const loadFlyerDeals = useCallback(() => {
    fetch("/api/flyer-deals")
      .then((r) => r.json())
      .then((data: DealResult[]) => {
        if (!Array.isArray(data)) return;
        const map = new Map<string, DealResult>();
        data.forEach((d) => { if (d.isCheaper) map.set(d.itemName.toLowerCase(), d); });
        setFlyerDeals(map);
      })
      .catch(() => {});
  }, []);

  useRefreshOnFocus(loadFlyerDeals);

  // Load flyer deals and normal prices
  useEffect(() => {
    loadFlyerDeals();

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
          normals.forEach((n) => { map.set(n.itemName.toLowerCase(), { price: n.price, unit: n.unit, store: n.store }); });
          setNormalPrices(map);
        }
      })
      .catch(() => {});
  }, []);

  // Check flyer deals for untracked items
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
      if (!cancelled && results.size > 0) setUntrackedFlyerDeals(results);
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

  async function addItem(name: string, category?: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Don't add duplicates that are unchecked
    if (items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase() && !i.checked)) return;

    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, category: category || newCategory }),
      });
      if (!res.ok) { toast("Failed to add item", "error"); return; }
      const data = await res.json();
      setItems((prev) => [{
        id: String(data.id),
        name: data.name,
        category: data.category,
        checked: data.checked,
        priceLogged: data.priceLogged,
        sortOrder: data.sortOrder,
      }, ...prev]);
      setNewName("");
      setSuggestions([]);
      setShowSuggestions(false);
      inputRef.current?.focus();
    } catch {
      toast("Failed to add item", "error");
    }
  }

  async function toggleItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const newChecked = !item.checked;
    try {
      await fetch(`/api/shopping-list/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: newChecked }),
      });
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, checked: newChecked, priceExpanded: newChecked } : i))
      );
      if (newChecked) {
        setPriceForms((prev) => {
          const next = new Map(prev);
          next.set(id, { price: "", quantity: "1", unit: "each", store: "", priceType: "normal", saving: false });
          return next;
        });
      }
    } catch {
      toast("Failed to update item", "error");
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
      // Update the item in the list
      await fetch(`/api/shopping-list/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceLogged: true, price: p }),
      });
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

  async function removeItem(id: string) {
    try {
      await fetch(`/api/shopping-list/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
      setPriceForms((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } catch {
      toast("Failed to remove item", "error");
    }
  }

  async function clearChecked() {
    const removed = items.filter((i) => i.checked && !i.priceLogged).length;
    try {
      await fetch("/api/shopping-list", { method: "DELETE" });
      setItems((prev) => prev.filter((i) => !i.checked || i.priceLogged));
      if (removed > 0) toast(`Cleared ${removed} untracked items`, "info");
    } catch {
      toast("Failed to clear items", "error");
    }
  }

  async function clearAll() {
    try {
      // Delete all items one by one (or we could add a bulk delete endpoint)
      for (const item of items) {
        await fetch(`/api/shopping-list/${item.id}`, { method: "DELETE" });
      }
      setItems([]);
      toast("List cleared", "info");
    } catch {
      toast("Failed to clear list", "error");
    }
  }

  function findFlyerDeal(itemName: string): DealResult | undefined {
    const lower = itemName.toLowerCase();
    const exact = flyerDeals.get(lower);
    if (exact) return exact;
    for (const [key, deal] of flyerDeals) {
      if (lower.includes(key) || key.includes(lower)) return deal;
    }
    return undefined;
  }

  function findUntrackedFlyerDeal(itemName: string): FlyerMatch | undefined {
    return untrackedFlyerDeals.get(itemName.toLowerCase());
  }

  function findNormalPrice(itemName: string): { price: number; unit: string; store: string } | undefined {
    return normalPrices.get(itemName.toLowerCase());
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

  const grouped = new Map<string, ShoppingListItem[]>();
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
                <button onClick={() => setConfirmAction({ type: "clearChecked" })}
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

      {/* Clear all at top */}
      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{items.length} {items.length === 1 ? "item" : "items"} · {uncheckedCount} to buy</span>
          <button onClick={() => setConfirmAction({ type: "clearAll" })}
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
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse"><div className="h-4 w-1/2 bg-gray-200 rounded" /></div>)}
        </div>
      ) : items.length === 0 ? (
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
                    <div className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-3 transition-all ${
                      item.checked
                        ? item.priceLogged ? "border-green-200 bg-green-50/30" : "border-gray-100 opacity-70"
                        : "border-gray-200 shadow-sm"
                    }`}>
                      <button
                        onClick={() => toggleItem(item.id)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                          item.checked ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300 hover:border-brand-400"
                        }`}>
                        {item.checked && <span className="text-sm">✓</span>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm ${item.checked && !item.priceLogged ? "line-through text-gray-400" : "font-medium text-gray-900 dark:text-white"}`}>
                            {item.name}
                          </span>
                          {item.priceLogged && (
                            <span className="text-xs text-green-600 font-medium">💰 ${item.price?.toFixed(2)}</span>
                          )}
                        </div>
                        {trackedDeal && !item.checked && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <button
                              onClick={() => setFlyerModal(trackedDeal)}
                              className="text-xs text-green-700 font-medium hover:underline active:opacity-70 text-left">
                              🏷️ ${trackedDeal.bestDeal.currentPrice.toFixed(2)}
                              {trackedDeal.flyerUnitPrice && trackedDeal.flyerUnit
                                ? ` ($${trackedDeal.flyerUnitPrice.toFixed(2)}/${trackedDeal.flyerUnit.replace("per ", "")})`
                                : ""}
                              {" "}{trackedDeal.bestDeal.merchantName}
                              {trackedDeal.allDeals.length > 1 && <span className="text-gray-400 ml-1">+{trackedDeal.allDeals.length - 1} more</span>}
                            </button>
                            {trackedDeal.savingsPercent && (
                              <span className="text-xs text-green-600">↓{trackedDeal.savingsPercent}%</span>
                            )}
                          </div>
                        )}
                        {!trackedDeal && untrackedDeal && !item.checked && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-green-700 font-medium">
                              🏷️ ${untrackedDeal.currentPrice.toFixed(2)}
                              {untrackedDeal.unitPrice && untrackedDeal.unit
                                ? ` ($${untrackedDeal.unitPrice.toFixed(2)}/${untrackedDeal.unit.replace("per ", "")})`
                                : ""}
                              {" "}{untrackedDeal.merchantName}
                            </span>
                          </div>
                        )}
                        {!trackedDeal && !untrackedDeal && !item.checked && normalPrice && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">
                              🏪 Normal ${normalPrice.price.toFixed(2)}/{normalPrice.unit.replace("per ", "")} at {normalPrice.store}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.checked && !item.priceLogged && (
                          <button onClick={() => togglePriceForm(item.id)}
                            className="px-2 py-1 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors">
                            {item.priceExpanded ? "▾" : "💰"}
                          </button>
                        )}
                        {item.priceLogged && <span className="text-xs text-green-600">✅</span>}
                        {!item.priceExpanded && (
                          <button onClick={() => setConfirmAction({ type: "removeItem", itemId: item.id, itemName: item.name })}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none transition-colors p-1" title="Remove">
                            ×
                          </button>
                        )}
                      </div>
                    </div>
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
                        <div>
                          <label className="block text-xs text-gray-400 mb-0.5">Price type</label>
                          <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
                            <button type="button" onClick={() => updatePriceForm(item.id, "priceType", "normal")}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                                form.priceType === "normal" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                              }`}>
                              🏪 Normal
                            </button>
                            <button type="button" onClick={() => updatePriceForm(item.id, "priceType", "sale")}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                                form.priceType === "sale" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                              }`}>
                              🏷️ On Sale
                            </button>
                          </div>
                        </div>
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

      {items.length > 0 && (
        <div className="pt-4 border-t border-gray-100 text-center">
          <button onClick={() => setConfirmAction({ type: "clearAll" })} className="text-sm text-gray-400 hover:text-red-500 font-medium">
            Clear entire list
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <>
          <div className="fixed inset-0 bg-black/70 z-[80]" onClick={() => setLightboxImg(null)} />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" onClick={() => setLightboxImg(null)}>
            <img src={lightboxImg.src} alt={lightboxImg.alt}
              className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()} />
          </div>
        </>
      )}

      {/* Confirm dialogs */}
      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction.type === "clearAll" ? "Clear Entire List?" :
            confirmAction.type === "clearChecked" ? "Clear Checked Items?" :
            "Remove Item?"
          }
          message={
            confirmAction.type === "clearAll"
              ? `This will remove all ${items.length} items from your shopping list. Items that have prices logged will still be tracked in your price history.`
              : confirmAction.type === "clearChecked"
              ? `This will remove ${checkedCount} checked item${checkedCount !== 1 ? "s" : ""} from your list. ${loggedCount > 0 ? `${loggedCount} with logged prices will stay in your price history. ` : ""}Items without prices will be deleted.`
              : `"${confirmAction.itemName}" will be removed from your shopping list. If you've logged a price for it, the price history will remain.`
          }
          confirmLabel={confirmAction.type === "removeItem" ? "Remove" : "Clear"}
          onConfirm={() => {
            if (confirmAction.type === "clearAll") clearAll();
            else if (confirmAction.type === "clearChecked") clearChecked();
            else if (confirmAction.itemId) removeItem(confirmAction.itemId);
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {flyerModal && (
        <FlyerDealsModal deal={flyerModal} onClose={() => setFlyerModal(null)} />
      )}
    </div>
  );
}

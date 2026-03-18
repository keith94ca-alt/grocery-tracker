"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";

const CATEGORIES = [
  "Produce", "Meat", "Seafood", "Dairy", "Bakery",
  "Deli", "Frozen", "Pantry", "Beverages", "Snacks",
  "Household", "Personal Care", "Other",
];

const UNITS = ["each", "per lb", "per kg", "per 100g", "per L", "per 100mL", "per dozen", "per bunch"];

const PACK_SIZE_UNITS = ["mL", "L", "g", "kg", "lb", "oz"];

function computeMultipackQty(
  packCount: string,
  sizeVal: string,
  sizeUnit: string,
  targetUnit: string
): number | null {
  const c = parseFloat(packCount);
  const s = parseFloat(sizeVal);
  if (!c || !s || c <= 0 || s <= 0) return null;

  type BaseResult = { amount: number; type: "vol" | "wt" };
  const toBase: Record<string, BaseResult> = {
    mL:  { amount: s,            type: "vol" },
    L:   { amount: s * 1000,     type: "vol" },
    g:   { amount: s,            type: "wt"  },
    kg:  { amount: s * 1000,     type: "wt"  },
    lb:  { amount: s * 453.592,  type: "wt"  },
    oz:  { amount: s * 28.3495,  type: "wt"  },
  };

  const base = toBase[sizeUnit];
  if (!base) return null;

  const totalBase = c * base.amount;

  if (base.type === "vol") {
    if (targetUnit === "per L")     return totalBase / 1000;
    if (targetUnit === "per 100mL") return totalBase / 100;
    return null;
  }

  if (base.type === "wt") {
    if (targetUnit === "per kg")   return totalBase / 1000;
    if (targetUnit === "per 100g") return totalBase / 100;
    if (targetUnit === "per lb")   return totalBase / 453.592;
    return null;
  }

  return null;
}

function packTotalLabel(packCount: string, sizeVal: string, sizeUnit: string): string {
  const c = parseFloat(packCount);
  const s = parseFloat(sizeVal);
  if (!c || !s) return "";
  const total = c * s;
  if (sizeUnit === "mL" && total >= 1000) return `${(total / 1000).toFixed(3).replace(/\.?0+$/, "")} L`;
  if (sizeUnit === "g"  && total >= 1000) return `${(total / 1000).toFixed(3).replace(/\.?0+$/, "")} kg`;
  return `${total} ${sizeUnit}`;
}

function suggestUnit(packSizeUnit: string): string {
  if (["mL", "L"].includes(packSizeUnit)) return "per L";
  if (["g", "kg", "lb", "oz"].includes(packSizeUnit)) return "per kg";
  return "each";
}

function AddForm() {
  const searchParams = useSearchParams();
  const itemInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    itemName: searchParams.get("item") || "",
    category: "Other",
    unit: "each",
    price: "",
    quantity: "1",
    store: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    priceType: "normal",
  });

  const [packMode, setPackMode] = useState(false);
  const [packCount, setPackCount] = useState("1");
  const [packSizeVal, setPackSizeVal] = useState("");
  const [packSizeUnit, setPackSizeUnit] = useState("mL");

  const [itemSuggestions, setItemSuggestions] = useState<{ id: number; name: string; category: string; unit: string }[]>([]);
  const [storeSuggestions, setStoreSuggestions] = useState<{ id: number; name: string }[]>([]);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [recentItems, setRecentItems] = useState<{ name: string; category: string; unit: string }[]>([]);

  // Load recent items + last store from API
  useEffect(() => {
    fetch("/api/prices?limit=20")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;

        // Pre-fill store with last used store
        if (data.length > 0 && !form.store) {
          setForm((prev) => ({ ...prev, store: data[0].store }));
        }

        const seen = new Set<string>();
        const items: { name: string; category: string; unit: string }[] = [];
        for (const entry of data) {
          const name = entry.item?.name;
          if (name && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            items.push({ name, category: "Other", unit: entry.item?.unit || "each" });
          }
          if (items.length >= 10) break;
        }
        setRecentItems(items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.itemName) itemInputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Item autocomplete
  useEffect(() => {
    if (form.itemName.length < 1) { setItemSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(form.itemName)}`);
        const data = await res.json();
        if (Array.isArray(data)) setItemSuggestions(data.slice(0, 6));
      } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [form.itemName]);

  // Store autocomplete
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const q = form.store ? `?q=${encodeURIComponent(form.store)}` : "";
        const res = await fetch(`/api/stores${q}`);
        const data = await res.json();
        if (Array.isArray(data)) setStoreSuggestions(data.slice(0, 6));
      } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [form.store]);

  useEffect(() => {
    if (!packMode) return;
    setForm((prev) => ({ ...prev, unit: suggestUnit(packSizeUnit) }));
  }, [packSizeUnit, packMode]);

  useEffect(() => {
    if (!packMode) return;
    const qty = computeMultipackQty(packCount, packSizeVal, packSizeUnit, form.unit);
    if (qty !== null && qty > 0) {
      setForm((prev) => ({
        ...prev,
        quantity: qty.toFixed(6).replace(/\.?0+$/, ""),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packMode, packCount, packSizeVal, packSizeUnit, form.unit]);

  const price = parseFloat(form.price);
  const quantity = parseFloat(form.quantity);
  const unitPrice = price > 0 && quantity > 0 ? price / quantity : null;

  const packQtyComputed = packMode
    ? computeMultipackQty(packCount, packSizeVal, packSizeUnit, form.unit)
    : null;
  const packIncompatible = packMode && packSizeVal !== "" && packQtyComputed === null;

  function saveRecentItem(name: string, category: string, unit: string) {
    // Update local state (persists via API on next load)
    setRecentItems((prev) => {
      const updated = [{ name, category, unit }, ...prev.filter((i) => i.name !== name)].slice(0, 10);
      return updated;
    });
  }

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
        toast(data.error || "Failed to save", "error");
        return;
      }
      saveRecentItem(form.itemName, form.category, form.unit);
      toast(`Saved ${form.itemName} at $${parseFloat(form.price).toFixed(2)}`);
      setForm((prev) => ({
        itemName: "",
        category: "Other",
        unit: "each",
        price: "",
        quantity: "1",
        store: prev.store,
        date: new Date().toISOString().split("T")[0],
        notes: "",
        priceType: "normal",
      }));
      setPackMode(false);
      setPackCount("1");
      setPackSizeVal("");
      setPackSizeUnit("mL");
      itemInputRef.current?.focus();
    } catch {
      setError("Network error — please try again");
      toast("Network error", "error");
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Add Price Entry</h2>
        {recentItems.length > 0 && (
          <span className="text-xs text-gray-400">{recentItems.length} recent items</span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm animate-shake">
          ⚠️ {error}
        </div>
      )}

      {/* Recent items quick-pick — only show when field is empty */}
      {!form.itemName && recentItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recent items</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
            {recentItems.slice(0, 8).map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => selectItem(item)}
                className="shrink-0 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-brand-300 hover:bg-brand-50 transition-colors active:scale-95"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Item name */}
      <div className="space-y-1.5 relative">
        <label className="block text-sm font-medium text-gray-700">Item name *</label>
        <input
          ref={itemInputRef}
          type="text"
          value={form.itemName}
          onChange={(e) => { setForm((prev) => ({ ...prev, itemName: e.target.value })); setShowItemDropdown(true); }}
          onFocus={() => setShowItemDropdown(true)}
          onBlur={() => setTimeout(() => setShowItemDropdown(false), 150)}
          placeholder="e.g., Dove Body Wash"
          required
          className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
        />
        {showItemDropdown && itemSuggestions.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
            {itemSuggestions.map((item) => (
              <li key={item.id}>
                <button type="button" onMouseDown={() => selectItem(item)}
                  className="w-full text-left px-4 py-3 hover:bg-brand-50 text-sm border-b last:border-0 border-gray-100 active:bg-brand-100">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-gray-500 ml-2">{item.category} · {item.unit}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Category + Unit */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Category</label>
          <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Track price as</label>
          <select value={form.unit} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500">
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* Price */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Total price paid ($) *</label>
        <input type="number" value={form.price}
          onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
          placeholder="0.00" step="0.01" min="0.01" required inputMode="decimal"
          className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* Multi-pack toggle */}
      <div>
        <button
          type="button"
          onClick={() => {
            setPackMode((v) => !v);
            if (packMode) {
              setForm((prev) => ({ ...prev, quantity: "1" }));
            }
          }}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            packMode
              ? "bg-brand-600 text-white border-brand-600 shadow-sm"
              : "bg-white text-gray-600 border-gray-300 hover:border-brand-300"
          }`}
        >
          📦 {packMode ? "Multi-pack ON" : "Multi-pack / Bundle"}
        </button>
        <p className="text-xs text-gray-400 mt-1.5">
          For bundles like &ldquo;2×877mL&rdquo; or &ldquo;12-pack 355mL cans&rdquo;
        </p>
      </div>

      {/* Multi-pack calculator */}
      {packMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Pack details</p>

          <div className="flex items-end gap-2">
            <div className="flex-none w-20">
              <label className="block text-xs text-gray-500 mb-1">Count</label>
              <input
                type="number"
                value={packCount}
                onChange={(e) => setPackCount(e.target.value)}
                placeholder="2"
                min="1"
                step="1"
                inputMode="numeric"
                className="w-full px-2 py-2.5 border border-gray-300 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <span className="text-gray-400 text-lg pb-2">×</span>

            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Each item is</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={packSizeVal}
                  onChange={(e) => setPackSizeVal(e.target.value)}
                  placeholder="877"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  className="flex-1 px-2 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <select
                  value={packSizeUnit}
                  onChange={(e) => setPackSizeUnit(e.target.value)}
                  className="px-2 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {PACK_SIZE_UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          {packSizeVal && parseFloat(packSizeVal) > 0 && (
            <div className="text-sm">
              {packIncompatible ? (
                <p className="text-orange-600 font-medium">
                  ⚠ {packSizeUnit} is not compatible with &ldquo;{form.unit}&rdquo; — change the tracking unit above
                </p>
              ) : packQtyComputed !== null ? (
                <p className="text-blue-700">
                  Total:{" "}
                  <strong>
                    {packCount} × {packSizeVal}{packSizeUnit} = {packTotalLabel(packCount, packSizeVal, packSizeUnit)}
                  </strong>
                  {price > 0 && (
                    <span className="ml-2 text-blue-600">
                      → <strong>${(price / packQtyComputed).toFixed(2)}/{form.unit.replace("per ", "")}</strong>
                    </span>
                  )}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {!packMode && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Quantity{" "}
            <span className="text-gray-400 font-normal text-xs">
              (total {form.unit === "each" ? "items" : form.unit.replace("per ", "")})
            </span>
          </label>
          <input type="number" value={form.quantity}
            onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
            placeholder="1" step="0.001" min="0.001" inputMode="decimal"
            className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      )}

      {/* Unit price preview */}
      {unitPrice !== null && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <span className="text-green-600">=</span>
          <strong className="text-green-800 text-lg">${unitPrice.toFixed(2)}</strong>
          <span className="text-green-600">/{form.unit.replace("per ", "")}</span>
        </div>
      )}

      {/* Store */}
      <div className="space-y-1.5 relative">
        <label className="block text-sm font-medium text-gray-700">Store *</label>
        <input type="text" value={form.store}
          onChange={(e) => { setForm((prev) => ({ ...prev, store: e.target.value })); setShowStoreDropdown(true); }}
          onFocus={() => setShowStoreDropdown(true)}
          onBlur={() => setTimeout(() => setShowStoreDropdown(false), 150)}
          placeholder="e.g., Costco" required
          className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        {showStoreDropdown && storeSuggestions.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
            {storeSuggestions.map((store) => (
              <li key={store.id}>
                <button type="button" onMouseDown={() => selectStore(store)}
                  className="w-full text-left px-4 py-3 hover:bg-brand-50 text-sm border-b last:border-0 border-gray-100 font-medium active:bg-brand-100">
                  {store.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Date</label>
        <div className="flex gap-2 mb-2">
          {[
            { label: "Today", date: new Date().toISOString().split("T")[0] },
            { label: "Yesterday", date: new Date(Date.now() - 86400000).toISOString().split("T")[0] },
            { label: "2 days ago", date: new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0] },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, date: preset.date }))}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                form.date === preset.date
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-brand-300"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <input type="date" value={form.date}
          onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
          className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* Price type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Price type</label>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, priceType: "normal" }))}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
              form.priceType === "normal"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500"
            }`}
          >
            🏪 Normal
          </button>
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, priceType: "sale" }))}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
              form.priceType === "sale"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500"
            }`}
          >
            🏷️ On Sale
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Notes <span className="text-gray-400">(optional)</span>
        </label>
        <input type="text" value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="e.g., organic, on sale"
          className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <button type="submit" disabled={submitting || packIncompatible}
        className="w-full py-4 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold rounded-xl text-base shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
        {submitting ? "Saving…" : "Save Price Entry"}
      </button>

      <p className="text-center text-xs text-gray-400">
        Tip: <Link href="/flyer" className="text-brand-600 font-medium">Browse flyers</Link> to find deals and log prices directly
      </p>
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

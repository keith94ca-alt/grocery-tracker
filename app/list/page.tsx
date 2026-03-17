"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  category: string;
  addedAt: number;
}

const CATEGORIES = [
  "Produce", "Meat", "Seafood", "Dairy", "Bakery",
  "Deli", "Frozen", "Pantry", "Beverages", "Snacks",
  "Household", "Personal Care", "Other",
];

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
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount
  useEffect(() => {
    setItems(loadList());
  }, []);

  // Save on change
  useEffect(() => {
    saveList(items);
  }, [items]);

  // Autocomplete from tracked items
  function handleNameChange(val: string) {
    setNewName(val);
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

  function addItem(name: string, category?: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Don't add duplicates that are unchecked
    if (items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase() && !i.checked)) return;

    const newItem: ShoppingItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: trimmed,
      checked: false,
      category: category || newCategory,
      addedAt: Date.now(),
    };
    setItems((prev) => [newItem, ...prev]);
    setNewName("");
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function toggleItem(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function clearChecked() {
    setItems((prev) => prev.filter((i) => !i.checked));
  }

  function clearAll() {
    setItems([]);
  }

  // Sort: unchecked first (by category then name), checked at bottom
  const sorted = [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  const filtered = filter ? sorted.filter((i) => i.category === filter) : sorted;
  const uncheckedCount = items.filter((i) => !i.checked).length;
  const checkedCount = items.filter((i) => i.checked).length;

  // Group by category for display
  const grouped = new Map<string, ShoppingItem[]>();
  filtered.forEach((item) => {
    const cat = item.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  });

  // Categories present in current list
  const activeCategories = [...new Set(items.map((i) => i.category))].sort();

  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-xl leading-none">←</Link>
          <h1 className="text-xl font-bold text-gray-900">
            🛒 Shopping List
          </h1>
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
                >
                  Clear ✓ ({checkedCount})
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem(newName);
                }
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Add item…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {/* Autocomplete suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseDown={() => {
                        addItem(s.name, s.category);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between"
                    >
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
        {/* Category picker */}
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
              <button
                key={cat}
                onClick={() => { setNewCategory(cat); setShowCategoryPicker(false); }}
                className={`text-xs px-2 py-1 rounded-full border ${
                  newCategory === cat
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-gray-600 border-gray-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category filter */}
      {activeCategories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          <button
            onClick={() => setFilter(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === null
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            All ({items.length})
          </button>
          {activeCategories.map((cat) => {
            const count = items.filter((i) => i.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setFilter(filter === cat ? null : cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === cat
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-gray-600 border-gray-300"
                }`}
              >
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
                      ? "border-gray-100 opacity-50"
                      : "border-gray-200 shadow-sm"
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleItem(item.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      item.checked
                        ? "bg-brand-600 border-brand-600 text-white"
                        : "border-gray-300 hover:border-brand-400"
                    }`}
                  >
                    {item.checked && <span className="text-sm">✓</span>}
                  </button>

                  {/* Name */}
                  <span
                    className={`flex-1 text-sm ${
                      item.checked
                        ? "line-through text-gray-400"
                        : "font-medium text-gray-900"
                    }`}
                  >
                    {item.name}
                  </span>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-gray-300 hover:text-red-400 text-lg leading-none transition-colors"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Clear all button */}
      {items.length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          <button
            onClick={clearAll}
            className="w-full py-2.5 text-sm text-gray-400 hover:text-red-500 font-medium"
          >
            Clear entire list
          </button>
        </div>
      )}
    </div>
  );
}

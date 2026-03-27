"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { simplifyFlyerName } from "@/lib/flipp";
import type { FlyerBrowseItem, TrackedMatch } from "@/app/api/flyer-items/route";
import type { DealResult } from "@/app/api/flyer-deals/route";
import type { FlippItem } from "@/lib/flipp";
import { FlyerCardSkeleton } from "@/components/Skeletons";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";

const CATEGORIES = ["Meat", "Dairy & Eggs", "Produce", "Pantry", "Bakery", "Beverages", "Other"];

interface FlyerBrowseItemWithNormal extends FlyerBrowseItem {
  normalUnitPrice?: number | null;
  normalUnit?: string | null;
}

const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  { category: "🥩 Meat & Protein", keywords: ["beef", "chicken", "pork", "turkey", "bacon", "ham", "sausage", "steak", "ground", "lamb", "veal", "bison", "shrimp", "salmon", "fish", "tuna", "seafood"] },
  { category: "🥛 Dairy & Eggs", keywords: ["milk", "butter", "cheese", "eggs", "yogurt", "cream", "sour cream", "cream cheese", "cottage", "brie", "cheddar", "mozzarella"] },
  { category: "🥦 Produce", keywords: ["apple", "banana", "orange", "tomato", "potato", "onion", "lettuce", "spinach", "broccoli", "carrot", "pepper", "mushroom", "avocado", "grape", "strawberry", "blueberry", "lemon", "lime", "cucumber", "zucchini", "celery", "kale", "cabbage", "garlic", "ginger"] },
  { category: "🥖 Bakery", keywords: ["bread", "muffin", "bagel", "croissant", "bun", "roll", "loaf", "tortilla", "pita", "naan", "cake", "cookie", "pastry", "donut"] },
  { category: "❄️ Frozen", keywords: ["frozen", "pizza", "ice cream", "waffles", "fries", "nuggets", "edamame"] },
  { category: "🥫 Pantry", keywords: ["pasta", "rice", "cereal", "soup", "beans", "tomato sauce", "olive oil", "flour", "sugar", "honey", "jam", "peanut butter", "crackers", "oats", "quinoa"] },
  { category: "🍿 Snacks", keywords: ["chips", "popcorn", "pretzels", "granola", "chocolate", "candy", "nuts", "trail mix", "bar", "snack"] },
  { category: "🥤 Beverages", keywords: ["juice", "pop", "soda", "water", "sparkling", "coffee", "tea", "energy drink", "kombucha", "lemonade", "cider", "beer", "wine"] },
  { category: "🧹 Household", keywords: ["toilet paper", "paper towel", "dish soap", "laundry", "detergent", "bleach", "cleaner", "garbage", "wrap", "foil", "bag"] },
  { category: "🧴 Personal Care", keywords: ["shampoo", "conditioner", "body wash", "deodorant", "toothpaste", "razor", "lotion", "sunscreen", "soap"] },
];

function deriveFlyerCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return "📦 Other";
}

// ── Image lightbox ─────────────────────────────────────────────────────────────

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-[80]" onClick={onClose} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" onClick={onClose}>
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalState {
  flippItem: FlippItem;
  trackedMatch: TrackedMatch | null;
}

type UnitMode = "auto" | "per kg" | "per lb" | "per pack" | "each";

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
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // Unit mode — "auto" only available when Flipp gives us a parseable size
  const hasAutoUnit = !!(flippItem.unitPrice && flippItem.unit);
  const [unitMode, setUnitMode] = useState<UnitMode>(hasAutoUnit ? "auto" : "each");

  // Pack weight entry (only shown when unitMode === "per pack")
  const [packWeight, setPackWeight] = useState("");
  const [packWeightUnit, setPackWeightUnit] = useState<"kg" | "lb">("kg");

  /** Compute the unit, quantity, and preview unitPrice to pass to the API. */
  function computeSend(): { unit: string; qty: number; computedUnitPrice: number | null } {
    const price = flippItem.currentPrice;

    if (unitMode === "auto" && flippItem.unitPrice && flippItem.unit) {
      // qty = price / unitPrice recovers the canonical pack size (e.g. 0.454 kg)
      const qty = price / flippItem.unitPrice;
      return { unit: flippItem.unit, qty, computedUnitPrice: flippItem.unitPrice };
    }

    if (unitMode === "per kg") {
      return { unit: "per kg", qty: 1, computedUnitPrice: price };
    }

    if (unitMode === "per lb") {
      const qtyKg = 0.453592; // 1 lb in kg
      return { unit: "per kg", qty: qtyKg, computedUnitPrice: price / qtyKg };
    }

    if (unitMode === "per pack") {
      const w = parseFloat(packWeight);
      if (w > 0) {
        const qtyKg = packWeightUnit === "kg" ? w : w * 0.453592;
        return { unit: "per kg", qty: qtyKg, computedUnitPrice: price / qtyKg };
      }
      // No weight entered yet
      return { unit: "per pack", qty: 1, computedUnitPrice: null };
    }

    // "each"
    return { unit: "each", qty: 1, computedUnitPrice: null };
  }

  const { unit, qty, computedUnitPrice } = computeSend();

  async function handleAdd(source: "manual" | "flyer") {
    if (!itemName.trim()) { setError("Item name is required"); return; }
    setSaving(true);
    setError("");

    // "Note Flyer Price" — save to flyer notes (not purchase history)
    if (source === "flyer") {
      try {
        await fetch("/api/flyer-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemName: itemName.trim(),
            flippId: flippItem.id,
            price: flippItem.currentPrice,
            unitPrice: computedUnitPrice ?? flippItem.unitPrice ?? flippItem.currentPrice,
            unit: unit,
            store: flippItem.merchantName,
            validFrom: flippItem.validFrom,
            validTo: flippItem.validTo,
          }),
        });
      } catch {
        // Ignore save errors for flyer notes
      }
      onAdded(flippItem.id, itemName.trim());
      setSaving(false);
      return;
    }

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
          source,
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

  const validFrom = flippItem.validFrom
    ? new Date(flippItem.validFrom).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : null;
  const validTo = flippItem.validTo
    ? new Date(flippItem.validTo).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : null;

  const flippUrl = flippItem.pageUrl ?? `https://flipp.com/search?q=${encodeURIComponent(flippItem.name)}`;

  const unitModes: { label: string; value: UnitMode }[] = [
    ...(hasAutoUnit ? [{ label: "Auto-detect", value: "auto" as UnitMode }] : []),
    { label: "Per kg", value: "per kg" as UnitMode },
    { label: "Per lb", value: "per lb" as UnitMode },
    { label: "Per pack", value: "per pack" as UnitMode },
    { label: "Each", value: "each" as UnitMode },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />

      {lightboxImg && (
        <ImageLightbox src={lightboxImg} alt={flippItem.name} onClose={() => setLightboxImg(null)} />
      )}

      {/* Centered modal */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="overflow-y-auto flex-1 px-5 pt-5 pb-8 space-y-4">
          {/* Drag handle placeholder keeps spacing consistent */}
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />

          {/* Header + Flipp link */}
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-900">
              {trackedMatch ? "Flyer deal for " + trackedMatch.name : "Track this item"}
            </h2>
            <a
              href={flippUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-600 font-medium underline shrink-0 mt-1"
            >
              View on Flipp →
            </a>
          </div>

          {/* Flyer item info (read-only) */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm flex gap-3 items-start">
            {flippItem.imageUrl && (
              <img
                src={flippItem.imageUrl}
                alt={flippItem.name}
                className="w-16 h-16 rounded-lg object-cover shrink-0 bg-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
                loading="lazy"
                onClick={() => setLightboxImg(flippItem.imageUrl!)}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800">{flippItem.name}</p>
              <p className="text-gray-500 mt-0.5">{flippItem.merchantName}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xl font-bold text-orange-700">
                  ${flippItem.currentPrice.toFixed(2)}
                  {flippItem.unitPrice && flippItem.unit && (
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      (${flippItem.unitPrice.toFixed(2)}/{flippItem.unit.replace("per ", "")})
                    </span>
                  )}
                  {!flippItem.unitPrice && flippItem.postPriceText && (
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      /{flippItem.postPriceText.replace(/^\/?\s*/, "").toLowerCase()}
                    </span>
                  )}
                </span>
                {validTo && (
                  <span className="text-xs text-gray-400">
                    {validFrom ? `${validFrom} – ${validTo}` : `Until ${validTo}`}
                  </span>
                )}
              </div>
              {flippItem.saleStory && (
                <p className="text-xs text-orange-600 mt-1 font-medium">{flippItem.saleStory}</p>
              )}
            </div>
          </div>

          {/* Unit mode selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Price is listed…
            </label>
            <div className="flex flex-wrap gap-2">
              {unitModes.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setUnitMode(m.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    unitMode === m.value
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per pack — weight entry + live per-kg preview */}
          {unitMode === "per pack" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <p className="text-xs text-blue-700 font-medium">
                Enter pack weight to calculate price per kg
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={packWeight}
                  onChange={(e) => setPackWeight(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <select
                  value={packWeightUnit}
                  onChange={(e) => setPackWeightUnit(e.target.value as "kg" | "lb")}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>
              {computedUnitPrice ? (
                <p className="text-sm font-semibold text-blue-800">
                  = ${computedUnitPrice.toFixed(2)} / kg
                </p>
              ) : (
                <p className="text-xs text-blue-500">Enter weight above to see per-kg price</p>
              )}
            </div>
          )}

          {/* Unit price preview for per kg / per lb modes */}
          {(unitMode === "per kg" || unitMode === "per lb") && computedUnitPrice && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-500">
                Recorded as{" "}
                <span className="font-semibold text-gray-800">
                  ${computedUnitPrice.toFixed(2)} / kg
                </span>
                {unitMode === "per lb" && (
                  <span className="text-gray-400 dark:text-gray-500"> (converted from /lb)</span>
                )}
              </p>
            </div>
          )}

          {/* Item name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {trackedMatch ? "Tracking as" : "Save as"}
            </label>
            {trackedMatch ? (
              <div className="flex items-center gap-2">
                <Link
                  href={`/item/${trackedMatch.id}`}
                  className="flex-1 px-3 py-2.5 bg-gray-100 rounded-xl text-sm font-medium text-brand-700 truncate"
                >
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

          {trackedMatch && (
            <p className="text-xs text-gray-500">
              <strong>Note Flyer Price</strong> = just mark this deal as seen (no price logged).
              <strong> Log as Bought</strong> = you actually purchased this — adds to your price history.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-600"
            >
              Cancel
            </button>
            {trackedMatch ? (
              <>
                <button
                  onClick={() => handleAdd("flyer")}
                  disabled={saving}
                  className="flex-1 py-3 bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Note Flyer Price"}
                </button>
                <button
                  onClick={() => handleAdd("manual")}
                  disabled={saving}
                  className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Log as Bought"}
                </button>
              </>
            ) : (
              <button
                onClick={() => handleAdd("flyer")}
                disabled={saving}
                className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
              >
                {saving ? "Saving…" : "Start Tracking"}
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
    </>
  );
}

function getExpiryBadge(validTo: string | null | undefined): string | null {
  if (!validTo) return null;
  const hoursLeft = (new Date(validTo).getTime() - Date.now()) / 3600000;
  if (hoursLeft < 0) return null;
  if (hoursLeft <= 24) return "last day";
  if (hoursLeft <= 48) return "ends tomorrow";
  return null;
}

// ── Item card ─────────────────────────────────────────────────────────────────

function FlyerCard({
  item,
  added,
  onAction,
  onDismiss,
  showCompare = true,
}: {
  item: FlyerBrowseItemWithNormal;
  added: boolean;
  onAction: () => void;
  onDismiss?: () => void;
  showCompare?: boolean;
}) {
  const { flippItem, trackedMatch, normalUnitPrice, normalUnit } = item;
  const unitLabel = flippItem.unit?.replace("per ", "");
  // Green/grey comparison colouring for best deals tab
  const canCompare = flippItem.unitPrice !== null && normalUnitPrice != null && flippItem.unit === normalUnit;
  const flyerCheaper = canCompare ? flippItem.unitPrice! < normalUnitPrice! : null;
  const flyerPriceColor = flyerCheaper === true ? "text-green-700" : flyerCheaper === false ? "text-gray-400" : "text-gray-900";
  const normalPriceColor = flyerCheaper === false ? "text-green-700" : "text-gray-400";
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  return (
    <>
    {lightboxImg && (
      <ImageLightbox src={lightboxImg} alt={flippItem.name} onClose={() => setLightboxImg(null)} />
    )}
    <div className={`bg-white rounded-xl border p-4 flex gap-3 items-start ${
      added ? "border-green-200 opacity-60" : trackedMatch ? "border-brand-200" : "border-gray-200 dark:border-gray-700"
    }`}>
      {flippItem.imageUrl && (
        <img
          src={flippItem.imageUrl}
          alt={flippItem.name}
          className="w-12 h-12 rounded-lg object-cover shrink-0 bg-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
          loading="lazy"
          onClick={() => setLightboxImg(flippItem.imageUrl!)}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm leading-snug">{flippItem.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{flippItem.merchantName}</p>
        {flippItem.saleStory && (
          <p className="text-xs text-orange-600 font-medium mt-0.5">{flippItem.saleStory}</p>
        )}
        {(() => {
          const badge = getExpiryBadge(flippItem.validTo);
          return badge ? (
            <span className="inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">⏰ {badge}</span>
          ) : null;
        })()}
        {trackedMatch && !added && (
          <div className="flex items-center gap-1 mt-1">
            <p className="text-xs text-brand-600">
              → tracked as <strong>{trackedMatch.name}</strong>
            </p>
            {onDismiss && (
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                className="text-xs text-gray-400 hover:text-red-500 ml-1 transition-colors"
                title="Dismiss this match"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className={`text-base font-bold ${flyerPriceColor}`}>${flippItem.currentPrice.toFixed(2)}</p>
        {flippItem.unitPrice && unitLabel && (
          <p className={`text-xs ${flyerPriceColor}`}>${flippItem.unitPrice.toFixed(2)}/{unitLabel}</p>
        )}
        {!flippItem.unitPrice && flippItem.postPriceText && (
          <p className="text-xs text-gray-500">${flippItem.currentPrice.toFixed(2)}/{flippItem.postPriceText.replace(/^\/?\s*/, "").toLowerCase()}</p>
        )}
        {normalUnitPrice && normalUnit && (
          <p className={`text-xs mt-0.5 ${normalPriceColor}`}>Normal: ${normalUnitPrice.toFixed(2)}/{normalUnit.replace("per ", "")}</p>
        )}
        {added ? (
          <span className="mt-2 inline-block text-xs text-green-600 font-semibold">✓ Added</span>
        ) : (
          <div className="mt-2 flex gap-1.5">
            {(showCompare || !trackedMatch) && (
              <button
                onClick={onAction}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  trackedMatch
                    ? "bg-brand-100 text-brand-700"
                    : "bg-orange-100 text-orange-700"
                }`}
              >
                {trackedMatch ? "Compare" : "Track This"}
              </button>
            )}
            <button
              onClick={() => {
                const name = trackedMatch?.name ?? simplifyFlyerName(flippItem.name);
                fetch("/api/shopping-list", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, category: trackedMatch?.category ?? "Other" }),
                })
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.id && !data.checked) {
                      toast(`Added ${name} to list`, "success");
                    } else {
                      toast(`${name} is already on your list`, "info");
                    }
                  })
                  .catch(() => toast("Failed to add to list", "error"));
              }}
              className="px-2 py-1.5 rounded-lg text-xs bg-gray-100 hover:bg-brand-100 hover:text-brand-700 transition-colors active:scale-95"
              title="Add to shopping list"
            >
              🛒
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function FlyerPageContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "deals" ? "deals" : searchParams.get("tab") === "tracked" ? "tracked" : "new";
  const [items, setItems] = useState<FlyerBrowseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"new" | "tracked" | "deals">(initialTab);
  const [filter, setFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("All");
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const { toast } = useToast();
  // Confirm dialog for dismiss
  const [confirmDismiss, setConfirmDismiss] = useState<{ trackedItemId: number; flippId: number; itemName: string; trackedName: string } | null>(null);
  // Dismissed flyer items (per tracked item) — loaded from API
  const [dismissed, setDismissed] = useState<Map<string, Set<number>>>(new Map());
  // Best deals data
  const [deals, setDeals] = useState<DealResult[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Load dismissed matches from API
  useEffect(() => {
    fetch("/api/flyer-dismissed")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const map = new Map<string, Set<number>>();
        data.forEach((d: { trackedItemId: number; flippId: number }) => {
          const key = `${d.trackedItemId}`;
          if (!map.has(key)) map.set(key, new Set());
          map.get(key)!.add(d.flippId);
        });
        setDismissed(map);
      })
      .catch(() => {});
  }, []);

  const [added, setAdded] = useState<Set<number>>(() => {
    try {
      const raw = sessionStorage.getItem("flyer-added");
      return new Set(JSON.parse(raw ?? "[]") as number[]);
    } catch {
      return new Set();
    }
  });

  const loadFlyerData = useCallback(() => {
    fetch("/api/flyer-items")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setItems(d); })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Load flyer deals for Best Deals tab
    fetch("/api/flyer-deals")
      .then((r) => r.json())
      .then((d: DealResult[]) => { if (Array.isArray(d)) setDeals(d); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadFlyerData(); }, [loadFlyerData]);
  useRefreshOnFocus(loadFlyerData);

  const stores = useMemo(() => {
    const s = new Set(items.map((i) => i.flippItem.merchantName));
    return ["All", ...Array.from(s).sort()];
  }, [items]);

  const newItems = items.filter((i) => !i.trackedMatch);
  // "On Your List" = matched to a tracked item BUT no unit price detected — needs human intervention
  const trackedItems = items.filter((i) => i.trackedMatch && !i.flippItem.unitPrice);
  const uniqueTrackedCount = new Set(trackedItems.map((i) => i.trackedMatch!.id)).size;

  // Deals tab: only show deals where flyer price is cheaper than normal
  const cheaperDeals = deals.filter((d) => d.isCheaper);
  const dealFlyerItems: FlyerBrowseItemWithNormal[] = cheaperDeals.map((deal) => ({
    flippItem: deal.bestDeal,
    trackedMatch: { id: deal.itemId, name: deal.itemName, unit: deal.flyerUnit || "each", category: "Other", recentlyLogged: false },
    normalUnitPrice: deal.normalUnitPrice,
    normalUnit: deal.normalUnit,
  }));

  const displayed = (tab === "deals" ? dealFlyerItems : tab === "new" ? newItems : trackedItems) as FlyerBrowseItemWithNormal[];
  const displayedFiltered = displayed.filter((i) => {
    // Hide if already added this session
    if (added.has(i.flippItem.id)) return false;
    // Hide if dismissed for this tracked item
    if (i.trackedMatch) {
      const key = `${i.trackedMatch.id}`;
      const dismissedSet = dismissed.get(key);
      if (dismissedSet && dismissedSet.has(i.flippItem.id)) return false;
    }
    const matchesStore = selectedStores.size === 0 || selectedStores.has(i.flippItem.merchantName);
    const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(deriveFlyerCategory(i.flippItem.name));
    const matchesFilter =
      !filter ||
      i.flippItem.name.toLowerCase().includes(filter.toLowerCase()) ||
      i.trackedMatch?.name.toLowerCase().includes(filter.toLowerCase());
    return matchesStore && matchesCategory && matchesFilter;
  });

  function handleDismiss(trackedItemId: number, flippId: number) {
    // Persist to database
    fetch("/api/flyer-dismissed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackedItemId, flippId }),
    }).catch(() => {});

    setDismissed((prev) => {
      const key = `${trackedItemId}`;
      const next = new Map(prev);
      const set = new Set(next.get(key) || []);
      set.add(flippId);
      next.set(key, set);
      return next;
    });
    toast("Match dismissed for this flyer", "info");
  }

  function handleAdded(flippId: number, itemName: string) {
    toast(`Added ${itemName}`, "success");
    setAdded((prev) => {
      const next = new Set(prev).add(flippId);
      try { sessionStorage.setItem("flyer-added", JSON.stringify([...next])); } catch {}
      return next;
    });
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
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">🏷️ This Week&apos;s Flyers</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Browse this week&apos;s deals and match them against your tracked items.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetch("/api/flyer-items")
              .then((r) => r.json())
              .then((d) => {
                if (Array.isArray(d)) {
                  setItems(d);
                  toast(`Loaded ${d.length} flyer items`, "success");
                }
              })
              .catch(() => toast("Failed to refresh", "error"))
              .finally(() => setLoading(false));
          }}
          className="shrink-0 px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors active:scale-95"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Search */}
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter items…"
        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {/* Filter button */}
      {/* Filter panel */}
      {(() => {
        const activeCount = selectedStores.size + selectedCategories.size;
        const availableCategories = [...new Set(newItems.map((i) => deriveFlyerCategory(i.flippItem.name)))].sort();
        return (
          <div className="space-y-2">
            {/* Toggle row */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilterSheet((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  activeCount > 0
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-400"
                }`}
              >
                <span>{showFilterSheet ? "▴" : "▾"} Filter</span>
                {activeCount > 0 && (
                  <span className="bg-white/30 rounded-full px-1.5 font-bold">{activeCount}</span>
                )}
              </button>
              {activeCount > 0 && (
                <button
                  onClick={() => { setSelectedStores(new Set()); setSelectedCategories(new Set()); }}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Expandable filter panel */}
            {showFilterSheet && (
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-3 border border-gray-200 dark:border-gray-700">
                {/* Stores */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">Stores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stores.filter((s) => s !== "All").map((s) => (
                      <button
                        key={s}
                        onClick={() => setSelectedStores((prev) => {
                          const next = new Set(prev);
                          next.has(s) ? next.delete(s) : next.add(s);
                          return next;
                        })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedStores.has(s)
                            ? "bg-brand-600 text-white"
                            : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-brand-400"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Categories */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategories((prev) => {
                          const next = new Set(prev);
                          next.has(cat) ? next.delete(cat) : next.add(cat);
                          return next;
                        })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedCategories.has(cat)
                            ? "bg-brand-600 text-white"
                            : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-brand-400"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

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
          On Your List {!loading && `(${uniqueTrackedCount})`}
        </button>
        <button
          onClick={() => setTab("deals")}
          className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === "deals"
              ? "border-green-500 text-green-600"
              : "border-transparent text-gray-500"
          }`}
        >
          💰 Best Deals {!loading && `(${cheaperDeals.length})`}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <FlyerCardSkeleton key={i} />)}
        </div>
      ) : displayedFiltered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">🔍</p>
          <p className="text-sm">
            {tab === "new"
              ? "No new flyer items found this week"
              : tab === "deals"
              ? "No deals cheaper than your recorded prices this week"
              : "None of your tracked items are on flyer this week"}
          </p>
        </div>
      ) : tab === "new" ? (
        // "New Finds" tab — grouped by derived category
        <div className="space-y-4 pb-4">
          {(() => {
            const groups = new Map<string, FlyerBrowseItemWithNormal[]>();
            displayedFiltered.forEach((item) => {
              const cat = deriveFlyerCategory(item.flippItem.name);
              if (!groups.has(cat)) groups.set(cat, []);
              groups.get(cat)!.push(item);
            });
            return Array.from(groups.entries()).map(([cat, catItems]) => {
              const isCollapsed = collapsedCategories.has(cat);
              return (
                <div key={cat}>
                  <button
                    onClick={() => setCollapsedCategories((prev) => {
                      const next = new Set(prev);
                      if (next.has(cat)) next.delete(cat); else next.add(cat);
                      return next;
                    })}
                    className="w-full flex items-center justify-between px-1 py-1.5 text-left"
                  >
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {cat} ({catItems.length})
                    </h3>
                    <span className="text-gray-400 text-xs">{isCollapsed ? "▶" : "▼"}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2">
                      {catItems.map((item) => (
                        <FlyerCard
                          key={item.flippItem.id}
                          item={item}
                          added={added.has(item.flippItem.id)}
                          onAction={() => setModal({ flippItem: item.flippItem, trackedMatch: item.trackedMatch })}
                          onDismiss={item.trackedMatch ? () => setConfirmDismiss({
                            trackedItemId: item.trackedMatch!.id,
                            flippId: item.flippItem.id,
                            itemName: item.flippItem.name,
                            trackedName: item.trackedMatch!.name,
                          }) : undefined}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      ) : tab === "tracked" ? (
        // "On Your List" tab — grouped by tracked item
        <div className="space-y-4 pb-4">
          {(() => {
            const groups = new Map<number, { name: string; items: FlyerBrowseItemWithNormal[] }>();
            displayedFiltered.forEach((item) => {
              if (!item.trackedMatch) return;
              const id = item.trackedMatch.id;
              if (!groups.has(id)) groups.set(id, { name: item.trackedMatch.name, items: [] });
              groups.get(id)!.items.push(item);
            });
            return Array.from(groups.entries()).map(([groupId, group]) => (
              <div key={groupId} className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  📦 {group.name}
                </h3>
                {group.items.map((item) => (
                  <FlyerCard
                    key={item.flippItem.id}
                    item={item}
                    added={added.has(item.flippItem.id)}
                    onAction={() => setModal({ flippItem: item.flippItem, trackedMatch: item.trackedMatch })}
                    onDismiss={item.trackedMatch ? () => setConfirmDismiss({
                      trackedItemId: item.trackedMatch!.id,
                      flippId: item.flippItem.id,
                      itemName: item.flippItem.name,
                      trackedName: item.trackedMatch!.name,
                    }) : undefined}
                  />
                ))}
              </div>
            ));
          })()}
        </div>
      ) : (
        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 pb-4">
          {displayedFiltered.map((item) => (
            <FlyerCard
              key={item.flippItem.id}
              item={item}
              added={added.has(item.flippItem.id)}
              showCompare={false}
              onAction={() => setModal({ flippItem: item.flippItem, trackedMatch: item.trackedMatch })}
              onDismiss={item.trackedMatch ? () => setConfirmDismiss({
                trackedItemId: item.trackedMatch!.id,
                flippId: item.flippItem.id,
                itemName: item.flippItem.name,
                trackedName: item.trackedMatch!.name,
              }) : undefined}
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

      {/* Confirm dismiss */}
      {confirmDismiss && (
        <ConfirmDialog
          title="Dismiss Flyer Match?"
          message={`This will remove "${confirmDismiss.itemName}" from matching "${confirmDismiss.trackedName}" in your flyer deals. The item will no longer appear in your tracked flyer deals comparison. You can re-add it next week when new flyers arrive.`}
          confirmLabel="Dismiss Match"
          onConfirm={() => {
            handleDismiss(confirmDismiss.trackedItemId, confirmDismiss.flippId);
            setConfirmDismiss(null);
          }}
          onCancel={() => setConfirmDismiss(null)}
        />
      )}
    </div>
  );
}

export default function FlyerPage() {
  return (
    <Suspense fallback={<div className="px-4 py-4 text-gray-500">Loading…</div>}>
      <FlyerPageContent />
    </Suspense>
  );
}

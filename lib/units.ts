// Unit conversion utilities
// Scale = how many kg (or L) one "unit" represents
const weightScale: Record<string, number> = {
  "per kg":  1,
  "per lb":  0.453592,
  "per 100g": 0.1,
};

const volumeScale: Record<string, number> = {
  "per L":    1,
  "per 100mL": 0.1,
};

// Convert a unit price from one unit to another.
// Formula: priceTo = priceFrom * scale[to] / scale[from]
// Returns null if units are incompatible (e.g. lb → L)
export function convertUnitPrice(price: number, fromUnit: string, toUnit: string): number | null {
  if (fromUnit === toUnit) return price;
  if (fromUnit in weightScale && toUnit in weightScale) {
    return price * weightScale[toUnit] / weightScale[fromUnit];
  }
  if (fromUnit in volumeScale && toUnit in volumeScale) {
    return price * volumeScale[toUnit] / volumeScale[fromUnit];
  }
  return null;
}

// The canonical unit to normalize to for comparison (per kg for weight, per L for volume)
export function getCanonicalUnit(unit: string): string {
  if (unit in weightScale) return "per kg";
  if (unit in volumeScale) return "per L";
  return unit;
}

// Returns true if two units can be converted between each other
export function sameUnitGroup(unit1: string, unit2: string): boolean {
  return (
    (unit1 in weightScale && unit2 in weightScale) ||
    (unit1 in volumeScale && unit2 in volumeScale)
  );
}

// Normalize a price to its canonical unit for comparison
export function normalizePrice(price: number, unit: string): { price: number; unit: string } {
  const canonical = getCanonicalUnit(unit);
  const converted = convertUnitPrice(price, unit, canonical);
  return converted !== null ? { price: converted, unit: canonical } : { price, unit };
}

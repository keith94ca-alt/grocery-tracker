import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { matchesTrackedItem, simplifyFlyerName } from "@/lib/flipp";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return handleJsonImport(request);
    }

    if (contentType.includes("text/csv")) {
      return handleCsvImport(request);
    }

    return NextResponse.json(
      { error: "Unsupported content type. Use application/json or text/csv" },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

async function handleJsonImport(request: NextRequest) {
  const data = await request.json();

  if (!data.items || !Array.isArray(data.items)) {
    return NextResponse.json({ error: "Invalid JSON format: missing items array" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  for (const item of data.items) {
    // Check if item already exists
    const existing = await prisma.item.findUnique({ where: { name: item.name } });
    if (existing) {
      skipped++;
      continue;
    }

    // Create item
    const created = await prisma.item.create({
      data: {
        name: item.name,
        category: item.category || "Other",
        unit: item.unit || "each",
        watched: item.watched || false,
        targetPrice: item.targetPrice || null,
        upc: item.upc || null,
        brand: item.brand || null,
        imageUrl: item.imageUrl || null,
      },
    });

    // Import price entries
    if (item.priceEntries && Array.isArray(item.priceEntries)) {
      for (const entry of item.priceEntries) {
        await prisma.priceEntry.create({
          data: {
            itemId: created.id,
            price: entry.price,
            quantity: entry.quantity,
            unitPrice: entry.unitPrice,
            unit: entry.unit,
            store: entry.store,
            source: entry.source || "manual",
            priceType: entry.priceType || "normal",
            date: new Date(entry.date),
            notes: entry.notes,
          },
        });
        // Ensure store exists
        await prisma.store.upsert({
          where: { name: entry.store },
          update: {},
          create: { name: entry.store, type: "grocery" },
        });
      }
    }

    imported++;
  }

  return NextResponse.json({ imported, skipped, total: data.items.length });
}

function normalizeImportName(name: string) {
  return simplifyFlyerName(name)
    .toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s?(?:ml|l|g|kg|lb|oz|pack|pk|ct)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function importKeywords(name: string) {
  return normalizeImportName(name)
    .split(" ")
    .filter((word) => word && !/^\d+$/.test(word) && !/^(ml|l|g|kg|lb|oz|pack|pk|ct)$/.test(word));
}

function keywordSubsetMatch(a: string[], b: string[]) {
  if (a.length < 2 || b.length < 2) return false;
  const setA = new Set(a);
  const setB = new Set(b);
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger = setA.size <= setB.size ? setB : setA;
  return Array.from(smaller).every((word) => larger.has(word));
}

function findFuzzyNameMatch(
  itemName: string,
  items: { id: number; name: string }[]
) {
  const exact = items.find((item) => item.name.toLowerCase() === itemName.toLowerCase());
  if (exact) return exact;

  const normalizedInput = normalizeImportName(itemName);
  const inputKeywords = importKeywords(itemName);

  return items.find((item) => {
    const normalizedExisting = normalizeImportName(item.name);
    const existingKeywords = importKeywords(item.name);
    return (
      normalizedInput === normalizedExisting ||
      normalizedInput.includes(normalizedExisting) ||
      normalizedExisting.includes(normalizedInput) ||
      keywordSubsetMatch(inputKeywords, existingKeywords) ||
      matchesTrackedItem(itemName, item.name) ||
      matchesTrackedItem(item.name, itemName)
    );
  }) || null;
}

async function handleCsvImport(request: NextRequest) {
  const csv = await request.text();
  const lines = csv.trim().split("\n");

  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have a header and at least one data row" }, { status: 400 });
  }

  // Parse header
  const header = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf("date");
  const nameIdx = header.indexOf("name");
  const itemIdx = nameIdx >= 0 ? nameIdx : header.indexOf("item");
  const categoryIdx = header.indexOf("category");
  const storeIdx = header.indexOf("store");
  const priceIdx = header.indexOf("price");
  const qtyIdx = header.indexOf("quantity");
  const unitPriceIdx = header.indexOf("unit price");
  const unitIdx = header.indexOf("unit");
  const sourceIdx = header.indexOf("source");
  const notesIdx = header.indexOf("notes");
  const upcIdx = header.indexOf("upc");
  const brandIdx = header.indexOf("brand");
  const imageUrlIdx = header.indexOf("image") >= 0 ? header.indexOf("image") : header.indexOf("imageurl") >= 0 ? header.indexOf("imageurl") : header.indexOf("image_url") >= 0 ? header.indexOf("image_url") : -1;

  let imported = 0;
  let skipped = 0;
  let upcMatched = 0;
  let upcCreated = 0;
  let nameMatched = 0;
  const existingItems = await prisma.item.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    if (cols.length < 5) continue;

    const itemName = cols[itemIdx]?.trim();
    if (!itemName) {
      skipped++;
      continue;
    }

    const price = parseFloat(cols[priceIdx]);
    if (isNaN(price) || price <= 0) {
      skipped++;
      continue;
    }

    const rawUpc = upcIdx >= 0 ? cols[upcIdx]?.trim() || "" : "";
    const validUpc = /^\d{12,13}$/.test(rawUpc) ? rawUpc : null;
    const brand = brandIdx >= 0 ? cols[brandIdx]?.trim() || null : null;
    const imageUrl = imageUrlIdx >= 0 ? cols[imageUrlIdx]?.trim() || null : null;
    const category = cols[categoryIdx]?.trim() || "Other";
    const rowUnit = cols[unitIdx]?.trim() || "each";

    // Find or create item
    let item = null;
    if (validUpc) {
      item = await prisma.item.findUnique({ where: { upc: validUpc } });
      if (item) {
        upcMatched++;
      } else {
        item = await prisma.item.create({
          data: {
            name: itemName,
            category,
            unit: rowUnit,
            upc: validUpc,
            brand,
            imageUrl,
          },
        });
        existingItems.push({ id: item.id, name: item.name });
        upcCreated++;
      }
    }

    if (!item) {
      const fuzzyMatch = findFuzzyNameMatch(itemName, existingItems);
      if (fuzzyMatch) {
        item = await prisma.item.findUnique({ where: { id: fuzzyMatch.id } });
        nameMatched++;
      } else {
        item = await prisma.item.create({
          data: {
            name: itemName,
            category,
            unit: rowUnit,
            brand,
            imageUrl,
          },
        });
        existingItems.push({ id: item.id, name: item.name });
      }
    }

    const quantity = parseFloat(cols[qtyIdx]) || 1;
    const store = cols[storeIdx]?.trim() || "Unknown";
    const unitPrice = parseFloat(cols[unitPriceIdx]) || price / quantity;

    await prisma.priceEntry.create({
      data: {
        itemId: item.id,
        price,
        quantity,
        unitPrice,
        unit: rowUnit || item.unit,
        store,
        source: cols[sourceIdx]?.trim() || "manual",
        priceType: "normal",
        date: new Date(cols[dateIdx] || new Date()),
        notes: cols[notesIdx]?.trim() || null,
      },
    });

    await prisma.store.upsert({
      where: { name: store },
      update: {},
      create: { name: store, type: "grocery" },
    });

    imported++;
  }

  return NextResponse.json({ imported, skipped, upcMatched, upcCreated, nameMatched, total: lines.length - 1 });
}

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

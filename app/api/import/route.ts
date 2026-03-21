import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFamilyId } from "@/lib/auth";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  const familyId = getFamilyId(request);

  // Reject oversized uploads before reading the body
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum import size is 5MB." }, { status: 413 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return handleJsonImport(request, familyId);
    }

    if (contentType.includes("text/csv")) {
      return handleCsvImport(request, familyId);
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

async function handleJsonImport(request: NextRequest, familyId: string | null) {
  const data = await request.json();

  if (!data.items || !Array.isArray(data.items)) {
    return NextResponse.json({ error: "Invalid JSON format: missing items array" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  for (const item of data.items) {
    const existing = await prisma.item.findFirst({ where: { name: item.name, familyId } });
    if (existing) {
      skipped++;
      continue;
    }

    const created = await prisma.item.create({
      data: {
        name: item.name,
        category: item.category || "Other",
        unit: item.unit || "each",
        watched: item.watched || false,
        targetPrice: item.targetPrice || null,
        familyId,
      },
    });

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
            familyId,
          },
        });
        await prisma.store.upsert({
          where: { name_familyId: { name: entry.store, familyId: familyId ?? "" } },
          update: {},
          create: { name: entry.store, type: "grocery", familyId },
        });
      }
    }

    imported++;
  }

  return NextResponse.json({ imported, skipped, total: data.items.length });
}

async function handleCsvImport(request: NextRequest, familyId: string | null) {
  const csv = await request.text();
  const lines = csv.trim().split("\n");

  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have a header and at least one data row" }, { status: 400 });
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf("date");
  const itemIdx = header.indexOf("item");
  const categoryIdx = header.indexOf("category");
  const storeIdx = header.indexOf("store");
  const priceIdx = header.indexOf("price");
  const qtyIdx = header.indexOf("quantity");
  const unitPriceIdx = header.indexOf("unit price");
  const unitIdx = header.indexOf("unit");
  const sourceIdx = header.indexOf("source");
  const notesIdx = header.indexOf("notes");

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    if (cols.length < 5) continue;

    const itemName = cols[itemIdx]?.trim();
    if (!itemName) continue;

    let item = await prisma.item.findFirst({ where: { name: itemName, familyId } });
    if (!item) {
      item = await prisma.item.create({
        data: {
          name: itemName,
          category: cols[categoryIdx]?.trim() || "Other",
          unit: cols[unitIdx]?.trim() || "each",
          familyId,
        },
      });
    }

    const price = parseFloat(cols[priceIdx]);
    if (isNaN(price) || price <= 0) {
      skipped++;
      continue;
    }

    const store = cols[storeIdx]?.trim() || "Unknown";
    const unitPrice = parseFloat(cols[unitPriceIdx]) || price / (parseFloat(cols[qtyIdx]) || 1);

    await prisma.priceEntry.create({
      data: {
        itemId: item.id,
        price,
        quantity: parseFloat(cols[qtyIdx]) || 1,
        unitPrice,
        unit: cols[unitIdx]?.trim() || item.unit,
        store,
        source: cols[sourceIdx]?.trim() || "manual",
        priceType: "normal",
        date: new Date(cols[dateIdx] || new Date()),
        notes: cols[notesIdx]?.trim() || null,
        familyId,
      },
    });

    await prisma.store.upsert({
      where: { name_familyId: { name: store, familyId: familyId ?? "" } },
      update: {},
      create: { name: store, type: "grocery", familyId },
    });

    imported++;
  }

  return NextResponse.json({ imported, skipped, total: lines.length - 1 });
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

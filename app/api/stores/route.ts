import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  try {
    const stores = await prisma.store.findMany({
      where: query
        ? { name: { contains: query } }
        : undefined,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(stores);
  } catch (error) {
    console.error("GET /api/stores error:", error);
    return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 });
  }
}

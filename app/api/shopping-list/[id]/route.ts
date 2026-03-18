import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.checked !== undefined) data.checked = body.checked;
    if (body.priceLogged !== undefined) data.priceLogged = body.priceLogged;
    if (body.price !== undefined) data.price = body.price;
    if (body.category !== undefined) data.category = body.category;
    if (body.name !== undefined) data.name = body.name;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

    const item = await prisma.shoppingListItem.update({
      where: { id },
      data,
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error("PATCH /api/shopping-list/[id] error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    await prisma.shoppingListItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/shopping-list/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}

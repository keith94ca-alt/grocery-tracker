-- CreateTable
CREATE TABLE "FlyerNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemId" INTEGER NOT NULL,
    "flippId" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "validTo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlyerNote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable: Add priceType column (default "normal")
ALTER TABLE "PriceEntry" ADD COLUMN "priceType" TEXT NOT NULL DEFAULT "normal";

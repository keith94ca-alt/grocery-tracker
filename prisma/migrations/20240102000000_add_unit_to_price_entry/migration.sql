-- Add unit column to PriceEntry (stores the unit used when price was entered)
ALTER TABLE "PriceEntry" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'each';

-- Backfill unit from the related Item
UPDATE "PriceEntry" SET "unit" = (
  SELECT "unit" FROM "Item" WHERE "Item"."id" = "PriceEntry"."itemId"
);

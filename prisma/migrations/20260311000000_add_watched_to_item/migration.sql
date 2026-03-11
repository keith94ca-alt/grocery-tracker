-- AlterTable: add watched column to Item (defaults to false for all existing rows)
ALTER TABLE "Item" ADD COLUMN "watched" BOOLEAN NOT NULL DEFAULT false;

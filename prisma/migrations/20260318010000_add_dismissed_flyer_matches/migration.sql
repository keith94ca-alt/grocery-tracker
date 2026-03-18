-- CreateTable: DismissedFlyerMatch
CREATE TABLE "DismissedFlyerMatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trackedItemId" INTEGER NOT NULL,
    "flippId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "DismissedFlyerMatch_trackedItemId_flippId_key" ON "DismissedFlyerMatch" ("trackedItemId", "flippId");

/*
  Warnings:

  - You are about to drop the column `applyOnWeekend` on the `ShiftType` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShiftType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ShiftType_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShiftType" ("id", "name", "order", "scheduleId") SELECT "id", "name", "order", "scheduleId" FROM "ShiftType";
DROP TABLE "ShiftType";
ALTER TABLE "new_ShiftType" RENAME TO "ShiftType";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

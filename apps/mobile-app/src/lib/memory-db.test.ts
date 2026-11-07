import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearAllData, closeDB, getDB } from "./db";

describe("test-only memory database", () => {
  beforeEach(clearAllData);
  afterEach(async () => {
    await clearAllData();
    await closeDB();
  });

  it("supports compound keys, indexes, and structured value isolation", async () => {
    const db = await getDB();
    const floor = { bl_id: "BL1", SiteId: "SITE-01" as const, LevelName: "01", FloorNumber: 1, IsActive: true };
    await db.put("floors", floor);
    floor.FloorNumber = 9;
    expect(await db.get("floors", ["BL1", "01"])).toMatchObject({ FloorNumber: 1 });
    expect(await db.getAllFromIndex("floors", "by-bl_id", "BL1")).toHaveLength(1);
    const result = await db.get("floors", ["BL1", "01"]);
    if (!result) throw new Error("Missing floor");
    result.FloorNumber = 10;
    expect(await db.get("floors", ["BL1", "01"])).toMatchObject({ FloorNumber: 1 });
  });

  it("clears every store and supports reopen", async () => {
    const db = await getDB();
    await db.put("syncMetadata", { key: "lastSyncTime", value: "now", updatedAt: "now" });
    await db.put("photoQueue", {
      QueueId: "photo", WR_ID: "WR1", OriginalSizeKB: 1, CompressedSizeKB: 1,
      CompressedDataUrl: "data:image/png;base64,AA==", SyncStatus: "PENDING", CreatedAt: "now",
    });
    await clearAllData();
    await closeDB();
    const reopened = await getDB();
    expect(await reopened.getAll("syncMetadata")).toEqual([]);
    expect(await reopened.getAll("photoQueue")).toEqual([]);
  });
});

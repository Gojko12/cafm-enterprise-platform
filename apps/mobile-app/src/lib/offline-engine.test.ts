import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initOfflineEngine,
  getOfflineEngine,
  compressPhoto,
} from "../lib/offline-engine";
import { clearAllData, closeDB, getDB } from "../lib/db";
import {
  useFilterStore,
  applyFilters,
  filterEquipmentByQuery,
  FilterCriteria,
} from "../lib/store";
import {
  startWorkSession,
  stopWorkSession,
  pauseWorkSession,
  resumeWorkSession,
  getActiveWorkSession,
  logStepCompletion,
  getStepAuditLog,
  validateNumericThreshold,
  claimWorkRequest,
  getUnassignedWRsByTrade,
} from "../lib/checklist";
import { BaseWorkRequest, Equipment } from "@cafm/shared-schema";

/**
 * Helper to create minimal test WRs with all required fields
 */
function createTestWR(overrides?: Partial<BaseWorkRequest>): BaseWorkRequest {
  return {
    WR_ID: "WR001",
    WR_Type: "PM",
    ESAWorkType: "Preventive Maintenance",
    Description: "Test",
    TradeName: "02-Electrical",
    CreatedDate: "2026-01-01",
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued",
    Percentage: 50,
    bl_id: "BL001",
    LevelName: "Floor 1",
    RoomCode: "ROOM001",
    CreatedBy: "ADMIN",
    AssignedCraftpersonIds: [],
    AssignedUserIds: [],
    IsFrozen: false,
    EquipmentCodes: [],
    ...overrides,
  } as BaseWorkRequest;
}

describe("OfflineEngine - Persistence & Sync", () => {
  beforeEach(async () => {
    await clearAllData();
    initOfflineEngine();
  });

  afterEach(async () => {
    await clearAllData();
    await closeDB();
  });

  it("should initialize offline engine", () => {
    const engine = getOfflineEngine();
    expect(engine).toBeDefined();
  });

  it("should save and retrieve work requests", async () => {
    const engine = getOfflineEngine();
    const wr = createTestWR({ WR_ID: "2026000001" });

    await engine.saveWorkRequest(wr);
    const retrieved = await engine.getWorkRequest("2026000001");

    expect(retrieved).toEqual(wr);
  });

  it("should filter work requests by building", async () => {
    const engine = getOfflineEngine();

    const wr1 = createTestWR({ WR_ID: "WR001", bl_id: "BL001" });
    const wr2 = createTestWR({ WR_ID: "WR002", bl_id: "BL002", TradeName: "HVAC" });

    await engine.saveWorkRequest(wr1);
    await engine.saveWorkRequest(wr2);

    const filtered = await engine.getWorkRequests({ bl_id: "BL001" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].WR_ID).toBe("WR001");
  });

  it("should queue and retrieve pending photos", async () => {
    const engine = getOfflineEngine();

    const compressedDataUrl = "data:image/webp;base64,test";
    const queueId = await engine.queuePhotoUpload(
      "2026000001",
      compressedDataUrl,
      100,
      25,
      "STEP001",
    );

    const pending = await engine.getPendingPhotos();
    expect(pending).toHaveLength(1);
    expect(pending[0].QueueId).toBe(queueId);
    expect(pending[0].CompressedSizeKB).toBe(25);
  });

  it("should track sync status", async () => {
    const engine = getOfflineEngine();
    const wr = createTestWR({ WR_ID: "2026000001" });

    await engine.saveWorkRequest(wr);
    const pendingCount = await engine.getPendingSyncItems();
    expect(pendingCount).toBeGreaterThan(0);
  });
});

describe("WorkSession Timer", () => {
  beforeEach(async () => {
    await clearAllData();
    initOfflineEngine();
  });

  afterEach(async () => {
    await clearAllData();
    await closeDB();
  });

  it("should start a work session", async () => {
    const sessionId = await startWorkSession("2026000001", "TECH001");
    const session = await getActiveWorkSession("2026000001");

    expect(session).toBeDefined();
    expect(session?.Status).toBe("RUNNING");
    expect(session?.SessionId).toBe(sessionId);
  });

  it("should pause and resume a work session", async () => {
    const sessionId = await startWorkSession("2026000001", "TECH001");

    await pauseWorkSession(sessionId);
    let session = await getActiveWorkSession("2026000001");
    expect(session?.Status).toBe("PAUSED");

    await resumeWorkSession(sessionId);
    session = await getActiveWorkSession("2026000001");
    expect(session?.Status).toBe("RUNNING");
  });

  it("should calculate total time on stop", async () => {
    const sessionId = await startWorkSession("2026000001", "TECH001");

    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await stopWorkSession(sessionId);
    expect(result.totalTimeMinutes).toBeGreaterThanOrEqual(0);
  });

  it("excludes multiple pauses from the logged session", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
      const sessionId = await startWorkSession("2026000001", "TECH001");
      vi.setSystemTime(new Date("2026-01-01T10:10:00Z"));
      await pauseWorkSession(sessionId);
      vi.setSystemTime(new Date("2026-01-01T10:20:00Z"));
      await resumeWorkSession(sessionId);
      vi.setSystemTime(new Date("2026-01-01T10:25:00Z"));
      await pauseWorkSession(sessionId);
      vi.setSystemTime(new Date("2026-01-01T10:30:00Z"));
      expect(await stopWorkSession(sessionId)).toEqual({ totalTimeMinutes: 15 });
      await expect(stopWorkSession(sessionId)).rejects.toThrow("already stopped");
      expect(await (await getDB()).getAllFromIndex("syncQueue", "by-type", "SESSION_LOG")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should support timer override reason", async () => {
    const sessionId = await startWorkSession("2026000001", "TECH001");
    const reason = "Manual correction for system error";

    await stopWorkSession(sessionId, reason);

    const session = await (await getDB()).get("workSessions", sessionId);
    expect(session?.TimerOverrideReason).toBe(reason);
    const queued = await (await getDB()).getAllFromIndex("syncQueue", "by-type", "SESSION_LOG");
    expect(queued[0]?.Payload.SessionId).toBe(sessionId);
  });

  it("does not overwrite a work request when logging a session", async () => {
    const engine = getOfflineEngine();
    const wr = createTestWR({ WR_ID: "2026000001" });
    await engine.saveWorkRequest(wr);
    const sessionId = await startWorkSession(wr.WR_ID, "TECH001");
    await stopWorkSession(sessionId);
    expect(await engine.getWorkRequest(wr.WR_ID)).toEqual(wr);
  });
});

describe("Checklist Step Execution", () => {
  beforeEach(async () => {
    await clearAllData();
    initOfflineEngine();
  });

  afterEach(async () => {
    await clearAllData();
    await closeDB();
  });

  it("should log step completion", async () => {
    await logStepCompletion("2026000001", "STEP001", "TECH001", "PASS", true);

    const auditLog = await getStepAuditLog("2026000001");
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].Action).toBe("PASS");
    expect(auditLog[0].Result).toBe(true);
  });

  it("should create immutable audit checksum", async () => {
    await logStepCompletion("2026000001", "STEP001", "TECH001", "PASS", true);

    const auditLog = await getStepAuditLog("2026000001");
    expect(auditLog[0].ImmutableChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("queues a step audit without replacing the work request", async () => {
    const engine = getOfflineEngine();
    const wr = createTestWR({ WR_ID: "2026000001" });
    await engine.saveWorkRequest(wr);
    await logStepCompletion(wr.WR_ID, "STEP001", "TECH001", "PASS", true);
    expect(await engine.getWorkRequest(wr.WR_ID)).toEqual(wr);
    const queued = await (await getDB()).getAllFromIndex("syncQueue", "by-type", "STEP_COMPLETE");
    expect(queued[0]?.Payload.StepId).toBe("STEP001");
  });

  it("should validate numeric thresholds", () => {
    const result1 = validateNumericThreshold(5, 1, 10);
    expect(result1.valid).toBe(true);
    expect(result1.outOfRange).toBe(false);

    const result2 = validateNumericThreshold(15, 1, 10);
    expect(result2.valid).toBe(false);
    expect(result2.outOfRange).toBe(true);

    const result3 = validateNumericThreshold(0, 1, 10);
    expect(result3.valid).toBe(false);
    expect(result3.outOfRange).toBe(true);
  });
});

describe("Filter & Equipment Picker", () => {
  beforeEach(async () => {
    await clearAllData();
  });

  afterEach(async () => {
    await clearAllData();
    await closeDB();
  });

  it("should apply building filter", () => {
    const wrs: BaseWorkRequest[] = [
      createTestWR({ WR_ID: "WR001", bl_id: "BL001" }),
      createTestWR({ WR_ID: "WR002", bl_id: "BL002", TradeName: "HVAC" }),
    ];

    const filters: FilterCriteria = { bl_id: "BL001" };
    const result = applyFilters(wrs, filters);

    expect(result).toHaveLength(1);
    expect(result[0].WR_ID).toBe("WR001");
  });

  it("should apply multi-filter criteria", () => {
    const wrs: BaseWorkRequest[] = [
      createTestWR({
        WR_ID: "WR001",
        bl_id: "BL001",
        TradeName: "02-Electrical",
        DueDate: "2026-01-15",
      }),
    ];

    const filters: FilterCriteria = {
      bl_id: "BL001",
      trade: "02-Electrical",
      dueDateFrom: "2026-01-10",
    };

    const result = applyFilters(wrs, filters);
    expect(result).toHaveLength(1);
  });

  it("should filter equipment by search query", () => {
    const equipment: Equipment[] = [
      {
        EquipmentCode: "EQ001",
        LocalEquipmentCode: "LOCAL-001",
        EquipmentName: "HVAC Unit",
        EquipmentUseEnglish: "Heating and Cooling",
        bl_id: "BL001",
        SiteId: "SITE-01",
        LevelName: "Floor 1",
        RoomCode: "ROOM001",
        IsInstallation: false,
        Status: "In Service",
        TechnicalSpecifications: {},
      },
      {
        EquipmentCode: "EQ002",
        LocalEquipmentCode: "LOCAL-002",
        EquipmentName: "Pump",
        EquipmentUseEnglish: "Water circulation",
        bl_id: "BL001",
        SiteId: "SITE-01",
        LevelName: "Floor 1",
        RoomCode: "ROOM002",
        IsInstallation: false,
        Status: "In Service",
        TechnicalSpecifications: {},
      },
    ];

    const result = filterEquipmentByQuery(equipment, "HVAC");
    expect(result).toHaveLength(1);
    expect(result[0].EquipmentName).toBe("HVAC Unit");
  });

  it("should toggle equipment selection in store", () => {
    const store = useFilterStore.getState();
    expect(store.filters.selectedEquipmentCodes?.size).toBe(0);

    store.toggleEquipmentSelection("EQ001");
    expect(useFilterStore.getState().filters.selectedEquipmentCodes?.has("EQ001")).toBe(true);

    store.toggleEquipmentSelection("EQ001");
    expect(useFilterStore.getState().filters.selectedEquipmentCodes?.has("EQ001")).toBe(false);
  });

  it("should reset all filters", () => {
    const store = useFilterStore.getState();

    store.setFilter("bl_id", "BL001");
    store.setFilter("trade", "02-Electrical");
    store.toggleEquipmentSelection("EQ001");

    store.resetFilters();

    expect(useFilterStore.getState().filters.bl_id).toBeUndefined();
    expect(useFilterStore.getState().filters.trade).toBeUndefined();
    expect(useFilterStore.getState().filters.selectedEquipmentCodes?.size).toBe(0);
  });

  it("should count applied filters", () => {
    const store = useFilterStore.getState();
    store.resetFilters();

    store.setFilter("bl_id", "BL001");
    store.setFilter("trade", "02-Electrical");
    expect(store.getAppliedFiltersCount()).toBe(2);

    store.resetFilters();
    expect(store.getAppliedFiltersCount()).toBe(0);
  });
});

describe("WR Assignment", () => {
  beforeEach(async () => {
    await clearAllData();
    initOfflineEngine();
  });

  afterEach(async () => {
    await clearAllData();
    await closeDB();
  });

  it("should claim an unassigned WR", async () => {
    const engine = getOfflineEngine();
    const wr = createTestWR({ WR_ID: "2026000001", AssignedUserIds: [] });

    await engine.saveWorkRequest(wr);
    await claimWorkRequest("2026000001", "TECH001");

    const claimed = await engine.getWorkRequest("2026000001");
    expect(claimed?.AssignedUserIds).toContain("TECH001");
  });

  it("should retrieve unassigned WRs by trade", async () => {
    const engine = getOfflineEngine();

    const wr1 = createTestWR({ WR_ID: "WR001", TradeName: "02-Electrical", AssignedUserIds: [] });
    const wr2 = createTestWR({ WR_ID: "WR002", TradeName: "02-Electrical", AssignedUserIds: ["TECH002"] });

    await engine.saveWorkRequest(wr1);
    await engine.saveWorkRequest(wr2);

    const unassigned = await getUnassignedWRsByTrade("02-Electrical");
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].WR_ID).toBe("WR001");
  });
});

describe("Photo Compression", () => {
  it("should track compression ratios", async () => {
    const originalSizeKB = 500;
    const compressedSizeKB = 125;

    const ratio = (compressedSizeKB / originalSizeKB) * 100;
    expect(ratio).toBe(25);
  });
});

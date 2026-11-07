import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  escalatePMToFastJob,
  escalateFastJobToLongJob,
  resolveNextAcceptanceSubstatus,
  updateAcceptanceGateStatus,
  canRoleExecuteLJAction,
  EscalatePMToFJRequest,
  EscalateFJToLJRequest,
  AcceptanceGateConfig,
  WRLifecycleContext,
} from "./wr-lifecycle.js";
import { Timestamp } from "firebase-admin/firestore";

describe("Phase 6 Escalation & Lifecycle Functions", () => {
  let mockFirestore: any;
  let mockLogger: any;
  let context: WRLifecycleContext;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    mockFirestore = {
      collectionGroup: vi.fn(),
      collection: vi.fn(),
      runTransaction: vi.fn(),
    };

    context = {
      firestore: mockFirestore,
      logger: mockLogger,
    };
  });

  describe("escalatePMToFastJob", () => {
    it("should fail when FJ cost exceeds 750 EUR", async () => {
      const request: EscalatePMToFJRequest = {
        pmWrId: "2026000001",
        estimatedCostEur: 800,
        description: "Should fail",
        userId: "user123",
        timestamp: new Date(),
      };

      const result = await escalatePMToFastJob(request, context);

      expect(result.success).toBe(false);
      expect(result.message).toContain("exceeds 750 EUR");
    });

    it("should successfully escalate PM to FJ with valid cost", async () => {
      const request: EscalatePMToFJRequest = {
        pmWrId: "2026000001",
        estimatedCostEur: 500,
        description: "Broken door repair",
        userId: "user123",
        timestamp: new Date(),
      };

      const pmDocData = {
        WR_ID: "2026000001",
        WR_Type: "PM",
        ESAWorkType: "Preventive Maintenance",
        Description: "Monthly maintenance",
        ProblemLocation: "Building A",
        TradeId: "trade-plumbing",
        TradeName: "Plumbing",
        EquipmentCodes: ["EQ-001"],
        bl_id: "BLD-01",
        LevelName: "Floor 1",
        RoomCode: "R-101",
        SiteId: "SITE-01",
        Percentage: 50,
      };

      const mockWRRef = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            set: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      mockFirestore.collectionGroup.mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            empty: false,
            docs: [{ data: () => pmDocData }],
          }),
        }),
      });

      mockFirestore.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue({
          set: vi.fn().mockResolvedValue(undefined),
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              set: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        }),
        add: vi.fn().mockResolvedValue({ id: "audit-001" }),
      });

      mockFirestore.runTransaction.mockImplementation(async (fn: any) => {
        await fn({
          get: vi.fn().mockResolvedValue({
            exists: false,
          }),
          update: vi.fn(),
        });
      });

      const result = await escalatePMToFastJob(request, context);

      expect(result.success).toBe(true);
      expect(result.fjWrId).toBeDefined();
      expect(result.message).toContain("Fast Job");
      expect(result.message).toContain("50%");
    });
  });

  describe("escalateFastJobToLongJob", () => {
    it("should fail when LJ cost is below 750 EUR", async () => {
      const request: EscalateFJToLJRequest = {
        fjWrId: "2026000002",
        ljType: "RFQ",
        estimatedCostEur: 700,
        userId: "user123",
        timestamp: new Date(),
      };

      const result = await escalateFastJobToLongJob(request, context);

      expect(result.success).toBe(false);
      expect(result.message).toContain(">= 750 EUR");
    });

    it("should successfully escalate FJ to LJ with valid cost", async () => {
      const request: EscalateFJToLJRequest = {
        fjWrId: "2026000002",
        ljType: "RFQ",
        estimatedCostEur: 1000,
        userId: "user123",
        timestamp: new Date(),
      };

      const fjDocData = {
        WR_ID: "2026000002",
        WR_Type: "FJ",
        ESAWorkType: "Corrective Maintenance",
        Description: "Roof repair",
        ProblemLocation: "Building A - Roof",
        TradeId: "trade-roofing",
        TradeName: "Roofing",
        EquipmentCodes: ["EQ-002"],
        ParentPM_WR_ID: "2026000001",
        bl_id: "BLD-01",
        LevelName: "Floor 5",
        RoomCode: "R-501",
        SiteId: "SITE-01",
        Percentage: 50,
      };

      const mockWRRef = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            set: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      mockFirestore.collectionGroup.mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            empty: false,
            docs: [{ data: () => fjDocData }],
          }),
        }),
      });

      mockFirestore.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue({
          set: vi.fn().mockResolvedValue(undefined),
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              set: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        }),
        add: vi.fn().mockResolvedValue({ id: "audit-002" }),
      });

      mockFirestore.runTransaction.mockImplementation(async (fn: any) => {
        await fn({
          get: vi.fn().mockResolvedValue({
            exists: false,
          }),
          update: vi.fn(),
        });
      });

      const result = await escalateFastJobToLongJob(request, context);

      expect(result.success).toBe(true);
      expect(result.ljWrId).toBeDefined();
      expect(result.message).toContain("Long Job");
      expect(result.message).toContain("10%");
      expect(result.message).toContain("RFQ");
    });
  });

  describe("resolveNextAcceptanceSubstatus", () => {
    it("should jump from 50% to 94% when no gates required", async () => {
      const gateConfig: AcceptanceGateConfig = {
        RequiresSAT: false,
        RequiresDrawingUpdate: false,
        RequiresInventoryUpdate: false,
        gateStatuses: {},
      };

      const result = await resolveNextAcceptanceSubstatus(50, gateConfig, context);

      expect(result.nextPercentage).toBe(94);
      expect(result.action).toContain("no gates");
      expect(result.gatesPending).toHaveLength(0);
    });

    it("should transition from 50% to 78% when gates required", async () => {
      const gateConfig: AcceptanceGateConfig = {
        RequiresSAT: true,
        RequiresDrawingUpdate: false,
        RequiresInventoryUpdate: false,
        gateStatuses: {
          SAT: { status: "Pending" },
        },
      };

      const result = await resolveNextAcceptanceSubstatus(50, gateConfig, context);

      expect(result.nextPercentage).toBe(78);
      expect(result.action).toContain("Work Ready");
      expect(result.gatesPending).toContain("SAT");
    });

    it("should transition from 78% to 79% for Pre-SAT approval", async () => {
      const gateConfig: AcceptanceGateConfig = {
        RequiresSAT: true,
        RequiresDrawingUpdate: false,
        RequiresInventoryUpdate: false,
        gateStatuses: {
          SAT: { status: "Pending" },
        },
      };

      const result = await resolveNextAcceptanceSubstatus(78, gateConfig, context);

      expect(result.nextPercentage).toBe(79);
      expect(result.action).toContain("Pre-SAT");
    });

    it("should jump from 79% to 94% when all gates approved", async () => {
      const gateConfig: AcceptanceGateConfig = {
        RequiresSAT: true,
        RequiresDrawingUpdate: false,
        RequiresInventoryUpdate: false,
        gateStatuses: {
          SAT: { status: "Approved" },
        },
      };

      const result = await resolveNextAcceptanceSubstatus(79, gateConfig, context);

      expect(result.nextPercentage).toBe(94);
      expect(result.action).toContain("All Acceptances");
      expect(result.gatesApproved).toContain("SAT");
    });
  });

  describe("canRoleExecuteLJAction", () => {
    it("should allow ESA_TO to save at 0%", () => {
      const canExecute = canRoleExecuteLJAction("ESA_TO", 0, "Save");
      expect(canExecute).toBe(true);
    });

    it("should allow ESA_TO to accept at 25%", () => {
      const canExecute = canRoleExecuteLJAction("ESA_TO", 25, "Accept");
      expect(canExecute).toBe(true);
    });

    it("should allow ESA_TO to approve SAT at 79%", () => {
      const canExecute = canRoleExecuteLJAction("ESA_TO", 79, "Approve SAT");
      expect(canExecute).toBe(true);
    });

    it("should deny ESA_TO from committing at 32%", () => {
      const canExecute = canRoleExecuteLJAction("ESA_TO", 32, "Commit");
      expect(canExecute).toBe(false);
    });

    it("should allow TRADE_TM to commit at 32%", () => {
      const canExecute = canRoleExecuteLJAction("TRADE_TM", 32, "Commit");
      expect(canExecute).toBe(true);
    });

    it("should allow TRADE_CM to sign yellow page at 95%", () => {
      const canExecute = canRoleExecuteLJAction("TRADE_CM", 95, "Sign Yellow Page");
      expect(canExecute).toBe(true);
    });

    it("should deny invalid role", () => {
      const canExecute = canRoleExecuteLJAction("InvalidRole" as any, 50, "Save");
      expect(canExecute).toBe(false);
    });

    it("should deny action not available at percentage", () => {
      const canExecute = canRoleExecuteLJAction("ESA_TO", 95, "Accept");
      expect(canExecute).toBe(false);
    });
  });
});

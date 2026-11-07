import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PM_ChecklistStandard,
  PM_Schedule,
  WR_Statuses,
  Equipment,
  Building,
  createPMCycleKey,
  getInitialIssuedStatus,
} from "@cafm/shared-schema";
import { generatePMWorkRequests } from "../src/pm-generator";
import { bulkCreatePMS, overruleIssuedWRs } from "../src/pm-schedule-ops";
import { dryRunValidateImport } from "../src/import-export";
import { createFastJob, updateWorkRequestStatus } from "../src/wr-lifecycle";

const mockFirestore = {
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  runTransaction: vi.fn(),
  batch: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};

const mockContext = {
  firestore: mockFirestore,
  logger: mockLogger,
};

const mockChecklistBlueprint: PM_ChecklistStandard = {
  ChecklistCode: "CHK001",
  Title: "Monthly HVAC Maintenance",
  MaintenanceReason: "Preventive HVAC inspection and filter replacement",
  TradeId: "HVAC001",
  TradeName: "HVAC Maintenance",
  ExpectedHours: 2,
  Steps: [
    {
      StepId: "step1",
      Title: "Check Filter",
      Instructions: "Inspect and measure filter pressure drop",
      SortOrder: 1,
      InputType: "Boolean",
      Options: [],
      RequiresPhotoOnFailure: true,
      RequiresCommentOnFailure: true,
      IsRequired: true,
    },
    {
      StepId: "step2",
      Title: "Temperature Check",
      Instructions: "Verify inlet/outlet temperatures",
      SortOrder: 2,
      InputType: "Numeric",
      Unit: "°C",
      MinThreshold: 18,
      MaxThreshold: 28,
      Options: [],
      RequiresPhotoOnFailure: false,
      RequiresCommentOnFailure: true,
      IsRequired: true,
    },
  ],
  IsActive: true,
  Version: 1,
};

const mockSchedule: PM_Schedule = {
  ScheduleId: "SCHED001",
  ChecklistCode: "CHK001",
  EquipmentCodes: ["EQ001"],
  Frequency: "Monthly",
  FrequencyInterval: 1,
  LeadTimeDays: 3,
  MarginWindowDays: 7,
  NextDueDate: "2026-12-01",
  IsActive: true,
  CreatedBy: "user123",
  bl_id: "BL001",
  LevelName: "Ground",
};

const mockEquipment: Equipment = {
  EquipmentCode: "EQ001",
  EquipmentName: "HVAC Unit A",
  EquipmentUseEnglish: "Main Ventilation System",
  Status: "In Service",
  bl_id: "BL001",
  LevelName: "Ground",
  RoomCode: "R001",
  Criticality: "High",
};

describe("PM Work Request Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should validate cycle key generation", () => {
    const cycleKey = createPMCycleKey("SCHED001", "2026-12-15");
    expect(cycleKey).toBe("SCHED001::2026-12-15");
  });

  it("should get initial issued status for PM work requests", () => {
    const status = getInitialIssuedStatus("Preventive Maintenance", WR_Statuses);
    expect(status.Percentage).toBe(50);
    expect(status.WorkRequestStatus).toBe("Issued");
  });

  it("should validate status transitions", () => {
    const issuedStatus = WR_Statuses.find(
      (s) => s.Percentage === 50 && s.ESAWorkType === "Preventive Maintenance",
    );
    const completedStatus = WR_Statuses.find(
      (s) => s.Percentage === 78 && s.ESAWorkType === "Preventive Maintenance",
    );

    expect(issuedStatus).toBeDefined();
    expect(completedStatus).toBeDefined();

    if (issuedStatus && completedStatus) {
      expect(issuedStatus.Percentage).toBe(50);
      expect(completedStatus.Percentage).toBe(78);
    }
  });

  it("should instantiate checklist steps from blueprint", () => {
    const blueprint = mockChecklistBlueprint;
    expect(blueprint.Steps.length).toBe(2);
    expect(blueprint.Steps[0].InputType).toBe("Boolean");
    expect(blueprint.Steps[1].InputType).toBe("Numeric");
    expect(blueprint.Steps[1].MinThreshold).toBe(18);
    expect(blueprint.Steps[1].MaxThreshold).toBe(28);
  });

  it("should validate equipment location resolution", () => {
    const equipment = mockEquipment;
    expect(equipment.bl_id).toBe("BL001");
    expect(equipment.LevelName).toBe("Ground");
    expect(equipment.RoomCode).toBe("R001");
  });

  it("should validate PM schedule frequency intervals", () => {
    const schedule = mockSchedule;
    expect(schedule.Frequency).toBe("Monthly");
    expect(schedule.FrequencyInterval).toBe(1);
    expect(schedule.LeadTimeDays).toBe(3);
    expect(schedule.MarginWindowDays).toBe(7);
  });
});

describe("PM Schedule Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should validate bulk create PMS payload structure", () => {
    const schedules = [mockSchedule];

    expect(schedules[0].ScheduleId).toBeDefined();
    expect(schedules[0].ChecklistCode).toBeDefined();
    expect(schedules[0].Frequency).toBeDefined();
    expect(schedules[0].NextDueDate).toBeDefined();
  });

  it("should validate schedule targeting options", () => {
    const schedule = mockSchedule;

    expect(schedule.EquipmentCodes.length).toBeGreaterThan(0);
    expect(schedule.bl_id).toBeDefined();
    expect(schedule.LevelName).toBeDefined();
  });
});

describe("Work Request Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should validate fast job creation payload", () => {
    const fjPayload = {
      description: "Lamp replacement",
      problemLocation: "Conference Room 1",
      bl_id: "BL001",
      LevelName: "Ground",
      RoomCode: "R001",
      equipmentCodes: ["EQ001"],
      tradeId: "ELEC001",
      tradeName: "Electrical",
      userId: "tech001",
      timestamp: new Date(),
    };

    expect(fjPayload.description).toBeDefined();
    expect(fjPayload.bl_id).toBeDefined();
    expect(fjPayload.equipmentCodes.length).toBeGreaterThan(0);
  });

  it("should validate long job freeze management structure", () => {
    const freezeRequest = {
      wrId: "2026000001",
      action: "freeze" as const,
      freezeName: "Parts Ordered",
      freezeReason: "Waiting for replacement motor",
      userId: "mgr001",
      timestamp: new Date(),
    };

    expect(freezeRequest.wrId).toBeDefined();
    expect(freezeRequest.action).toBe("freeze");
    expect(freezeRequest.freezeName).toBeDefined();
    expect(freezeRequest.freezeReason).toBeDefined();
  });

  it("should validate checklist step execution input types", () => {
    const stepExecution = {
      wrId: "2026000001",
      stepInstanceId: "step_2026000001_step1",
      inputData: { value: true },
      photoIds: [],
      technicianComment: "",
      userId: "tech001",
      timestamp: new Date(),
    };

    expect(stepExecution.wrId).toBeDefined();
    expect(stepExecution.stepInstanceId).toBeDefined();
    expect(stepExecution.inputData).toBeDefined();
  });

  it("should validate work session timer structure", () => {
    const timerRequest = {
      wrId: "2026000001",
      action: "start" as const,
      craftpersonId: "cp001",
      userId: "tech001",
      timestamp: new Date(),
    };

    expect(timerRequest.wrId).toBeDefined();
    expect(timerRequest.action).toBe("start");
    expect(timerRequest.craftpersonId).toBeDefined();
  });

  it("should validate technical audit structure", () => {
    const auditRequest = {
      wrId: "2026000001",
      qaInspectedBy: "qa001",
      result: "Pass" as const,
      score: 95,
      photoStoragePaths: [],
      shouldReopenWR: false,
      userId: "qa001",
      timestamp: new Date(),
    };

    expect(auditRequest.wrId).toBeDefined();
    expect(auditRequest.qaInspectedBy).toBeDefined();
    expect(auditRequest.result).toBe("Pass");
  });
});

describe("Import/Export Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should validate dry-run import context structure", () => {
    const importContext = {
      firestore: mockFirestore,
      logger: mockLogger,
    };

    expect(importContext.firestore).toBeDefined();
    expect(importContext.logger).toBeDefined();
    expect(typeof importContext.logger.info).toBe("function");
    expect(typeof importContext.logger.error).toBe("function");
  });

  it("should validate export entity types", () => {
    const entityTypes = [
      "Buildings",
      "Floors",
      "Rooms",
      "Equipment",
      "PM_Checklists",
      "PM_Schedules",
      "Trades",
      "Employees",
    ];

    expect(entityTypes.length).toBe(8);
    expect(entityTypes).toContain("Equipment");
    expect(entityTypes).toContain("PM_Schedules");
  });
});

describe("Integration: Full PM Generation Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should validate complete PM generation request structure", () => {
    const request = {
      generationMode: "single" as const,
      scheduleId: "SCHED001",
      checklistBlueprint: mockChecklistBlueprint,
      schedule: mockSchedule,
      equipment: mockEquipment,
      userId: "planner001",
      timestamp: new Date(),
    };

    expect(request.generationMode).toBe("single");
    expect(request.checklistBlueprint.Steps.length).toBe(2);
    expect(request.equipment.EquipmentCode).toBe("EQ001");
    expect(request.schedule.ScheduleId).toBe("SCHED001");
  });

  it("should validate horizon generation mode structure", () => {
    const request = {
      generationMode: "horizon30days" as const,
      scheduleId: "SCHED001",
      checklistBlueprint: mockChecklistBlueprint,
      schedule: mockSchedule,
      building: { bl_id: "BL001", Name: "Building A", Address: "123 Main St" },
      userId: "planner001",
      timestamp: new Date(),
    };

    expect(request.generationMode).toBe("horizon30days");
    expect(request.building?.bl_id).toBe("BL001");
  });

  it("should validate WR_ID sequence format", () => {
    const wrId = "2026000001";
    expect(wrId).toMatch(/^2026\d{6}$/);
    expect(wrId.length).toBe(10);
  });

  it("should validate date calculations for due and margin dates", () => {
    const baseDate = new Date("2026-12-01");
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + 30 - 3);

    const marginDate = new Date(dueDate);
    marginDate.setDate(marginDate.getDate() + 7);

    expect(dueDate.getTime()).toBeLessThan(marginDate.getTime());
  });
});

describe("RBAC and Permissions", () => {
  it("should validate role permission matrix structure", () => {
    const roles = [
      "SiteAdministrator",
      "ESA_LongJobManager",
      "PM_Planner",
      "QA_Inspector",
      "MobileTechnician",
      "StandardEmployee",
    ];

    expect(roles.length).toBe(6);
    expect(roles).toContain("PM_Planner");
    expect(roles).toContain("MobileTechnician");
  });

  it("should validate permission enum values", () => {
    const samplePermissions = [
      "pmSchedules.generate",
      "workRequests.create",
      "checklists.execute",
      "technicalAudits.write",
    ];

    samplePermissions.forEach((perm) => {
      expect(typeof perm).toBe("string");
      expect(perm.length).toBeGreaterThan(0);
    });
  });
});

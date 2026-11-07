import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseWorkRequest, Building, Floor, Room, Equipment } from "@cafm/shared-schema";
import { clearAllData, getDB } from "./db";
import { OfflineEngine } from "./offline-engine";
import { ESOC_BUILDINGS, ESOC_FLOORS, ESOC_ROOMS, ESOC_EQUIPMENT, SAMPLE_WORK_REQUESTS } from "../../../web-portal/lib/seed-data";

const original: BaseWorkRequest = {
  WR_ID: "WR-1", WR_Type: "PM", ESAWorkType: "Preventive Maintenance",
  Description: "Inspect", SiteId: "SITE-01", bl_id: "BL-1", LevelName: "L1", RoomCode: "R1",
  EquipmentCodes: [], TotalTimeMinutes: 0, CreatedDate: "2026-01-01",
  WorkRequestStatus: "Issued", WorkRequestSubstatus: "Issued", Percentage: 50,
  CreatedBy: "planner", AssignedCraftpersonIds: [], AssignedUserIds: [],
  IsFrozen: false, StartDateTBD: false, RequiresSAT: false, RequiresDrawingUpdate: false,
  RequiresInventoryUpdate: false, AcceptanceGates: [],
};
const makeState = () => ({
  sites: ["SITE-01"], buildings: [] as Building[], floors: [] as Floor[], rooms: [] as Room[],
  desks: [], equipment: [] as Equipment[],
  blueprints: [], schedules: [], craftspeople: [], siteRoleAssignments: [],
  users: [], tradeRoleMappings: [], siteRoleMappings: [], workRequests: [structuredClone(original)],
  deletedWorkRequests: [] as BaseWorkRequest[],
  mobileMutationIds: [] as string[],
});

describe("portal synchronization", () => {
  let state: ReturnType<typeof makeState>;
  let revision: number;
  let postCount: number;
  let loseResponse: boolean;

  beforeEach(async () => {
    await clearAllData();
    vi.stubEnv("VITE_CAFM_SYNC_TOKEN", "local-test-token-with-at-least-32-characters");
    state = makeState();
    revision = 1;
    postCount = 0;
    loseResponse = false;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ "X-CAFM-Site-Id": "SITE-01", "X-CAFM-Person": "TECH-001" });
      if (init.method === "POST") {
        postCount++;
        const payload = JSON.parse(String(init.body)) as { revision: number; state: typeof state };
        if (payload.revision !== revision) return { ok: false, status: 409, json: async () => ({ error: "State changed" }) };
        state = payload.state;
        revision++;
        if (loseResponse) {
          loseResponse = false;
          throw new Error("Connection lost after commit");
        }
      }
      return { ok: true, status: 200, json: async () => structuredClone({ revision, state }) };
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("pushes requests, evidence and work sessions and pulls the persisted result", async () => {
    const db = await getDB();
    await db.put("workRequests", original);
    const engine = new OfflineEngine();
    await engine.saveWorkRequest({ ...original, Description: "Updated offline" });
    await engine.queueMutation("STEP_COMPLETE", {
      WR_ID: "WR-1", AuditId: "audit-1", StepId: "step-1", Action: "FAIL",
      Result: false, TechnicianId: "TECH-001", Timestamp: "2026-01-02T10:00:00Z",
      ImmutableChecksum: "checksum", TechnicianComment: "Needs repair",
    });

    await engine.queueMutation("SESSION_LOG", {
      WR_ID: "WR-1", SessionId: "session-1", TechnicianId: "TECH-001",
      StartedAt: "2026-01-02T10:00:00Z", StoppedAt: "2026-01-02T10:15:00Z",
      Status: "STOPPED", TotalTimeMinutes: 15,
    });
    await engine.queuePhotoUpload("WR-1", "data:image/webp;base64,abc", 2, 1, "step-1");

    expect(await engine.syncNow()).toMatchObject({ synced: 4, pending: 0 });
    const synced = await db.get("workRequests", "WR-1");
    expect(synced).toMatchObject({
      Description: "Updated offline", TotalTimeMinutes: 15,
      ChecklistResults: [{ stepId: "step-1", passed: false, comment: "Needs repair", photoPaths: ["data:image/webp;base64,abc"] }],
      MobileWorkSessions: [{ SessionId: "session-1", TotalTimeMinutes: 15 }],
      Attachments: [{ dataUrl: "data:image/webp;base64,abc" }],
    });
    expect(state.workRequests[0]).toEqual(synced);
    expect(await db.getAllFromIndex("syncQueue", "by-status", "PENDING")).toHaveLength(0);
    expect(await db.getAllFromIndex("photoQueue", "by-status", "PENDING")).toHaveLength(0);
  });

  it("preserves per-person assignment times when synchronizing mobile edits", async () => {
    const assigned = { ...original, AssignedCraftpersonIds: ["TECH-001"], CraftpersonAssignments: [{ craftpersonId: "TECH-001", assignedStartDateTime: "2026-11-09T08:00", assignedEndDateTime: "2026-11-09T11:30" }] };
    state.workRequests = [assigned];
    const db = await getDB();
    await db.put("workRequests", assigned);
    const engine = new OfflineEngine();
    await engine.saveWorkRequest({ ...assigned, Description: "Mobile update" });
    expect(await engine.syncNow()).toMatchObject({ pending: 0 });
    expect(state.workRequests[0].CraftpersonAssignments).toEqual(assigned.CraftpersonAssignments);
    expect((await db.get("workRequests", "WR-1"))?.CraftpersonAssignments).toEqual(assigned.CraftpersonAssignments);
  });

  it("preserves archived request histories when mobile pushes another request", async () => {
    const archived = { ...original, WR_ID: "DELETED-1", Activity: [{
      id: "delete-1", kind: "log" as const, actorId: "admin", actorName: "Admin",
      actorRole: "SiteAdministrator", createdAt: "2026-01-03", text: "Work request deleted",
    }] };
    state.deletedWorkRequests = [archived];
    const db = await getDB();
    await db.put("workRequests", original);
    const engine = new OfflineEngine();
    await engine.saveWorkRequest({ ...original, Description: "Mobile update" });
    await engine.syncNow();
    expect(state.deletedWorkRequests).toEqual([archived]);
  });

  it("preserves portal absence records when a mobile edit is synchronized", async () => {
    const absence = { id: "leave-1", siteId: "SITE-01", craftpersonId: "craft-1", absenceType: "Vacation", startDate: "2026-11-06", endDate: "2026-11-07", isFullDay: true, unavailableHoursPerDay: 8, status: "Approved", notes: "" };
    Object.assign(state, { craftpersonAbsences: [absence] });
    const db = await getDB();
    await db.put("workRequests", original);
    const engine = new OfflineEngine();
    await engine.saveWorkRequest({ ...original, Description: "Mobile update" });
    await engine.syncNow();
    expect(state).toMatchObject({ craftpersonAbsences: [absence] });
  });

  it("preserves location freezes while synchronizing mobile mutations", async () => {
    const freeze = { id: "freeze-1", siteId: "SITE-01", buildingId: "BL-1", title: "Access restriction", description: "Testing", responsiblePerson: "Mark", startDateTime: "2026-11-06T08:00", endDateTime: "2026-11-07T18:00", allowPM: false, allowFJ: true, allowLJ: false };
    Object.assign(state, { locationFreezes: [freeze] });
    const db = await getDB();
    await db.put("workRequests", original);
    const engine = new OfflineEngine();
    await engine.saveWorkRequest({ ...original, Description: "Mobile update" });
    await engine.syncNow();
    expect(state).toMatchObject({ locationFreezes: [freeze] });
  });

  it("normalizes legacy equipment statuses when pulling portal state", async () => {
    const equipment = { ...ESOC_EQUIPMENT[0], Status: "Under Repair" };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ revision, state: { ...state, equipment: [equipment] } }) })));
    await new OfflineEngine().syncNow();
    expect(await (await getDB()).get("equipment", equipment.EquipmentCode)).toMatchObject({ Status: "Repair" });
  });

  it("retains queued changes when the portal edited the same request", async () => {
    const db = await getDB();
    await db.put("workRequests", original);
    const engine = new OfflineEngine();
    await engine.saveWorkRequest({ ...original, Description: "Mobile" });
    state.workRequests[0].Description = "Portal";

    await expect(engine.syncNow()).rejects.toThrow("changed on the portal");
    expect(postCount).toBe(0);
    expect(await db.getAllFromIndex("syncQueue", "by-status", "PENDING")).toHaveLength(1);
    expect((await db.get("workRequests", "WR-1"))?.Description).toBe("Mobile");
  });

  it("retains a step mutation if the portal changed that step", async () => {
    const db = await getDB();
    await db.put("workRequests", original);
    const engine = new OfflineEngine();
    await engine.queueMutation("STEP_COMPLETE", {
      WR_ID: "WR-1", AuditId: "audit-1", StepId: "step-1", Action: "FAIL",
      TechnicianId: "TECH-001", Timestamp: "2026-01-02T10:00:00Z", ImmutableChecksum: "checksum",
    });
    state.workRequests[0].ChecklistResults = [{
      stepId: "step-1", passed: true, value: "pass", completedAt: "2026-01-02T09:00:00Z",
    }];
    await expect(engine.syncNow()).rejects.toThrow("Checklist step step-1 changed");
    expect(await db.getAllFromIndex("syncQueue", "by-status", "PENDING")).toHaveLength(1);
    expect(postCount).toBe(0);
  });

  it("does not save a stale work request editor over a newer local copy", async () => {
    const db = await getDB();
    await db.put("workRequests", { ...original, Description: "Newer copy" });
    const engine = new OfflineEngine();
    await expect(engine.saveWorkRequest({ ...original, Description: "Stale edit" }, original))
      .rejects.toThrow("changed while it was being edited");
    expect((await db.get("workRequests", "WR-1"))?.Description).toBe("Newer copy");
    expect(await db.getAllFromIndex("syncQueue", "by-status", "PENDING")).toHaveLength(0);
  });

  it("does not apply an already committed mutation twice after a lost response", async () => {
    const db = await getDB();
    await db.put("workRequests", original);
    const engine = new OfflineEngine();
    await engine.queueMutation("SESSION_LOG", {
      WR_ID: "WR-1", SessionId: "session-1", StartedAt: "2026-01-02T10:00:00Z",
      StoppedAt: "2026-01-02T10:15:00Z", Status: "STOPPED", TotalTimeMinutes: 15,
    });

    loseResponse = true;
    await expect(engine.syncNow()).rejects.toThrow("Connection lost");
    expect(await db.getAllFromIndex("syncQueue", "by-status", "PENDING")).toHaveLength(1);

    await engine.syncNow();
    expect(postCount).toBe(1);
    expect(state.workRequests[0].TotalTimeMinutes).toBe(15);
    expect(await db.getAllFromIndex("syncQueue", "by-status", "PENDING")).toHaveLength(0);
  });

  it("pulls real portal seed records", async () => {
    state.buildings = ESOC_BUILDINGS;
    state.floors = ESOC_FLOORS;
    state.rooms = ESOC_ROOMS;
    state.equipment = ESOC_EQUIPMENT;
    state.workRequests = SAMPLE_WORK_REQUESTS.filter((item) => item.SiteId === "SITE-01");
    const engine = new OfflineEngine();
    await engine.syncNow();
    const db = await getDB();
    expect(await db.getAll("buildings")).toHaveLength(ESOC_BUILDINGS.length);
    expect(await db.getAll("workRequests")).toHaveLength(state.workRequests.length);
  });

  it("does not upload another site's pending work", async () => {
    const db = await getDB();
    const engine = new OfflineEngine();
    await engine.saveWorkRequest({ ...original, WR_ID: "SITE-02-WR", SiteId: "SITE-02" });
    expect(await engine.syncNow()).toMatchObject({ synced: 0, pending: 1 });
    expect(postCount).toBe(0);
    expect(await db.get("workRequests", "SITE-02-WR")).toMatchObject({ SiteId: "SITE-02" });
  });

  it("uses the localhost development token without configuration", async () => {
    vi.stubEnv("VITE_CAFM_SYNC_TOKEN", "");
    vi.stubEnv("DEV", true);
    await new OfflineEngine().syncNow();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/cafm-state",
      expect.objectContaining({ headers: expect.objectContaining({
        Authorization: "Bearer cafm-local-development-sync-token-2026",
      }) }),
    );
  });
});

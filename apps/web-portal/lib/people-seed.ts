import type { BaseWorkRequest, Room, SiteId, UserAccess } from "@cafm/shared-schema";
import { CLASSICAL_TRADES, WR_Statuses } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { ensureDirectoryProfiles } from "./access-profiles";
import { LEGACY_PERSON_NAMES, PEOPLE_DIRECTORY, usernameForRole } from "./people-directory";
import { buildFastJobWR } from "./fj-factory";
import { getSiteSlaConfig, resolveDissatisfactionRecipients } from "./fj-satisfaction";
import { toLocalIso } from "./fj-sla";

const SYNTHETIC_USER = /-(ESA|TRADE)_[A-Z_]+$/;
const ROOM_H001 = "H001";
const ESOC: SiteId = "02-ESOC";

function directoryUsers(): UserAccess[] {
  return PEOPLE_DIRECTORY.map((entry) => ({
    UserId: entry.username, DisplayName: entry.personName, SystemRole: entry.systemRole, AssignedSiteIds: [...entry.sites],
    LJRoles: [...entry.ljRoles], Trades: [...CLASSICAL_TRADES], CanAccessAll: !!entry.superAdmin,
  }));
}

function withRealUsers(data: DemoData): DemoData {
  const kept = data.users.filter((user) => !SYNTHETIC_USER.test(user.UserId) && !/\((SITE-\d+|\d{2}-[A-Z]+)\)$/.test(user.DisplayName));
  const have = new Set(kept.map((user) => user.UserId));
  const users = [...kept, ...directoryUsers().filter((user) => !have.has(user.UserId))];
  const rewrite = (assignments: Record<string, string>) => Object.fromEntries(Object.entries(assignments).map(([role, value]) =>
    [role, SYNTHETIC_USER.test(value) ? usernameForRole(role) || value : value]));
  return {
    ...data,
    users,
    userAccessProfiles: ensureDirectoryProfiles(data.userAccessProfiles, data.sites),
    tradeRoleMappings: data.tradeRoleMappings.map((item) => ({ ...item, assignments: rewrite(item.assignments) })),
    siteRoleMappings: data.siteRoleMappings.map((item) => ({ ...item, assignments: rewrite(item.assignments) })),
    siteRoleAssignments: data.siteRoleAssignments.map((item) => LEGACY_PERSON_NAMES[item.PersonName] ? { ...item, PersonName: LEGACY_PERSON_NAMES[item.PersonName] } : item),
  };
}

function withRoomH001(data: DemoData): DemoData {
  const additions: Room[] = [];
  for (const site of data.sites) {
    if (data.rooms.some((room) => room.SiteId === site && room.RoomCode === ROOM_H001)) continue;
    const building = data.buildings.find((item) => item.SiteId === site && item.bl_id.endsWith("BL-1")) ?? data.buildings.find((item) => item.SiteId === site);
    if (!building) continue;
    const floor = data.floors.find((item) => item.SiteId === site && item.bl_id === building.bl_id);
    if (!floor) continue;
    additions.push({
      SiteId: site, bl_id: building.bl_id, LevelName: floor.LevelName, RoomCode: ROOM_H001, Name: "Helpdesk Meeting Room", NetAreaM2: 24,
      Polygon: { type: "Polygon", coordinates: [[[40, 0], [44, 0], [44, 6], [40, 6], [40, 0]]] }, PolygonSource: "Demo", IsDeskReservable: false, IsActive: true,
    });
  }
  return additions.length ? { ...data, rooms: [...data.rooms, ...additions] } : data;
}

function withShowcaseFastJobs(data: DemoData): DemoData {
  if (!data.sites.includes(ESOC)) return data;
  const room = data.rooms.find((item) => item.SiteId === ESOC && item.RoomCode === ROOM_H001);
  if (!room) return data;
  const existing = new Set(data.workRequests.map((wr) => wr.WR_ID));
  const now = new Date();
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  const equipment = data.equipment.find((item) => item.SiteId === ESOC && item.Category && item.PrimaryTradeId === "Mechanical" && item.bl_id === room.bl_id);
  const actor = { userId: "elena.schmidt", displayName: "Elena Schmidt", role: "HELPDESK", personId: "elena.schmidt" };
  const additions: BaseWorkRequest[] = [];
  const base = { bl_id: room.bl_id, levelName: room.LevelName, roomCode: room.RoomCode, timeSpentMinutes: 0 };
  const rename = (wr: BaseWorkRequest, id: string): BaseWorkRequest => ({ ...wr, WR_ID: id, JobID: `JOB-${id}` });

  if (!existing.has("FJ-ESOC-H001-LIGHT")) {
    additions.push(rename(buildFastJobWR({
      ...base, equipmentCode: "", description: "Light bulb in room H001 doesn't work, please fix it", createdAt: hoursAgo(2),
      tradeName: "Electrical", urgencyCode: "NORMAL", intakeChannel: "Phone Call", requestorName: "Jan de Vries",
      requestorEmail: "jan.devries@esa.example", requestorPhone: "+31 71 565 2201", requestorDepartment: "Facility Management",
    }, { siteId: ESOC, data, actor, source: "Fast Job logged" }), "FJ-ESOC-H001-LIGHT"));
  }
  if (!existing.has("FJ-ESOC-HVAC-SUPER")) {
    additions.push(rename(buildFastJobWR({
      ...base, equipmentCode: equipment?.EquipmentCode ?? "", description: "Chilled water leak at technical plant - immediate attention required", createdAt: hoursAgo(1),
      tradeName: "Mechanical", urgencyCode: "SUPER_URGENT", intakeChannel: "Phone Call", requestorName: "Mark Meyer",
      requestorEmail: "mark.meyer@esa.example", requestorPhone: "+49 6151 90 2101", requestorDepartment: "Facility Management",
    }, { siteId: ESOC, data, actor, source: "Fast Job logged" }), "FJ-ESOC-HVAC-SUPER"));
  }
  if (!existing.has("FJ-ESOC-DOOR-DONE")) {
    const done = WR_Statuses.find((entry) => entry.Percentage === 78 && entry.ESAWorkType === "Corrective Maintenance");
    const config = getSiteSlaConfig(data, ESOC);
    const recipients = resolveDissatisfactionRecipients(config, "Electrical");
    const created = hoursAgo(72);
    const wr = rename(buildFastJobWR({
      ...base, equipmentCode: "", description: "Flickering corridor lights replaced", createdAt: created, tradeName: "Electrical", urgencyCode: "PRIORITY",
      intakeChannel: "Email", requestorName: "Jan de Vries", requestorEmail: "jan.devries@esa.example", requestorPhone: "+31 71 565 2201", requestorDepartment: "Facility Management",
    }, { siteId: ESOC, data, actor, source: "Fast Job logged" }), "FJ-ESOC-DOOR-DONE");
    additions.push({
      ...wr,
      ...(done ? { WorkRequestStatus: done.WorkRequestStatus, WorkRequestSubstatus: done.WorkRequestSubstatus, Percentage: done.Percentage } : {}),
      UpdatedAt: hoursAgo(24),
      Satisfaction: {
        token: "fj-esoc-door-done-seed", status: "Answered", sentAt: hoursAgo(24), sentToEmail: "jan.devries@esa.example",
        satisfactionStatus: "Dissatisfied", ratingStars: 2, feedbackText: "The lights flicker again after a few hours - the repair did not solve the problem.",
        feedbackAt: hoursAgo(20), followUpStatus: "Contacted", notifiedRecipients: recipients,
        followUpNotes: [{ id: "seed-note-1", at: toLocalIso(new Date(now.getTime() - 18 * 3_600_000)), by: "Lukas Weber", method: "Phone Call", status: "Contacted",
          text: "Called requestor, will re-inspect the ballast tomorrow morning." }],
      },
    });
  }
  if (!additions.length) return data;
  const notified = additions.flatMap((wr) => (wr.Satisfaction?.notifiedRecipients ?? []).map((recipient) => ({
    id: `fjn-${wr.WR_ID}-${recipient}`, wrId: wr.WR_ID, recipient, createdAt: wr.Satisfaction?.feedbackAt ?? wr.UpdatedAt ?? new Date().toISOString(), kind: "FJ_DISSATISFACTION" as const,
    message: `Requestor ${wr.RequestorName ?? "unknown"} rated ${wr.WR_ID} ${wr.Satisfaction?.ratingStars}/5 - Service Not OK.`, read: false,
  })));
  return { ...data, workRequests: [...data.workRequests, ...additions], fjNotifications: [...(data.fjNotifications ?? []), ...notified] };
}

// Idempotent: runs on every scope pass so existing saved states receive the real people directory, room H001 and the showcase FJs.
export function withPeopleDirectory(data: DemoData): DemoData {
  return withShowcaseFastJobs(withRoomH001(withRealUsers(data)));
}

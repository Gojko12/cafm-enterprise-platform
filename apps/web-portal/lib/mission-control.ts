import type { LocationFreeze, MissionEvent, MissionFacilityConstraint } from "@cafm/shared-schema";

export const MISSION_CONSTRAINTS: Record<MissionFacilityConstraint, {
  missionLabel: string;
  missionDescription: string;
  facilityLabel: string;
  allowPM: boolean;
  allowFJ: boolean;
  allowLJ: boolean;
}> = {
  TOTAL_LOCKDOWN: {
    missionLabel: "Total lockdown",
    missionDescription: "No facility interventions of any kind inside the protected zones.",
    facilityLabel: "All facility work frozen (PM, FJ, LJ).",
    allowPM: false, allowFJ: false, allowLJ: false,
  },
  PLANNED_ONLY: {
    missionLabel: "Planned work only",
    missionDescription: "Quiet planned maintenance is permitted; no interruptive work during the window.",
    facilityLabel: "PM allowed; FJ and LJ frozen.",
    allowPM: true, allowFJ: false, allowLJ: false,
  },
  COORDINATE_FIRST: {
    missionLabel: "Coordinate first",
    missionDescription: "Facility work is possible once timing is agreed with the duty Flight Operations Manager.",
    facilityLabel: "All work allowed; the freeze stays visible to facility teams for awareness.",
    allowPM: true, allowFJ: true, allowLJ: true,
  },
};

export const MISSION_CRITICALITY_STYLES: Record<MissionEvent["criticality"], string> = {
  Critical: "bg-red-100 text-red-900",
  High: "bg-amber-100 text-amber-900",
  Standard: "bg-slate-100 text-slate-700",
};

export function missionZones(event: Pick<MissionEvent, "buildingIds" | "floorIds" | "roomIds">) {
  return {
    buildings: event.buildingIds,
    floors: event.floorIds ?? [],
    rooms: event.roomIds ?? [],
  };
}

export function missionZonesLabel(event: Pick<MissionEvent, "buildingIds" | "floorIds" | "roomIds">) {
  const { buildings, floors, rooms } = missionZones(event);
  return [buildings.join(", "), floors.join(", "), rooms.join(", ")].filter(Boolean).join(" / ") || "None";
}

export function missionEventLabel(event: Pick<MissionEvent, "missionName" | "missionRef">) {
  return `${event.missionName} (${event.missionRef})`;
}

export function missionFreezeTitle(event: Pick<MissionEvent, "missionName" | "eventType">) {
  return `MISSION EVENT: ${event.missionName} ${event.eventType}`;
}

export function missionFreezeDescription(event: MissionEvent) {
  const constraint = MISSION_CONSTRAINTS[event.facilityConstraint];
  const base = `${event.eventType} window for mission ${event.missionName} (${event.missionRef}). Facility impact: ${constraint.missionLabel}. Published automatically by Mission Control.`;
  return event.remarks ? `${base} ${event.remarks}` : base;
}

export function missionEventToFreeze(event: MissionEvent, freezeId: string): LocationFreeze {
  const constraint = MISSION_CONSTRAINTS[event.facilityConstraint];
  const zones = missionZones(event);
  return {
    id: freezeId,
    siteId: event.siteId,
    buildingId: zones.buildings[0],
    ...(zones.buildings.length > 1 ? { buildingIds: zones.buildings } : {}),
    ...(zones.floors.length ? { floorIds: zones.floors } : {}),
    ...(zones.rooms.length ? { roomIds: zones.rooms } : {}),
    title: missionFreezeTitle(event),
    description: missionFreezeDescription(event),
    responsiblePerson: event.missionLead,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    allowPM: constraint.allowPM,
    allowFJ: constraint.allowFJ,
    allowLJ: constraint.allowLJ,
  };
}

export type MissionPublicationStatus = "published" | "draft" | "freeze-removed";

export function missionPublicationStatus(event: MissionEvent, freezes: LocationFreeze[]): MissionPublicationStatus {
  if (!event.freezeId) return "draft";
  return freezes.some((freeze) => freeze.id === event.freezeId) ? "published" : "freeze-removed";
}

export function missionPublicationStatusLabel(status: MissionPublicationStatus) {
  if (status === "published") return "Published to CAFM";
  if (status === "freeze-removed") return "Facility freeze removed";
  return "Draft";
}

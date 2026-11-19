import { MissionEventSchema, type MissionEvent } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { addDays, calendarDate } from "./dispatch";
import { missionEventToFreeze } from "./mission-control";

/**
 * Mission Control showcase: idempotent demo mission events per site, mirroring the
 * pattern of withSnowdonShowcase / withSBuildingShowcase. Runs on every scope pass
 * and never overwrites existing records. Published events carry a linked
 * LocationFreeze so the facility disputes/freeze banners demonstrate end to end.
 */
export function withMissionShowcase(data: DemoData): DemoData {
  const today = calendarDate(new Date());
  const events = [...(data.missionEvents ?? [])];
  const freezes = [...(data.locationFreezes ?? [])];

  for (const site of data.sites) {
    const buildings = data.buildings.filter((entry) => entry.SiteId === site);
    if (!buildings.length) continue;
    const primary = buildings[0];
    const secondary = buildings[1] ?? buildings[0];
    const rooms = data.rooms.filter((entry) => entry.SiteId === site && entry.bl_id === primary.bl_id);
    const pickedRooms = rooms.slice(0, 2);
    const pickedFloors = [...new Set(pickedRooms.map((entry) => entry.LevelName))];

    const drafts: Array<MissionEvent & { seedFreezeId?: string }> = [
      {
        id: `${site}-mission-1`, siteId: site,
        missionRef: "MCC-A114", missionName: "EAGLE-EYE 3", eventType: "LEOP", criticality: "Critical",
        startDateTime: `${addDays(today, -2)}T06:00`, endDateTime: `${addDays(today, 3)}T20:00`,
        buildingIds: pickedRooms.length ? [primary.bl_id] : [primary.bl_id, secondary.bl_id],
        ...(pickedFloors.length ? { floorIds: pickedFloors } : {}),
        ...(pickedRooms.length ? { roomIds: pickedRooms.map((entry) => entry.RoomCode) } : {}),
        facilityConstraint: "TOTAL_LOCKDOWN",
        missionLead: "Thomas (Flight Operations)",
        remarks: "Acquisition of signal and chain-of-command validation. No facility interventions in the control complex.",
        seedFreezeId: `${site}-mission-freeze-1`,
      },
      {
        id: `${site}-mission-2`, siteId: site,
        missionRef: "MCC-A207", missionName: "EUCLID Deep Field Uplink", eventType: "Critical Pass", criticality: "High",
        startDateTime: `${addDays(today, 7)}T00:00`, endDateTime: `${addDays(today, 9)}T22:00`,
        buildingIds: [secondary.bl_id],
        facilityConstraint: "PLANNED_ONLY",
        missionLead: "Yvonne (Flight Operations)",
        remarks: "Sustained uplink campaign; quiet planned maintenance is acceptable, no interruptive work.",
      },
      {
        id: `${site}-mission-3`, siteId: site,
        missionRef: "MCC-B031", missionName: "METOP-12", eventType: "Maneuver", criticality: "Standard",
        startDateTime: `${addDays(today, 30)}T06:00`, endDateTime: `${addDays(today, 31)}T06:00`,
        buildingIds: [primary.bl_id],
        facilityConstraint: "COORDINATE_FIRST",
        missionLead: "Mark (Mission Planning)",
        remarks: "Routine station-keeping maneuver; coordinate facility timing with the duty FOM.",
        seedFreezeId: `${site}-mission-freeze-3`,
      },
    ];

    for (const draft of drafts) {
      const { seedFreezeId, ...rest } = draft;
      if (events.some((entry) => entry.id === draft.id)) continue;
      const parsed = MissionEventSchema.safeParse(rest);
      if (!parsed.success) { console.warn(`Mission showcase skipped for ${draft.id}`, parsed.error.issues); continue; }
      if (seedFreezeId) {
        if (freezes.some((entry) => entry.id === seedFreezeId)) continue; // someone already created it; keep hands off
        freezes.push(missionEventToFreeze(parsed.data, seedFreezeId));
        events.push({ ...parsed.data, freezeId: seedFreezeId });
      } else {
        events.push(parsed.data);
      }
    }
  }

  return { ...data, missionEvents: events, locationFreezes: freezes };
}

import { z } from "zod";
import { SiteIdSchema } from "./locations.js";
import { LocalDateTimeSchema } from "./dispatch.js";

export const MissionEventTypeSchema = z.enum([
  "LEOP",
  "Launch Window",
  "Critical Pass",
  "Maneuver",
  "Collision Avoidance",
  "Commissioning",
  "Special Event",
]);
export type MissionEventType = z.infer<typeof MissionEventTypeSchema>;

export const MissionCriticalitySchema = z.enum(["Critical", "High", "Standard"]);
export type MissionCriticality = z.infer<typeof MissionCriticalitySchema>;

export const MissionFacilityConstraintSchema = z.enum(["TOTAL_LOCKDOWN", "PLANNED_ONLY", "COORDINATE_FIRST"]);
export type MissionFacilityConstraint = z.infer<typeof MissionFacilityConstraintSchema>;

export const MissionEventSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  missionRef: z.string().trim().min(1),
  missionName: z.string().trim().min(1),
  eventType: MissionEventTypeSchema,
  criticality: MissionCriticalitySchema,
  startDateTime: LocalDateTimeSchema,
  endDateTime: LocalDateTimeSchema,
  buildingIds: z.array(z.string().trim().min(1)).min(1),
  floorIds: z.array(z.string().trim().min(1)).optional(),
  roomIds: z.array(z.string().trim().min(1)).optional(),
  facilityConstraint: MissionFacilityConstraintSchema,
  missionLead: z.string().trim().min(1),
  remarks: z.string().trim().default(""),
  freezeId: z.string().min(1).optional(),
}).superRefine((entry, context) => {
  if (entry.endDateTime <= entry.startDateTime) context.addIssue({ code: "custom", path: ["endDateTime"], message: "The ops window must end after it starts." });
  if (entry.roomIds?.length && !entry.floorIds?.length) context.addIssue({ code: "custom", path: ["roomIds"], message: "Selected rooms require their parent floors." });
});
export type MissionEvent = z.output<typeof MissionEventSchema>;

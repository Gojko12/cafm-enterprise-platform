import { z } from "zod";
import { SiteIdSchema } from "./locations.js";
import { CLASSICAL_TRADES } from "./equipment.js";
import { LJRoleEnum } from "./work-requests.js";

export const SiteRoleAssignmentTradeSchema = z.enum([...CLASSICAL_TRADES, "All"]);
export const AssignmentLevelSchema = z.enum(["Main", "Deputy"]);

export const SiteRoleAssignmentSchema = z.object({
  AssignmentId: z.string().min(1),
  SiteId: SiteIdSchema,
  PersonName: z.string().min(1),
  RoleCode: LJRoleEnum,
  Trade: SiteRoleAssignmentTradeSchema,
  AssignmentLevel: AssignmentLevelSchema,
  ReceiveNotifications: z.boolean(),
});

export type SiteRoleAssignmentTrade = z.infer<typeof SiteRoleAssignmentTradeSchema>;
export type AssignmentLevel = z.infer<typeof AssignmentLevelSchema>;
export type SiteRoleAssignment = z.infer<typeof SiteRoleAssignmentSchema>;

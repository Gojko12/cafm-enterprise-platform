import { z } from "zod";

export const CifmPersonSchema = z.object({
  id: z.string().min(1),
  employeeCode: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().default(""),
  phone: z.string().default(""),
  departmentTeam: z.string().default(""),
  stationedSiteId: z.string().min(1),
  stationedBuildingId: z.string().default(""),
  stationedFloorId: z.string().default(""),
  stationedRoomId: z.string().default(""),
  isFmStaff: z.boolean(),
  systemRole: z.string().optional(),
  assignedSiteIds: z.array(z.string()).optional(),
  siteAdminSiteIds: z.array(z.string()).optional(),
  tradeAccess: z.array(z.string()).optional(),
  auditTrades: z.array(z.string()).optional(),
  ljRoles: z.array(z.string()).optional(),
  username: z.string().optional(),
});

export type CifmPerson = z.infer<typeof CifmPersonSchema>;

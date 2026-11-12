import { z } from "zod";

const DDMMYYYY = /^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-\d{4}$/;

export const OnboardingTrackSchema = z.enum(["FM_STAFF", "NON_FM_EMPLOYEE"]);
export type OnboardingTrack = z.infer<typeof OnboardingTrackSchema>;

export const OnboardingApprovalStatusSchema = z.enum(["Pending", "Approved", "Changes_Requested", "Rejected"]);

export const OnboardingApprovalSchema = z.object({
  status: OnboardingApprovalStatusSchema,
  actorName: z.string().optional(),
  actorId: z.string().optional(),
  decidedAt: z.string().optional(),
  comment: z.string().optional(),
});
export type OnboardingApproval = z.infer<typeof OnboardingApprovalSchema>;

export const OnboardingHrApprovalSchema = z.object({
  status: z.enum(["Pending_HR", "Completed_By_HR", "Rejected"]),
  actorName: z.string().optional(),
  actorId: z.string().optional(),
  decidedAt: z.string().optional(),
  comment: z.string().optional(),
});
export type OnboardingHrApproval = z.infer<typeof OnboardingHrApprovalSchema>;

export const OnboardingStatusSchema = z.enum(["Pending_Approvals", "Pending_HR", "Changes_Requested", "Rejected", "Completed_Onboarded"]);
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;

export const OnboardingRequestSchema = z.object({
  id: z.string().min(1),
  track: OnboardingTrackSchema,
  fullName: z.string().trim().min(1),
  email: z.string().default(""),
  phone: z.string().default(""),
  employeeCode: z.string().default(""),
  organization: z.enum(["ESA", "Contractor"]),
  departmentTeam: z.string().default(""),
  stationedSiteId: z.string().min(1),
  stationedBuildingId: z.string().default(""),
  stationedFloorId: z.string().default(""),
  stationedRoomId: z.string().default(""),
  startDate: z.string().regex(DDMMYYYY, "Use DD-MM-YYYY"),
  submittedBy: z.string().min(1),
  submittedAt: z.string().min(1),
  notes: z.string().default(""),
  status: OnboardingStatusSchema,
  fmSystemRole: z.string().optional(),
  primaryTrade: z.string().optional(),
  allowedTrades: z.array(z.string()).optional(),
  auditTrades: z.array(z.string()).optional(),
  assignedSiteIds: z.array(z.string()).optional(),
  weeklyHoursCapacity: z.number().min(0).max(80).optional(),
  assignedTeamLeaderId: z.string().optional(),
  teamLeaderApproval: OnboardingApprovalSchema.optional(),
  siteAdminApproval: OnboardingApprovalSchema.optional(),
  hrApproval: OnboardingHrApprovalSchema.optional(),
  completedAt: z.string().optional(),
  completedPersonId: z.string().optional(),
});
export type OnboardingRequest = z.infer<typeof OnboardingRequestSchema>;

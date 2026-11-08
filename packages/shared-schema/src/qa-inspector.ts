import { z } from "zod";
import { SiteIdSchema } from "./locations.js";
import { WR_Type } from "./work-requests.js";

export const QAInspectorAssignmentSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  personName: z.string().min(1),
  trades: z.array(z.string().min(1)),
  wrTypes: z.array(WR_Type),
});
export type QAInspectorAssignment = z.infer<typeof QAInspectorAssignmentSchema>;

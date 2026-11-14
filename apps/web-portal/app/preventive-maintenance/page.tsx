"use client";

import { WorkRequestsWorkspace } from "@/components/modules/work-requests/WorkRequestsWorkspace";

export default function PreventiveMaintenancePage() {
  return <WorkRequestsWorkspace fixedType="PM" />;
}

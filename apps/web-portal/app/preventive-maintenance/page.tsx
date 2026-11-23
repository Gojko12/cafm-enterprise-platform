"use client";

import React from "react";
import { WorkRequestsWorkspace } from "@/components/modules/work-requests/WorkRequestsWorkspace";

export default function PreventiveMaintenancePage() {
  return <React.Suspense fallback={null}><WorkRequestsWorkspace fixedType="PM" /></React.Suspense>;
}

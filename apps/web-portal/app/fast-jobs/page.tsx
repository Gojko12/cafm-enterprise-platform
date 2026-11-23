"use client";

import React from "react";
import { WorkRequestsWorkspace } from "@/components/modules/work-requests/WorkRequestsWorkspace";

export default function FastJobsPage() {
  return <React.Suspense fallback={null}><WorkRequestsWorkspace fixedType="FJ" /></React.Suspense>;
}

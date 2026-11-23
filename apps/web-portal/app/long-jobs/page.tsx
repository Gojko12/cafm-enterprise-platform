"use client";

import React from "react";
import { WorkRequestsWorkspace } from "@/components/modules/work-requests/WorkRequestsWorkspace";

export default function LongJobsPage() {
  return <React.Suspense fallback={null}><WorkRequestsWorkspace fixedType="LJ" /></React.Suspense>;
}

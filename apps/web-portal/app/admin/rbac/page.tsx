import React, { Suspense } from "react";
import { RBACDashboard } from "@/components/modules/long-jobs/RBACDashboard";

export default function RBACPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Users & Permissions</h1>
        <p className="text-gray-600 mt-1">
          Manage site users, role permissions, Long Job approval stages, and maintenance coordination teams.
        </p>
      </div>

      <Suspense fallback={null}>
        <RBACDashboard />
      </Suspense>
    </div>
  );
}

import React, { Suspense } from "react";
import { RBACDashboard } from "@/components/modules/long-jobs/RBACDashboard";

export default function RBACPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">People & Permissions</h1>
        <p className="text-gray-600 mt-1">
          One master CIFM directory of all employees (FM and non-FM), FM roles and site administrators, role capabilities, Long Job approval stages, and maintenance coordination teams.
        </p>
      </div>

      <Suspense fallback={null}>
        <RBACDashboard />
      </Suspense>
    </div>
  );
}

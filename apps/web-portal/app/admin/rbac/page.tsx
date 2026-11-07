import React from "react";
import { RBACDashboard } from "@/components/modules/long-jobs/RBACDashboard";

export default function RBACPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">RBAC & Governance Console</h1>
        <p className="text-gray-600 mt-1">
          Unified governance dashboard for user access, Long Job role actions, and system module permissions.
        </p>
      </div>

      <RBACDashboard />
    </div>
  );
}

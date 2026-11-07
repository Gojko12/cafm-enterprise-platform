import React from "react";
import { RBACDashboard } from "@/components/modules/long-jobs/RBACDashboard";
import { UserAccess } from "@cafm/shared-schema";

const mockUsers: UserAccess[] = [
  {
    UserId: "user-001",
    DisplayName: "John ESOC Manager",
    SystemRole: "ESA_TO",
    AssignedSiteIds: ["SITE-01"],
    LJRoles: ["ESA_TO"],
    Trades: ["Electrical", "Mechanical"],
    CanAccessAll: false,
  },
  {
    UserId: "user-002",
    DisplayName: "Marie ESTEC Manager",
    SystemRole: "ESA_TM",
    AssignedSiteIds: ["SITE-02"],
    LJRoles: ["ESA_TM"],
    Trades: ["HVAC", "Plumbing"],
    CanAccessAll: false,
  },
  {
    UserId: "user-admin",
    DisplayName: "Admin - All Sites",
    SystemRole: "SiteAdministrator",
    AssignedSiteIds: ["SITE-01", "SITE-02", "SITE-03"],
    LJRoles: ["ESA_LJM"],
    Trades: [],
    CanAccessAll: true,
  },
];

export default function RBACPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">RBAC & Governance Console</h1>
        <p className="text-gray-600 mt-1">
          Unified governance dashboard for user access, Long Job role actions, and system module permissions.
        </p>
      </div>

      <RBACDashboard initialUsers={mockUsers} />
    </div>
  );
}

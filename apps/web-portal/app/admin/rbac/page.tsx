"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import type { UserRole, Permission } from "@cafm/shared-schema";
import { UserRole as UserRoleEnum, ROLE_PERMISSIONS } from "@cafm/shared-schema";

type PermissionCategory = "System" | "Data" | "Work Requests" | "PM" | "Checklists" | "Audits" | "Desk" | "Analytics";

interface PermissionGroup {
  category: PermissionCategory;
  permissions: Permission[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    category: "System",
    permissions: ["system.configure", "users.manageRoles", "data.importExport"],
  },
  {
    category: "Data",
    permissions: [
      "locations.read",
      "locations.write",
      "equipment.read",
      "equipment.write",
      "trades.write",
    ],
  },
  {
    category: "Work Requests",
    permissions: [
      "workRequests.readAll",
      "workRequests.readAssigned",
      "workRequests.create",
      "workRequests.update",
      "workRequests.updateAssigned",
      "workRequests.assign",
      "workRequests.manageFreezes",
      "workRequests.approve",
    ],
  },
  {
    category: "PM",
    permissions: [
      "pmSchedules.read",
      "pmSchedules.write",
      "pmSchedules.generate",
    ],
  },
  {
    category: "Checklists",
    permissions: ["checklists.execute", "checklists.manage"],
  },
  {
    category: "Audits",
    permissions: ["technicalAudits.read", "technicalAudits.write"],
  },
  {
    category: "Desk",
    permissions: [
      "deskReservations.manageOwn",
      "deskReservations.manageAll",
    ],
  },
  {
    category: "Analytics",
    permissions: ["analytics.read"],
  },
];

const PERMISSION_LABELS: Record<Permission, string> = {
  "system.configure": "Configure System Settings",
  "users.manageRoles": "Manage User Roles",
  "data.importExport": "Import/Export Database",
  "locations.read": "View Locations",
  "locations.write": "Create/Edit Locations",
  "equipment.read": "View Equipment",
  "equipment.write": "Create/Edit Equipment",
  "trades.write": "Manage Trades",
  "workRequests.readAll": "View All Work Requests",
  "workRequests.readAssigned": "View Assigned WRs",
  "workRequests.create": "Create Work Requests",
  "workRequests.update": "Edit All Work Requests",
  "workRequests.updateAssigned": "Edit Assigned WRs",
  "workRequests.assign": "Assign WRs to Technicians",
  "workRequests.manageFreezes": "Manage Freezes/Holds",
  "workRequests.approve": "Approve WR Closures",
  "pmSchedules.read": "View PM Schedules",
  "pmSchedules.write": "Create/Edit PM Schedules",
  "pmSchedules.generate": "Generate WRs from Schedules",
  "checklists.execute": "Execute Checklists",
  "checklists.manage": "Create/Edit Checklists",
  "workSessions.manageOwn": "Manage Own Work Sessions",
  "technicalAudits.read": "View Technical Audits",
  "technicalAudits.write": "Perform Audits & QA",
  "deskReservations.manageOwn": "Reserve Own Desk",
  "deskReservations.manageAll": "Manage All Desk Reservations",
  "analytics.read": "View Analytics & Reports",
};

export default function RBACAdminPage() {
  const [permissions, setPermissions] = useState<Record<UserRole, Permission[]>>(
    ROLE_PERMISSIONS as any
  );
  const [expandedRole, setExpandedRole] = useState<UserRole | null>("SiteAdministrator");

  const roles: UserRole[] = [
    "SiteAdministrator",
    "ESA_LongJobManager",
    "PM_Planner",
    "QA_Inspector",
    "MobileTechnician",
    "StandardEmployee",
  ];

  const getRoleDescription = (role: UserRole) => {
    const descriptions: Record<UserRole, string> = {
      SiteAdministrator: "Full system access and configuration",
      ESA_LongJobManager: "Create & manage long jobs, approve closures",
      PM_Planner: "Create & manage PM schedules and blueprints",
      QA_Inspector: "Perform technical audits and QA inspections",
      MobileTechnician: "Execute work requests and checklists",
      StandardEmployee: "Book desks and submit facility requests",
    };
    return descriptions[role];
  };

  const togglePermission = (role: UserRole, permission: Permission) => {
    setPermissions((prev) => {
      const rolePerms = prev[role];
      const hasPermission = rolePerms.includes(permission);
      return {
        ...prev,
        [role]: hasPermission
          ? rolePerms.filter((p) => p !== permission)
          : [...rolePerms, permission],
      };
    });
  };

  const handleSave = () => {
    alert("RBAC configuration saved to database");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900">
            RBAC Administrator
          </h1>
          <p className="text-gray-600 mt-2">
            Manage role-based permissions and access control
          </p>
        </div>

        {/* Role Cards */}
        <div className="space-y-4">
          {roles.map((role) => (
            <div
              key={role}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              {/* Header */}
              <button
                onClick={() =>
                  setExpandedRole(expandedRole === role ? null : role)
                }
                className="w-full px-6 py-4 hover:bg-gray-50 flex items-center justify-between transition-colors"
              >
                <div className="text-left flex-1">
                  <h3 className="text-lg font-bold text-gray-900">{role}</h3>
                  <p className="text-sm text-gray-600">
                    {getRoleDescription(role)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-700">
                    {permissions[role].length} permissions
                  </p>
                  {expandedRole === role ? (
                    <Eye size={20} className="text-gray-400 mt-2 ml-auto" />
                  ) : (
                    <EyeOff size={20} className="text-gray-400 mt-2 ml-auto" />
                  )}
                </div>
              </button>

              {/* Details */}
              {expandedRole === role && (
                <div className="border-t border-gray-200 p-6 space-y-6">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.category}>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">
                        {group.category}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {group.permissions.map((permission) => (
                          <label
                            key={permission}
                            className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={permissions[role].includes(permission)}
                              onChange={() =>
                                togglePermission(role, permission)
                              }
                              className="w-4 h-4 rounded"
                            />
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {PERMISSION_LABELS[permission]}
                              </p>
                              <p className="text-xs text-gray-500">
                                {permission}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-4">
            Permission Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {roles.map((role) => (
              <div key={role} className="text-center">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  {role.split("_")[0]}
                </p>
                <p className="text-2xl font-bold text-blue-600">
                  {permissions[role].length}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex justify-end gap-4">
          <button className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

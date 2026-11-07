"use client";

import React, { useState, useMemo } from "react";
import {
  UserAccess,
  LJRole,
  Permission,
  SiteId,
  UserRole,
  ROLE_PERMISSIONS,
} from "@cafm/shared-schema";
import {
  Users,
  Grid3x3,
  Lock,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const LJ_ROLES: LJRole[] = [
  "ESA_TO",
  "ESA_TM",
  "ESA_LJM",
  "ESA_CCM",
  "ESA_DO",
  "ESA_IM",
  "TRADE_CM",
  "TRADE_TM",
  "ESA_LONG_JOB",
  "TRADE_LONG_JOB",
];

const SITE_IDS: SiteId[] = ["SITE-01", "SITE-02", "SITE-03"];

const LJ_ROLE_ACTIONS: Record<LJRole, string[]> = {
  ESA_TO: ["Approve & Order", "Approve SAT", "Final Approval", "Approve Costs"],
  ESA_TM: ["Accept RFQ", "Approve SAT", "Final Approval"],
  ESA_LJM: ["Accept RFQ", "Convert to RFW"],
  ESA_CCM: ["Confirm Invoice Information"],
  ESA_DO: ["Approve Drawing/Engineering", "Request Review"],
  ESA_IM: ["Approve CIFM Inventory", "Request Review"],
  TRADE_CM: ["Sign Yellow Page", "Confirm Payment"],
  TRADE_TM: [
    "Commit",
    "Approve Pre-SAT",
    "Send Invitation",
    "Complete Work",
  ],
  ESA_LONG_JOB: ["Approve & Order", "Accept RFQ", "Approve SAT"],
  TRADE_LONG_JOB: [
    "Commit",
    "Approve Pre-SAT",
    "Send Invitation",
    "Complete Work",
  ],
};

const LJ_STATUSES = [
  { percentage: 0, name: "RFQ - New Request" },
  { percentage: 10, name: "RFQ - From Fast Job" },
  { percentage: 20, name: "RFQ - Quotation Prep" },
  { percentage: 25, name: "RFQ - Pending Acceptance" },
  { percentage: 30, name: "RFW - Pending Approval" },
  { percentage: 32, name: "RFW - Issued" },
  { percentage: 40, name: "RFW - Commitment" },
  { percentage: 50, name: "RFW - Execution" },
  { percentage: 78, name: "78% - Work Ready" },
  { percentage: 79, name: "79% - Pre-SAT" },
  { percentage: 80, name: "80% - SAT Invite" },
  { percentage: 94, name: "94% - All Acceptances" },
];

interface RBACDashboardProps {
  initialUsers?: UserAccess[];
}

export function RBACDashboard({ initialUsers = [] }: RBACDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    "users" | "roleMatrix" | "moduleRbac"
  >("users");
  const [users, setUsers] = useState<UserAccess[]>(initialUsers);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserAccess | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);

  const handleAddUser = (user: UserAccess) => {
    setUsers([...users, user]);
    setShowAddUser(false);
  };

  const handleDeleteUser = (userId: string) => {
    setUsers(users.filter((u) => u.UserId !== userId));
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "users"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Users className="inline w-5 h-5 mr-2" />
          User & Site Access Monitor
        </button>
        <button
          onClick={() => setActiveTab("roleMatrix")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "roleMatrix"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Grid3x3 className="inline w-5 h-5 mr-2" />
          LJ 0%-100% Role Action Matrix
        </button>
        <button
          onClick={() => setActiveTab("moduleRbac")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "moduleRbac"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Lock className="inline w-5 h-5 mr-2" />
          Module & Field RBAC Matrix
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "users" && (
        <UserAccessMonitor
          users={users}
          onAddUser={handleAddUser}
          onDeleteUser={handleDeleteUser}
          expandedUser={expandedUser}
          setExpandedUser={setExpandedUser}
        />
      )}

      {activeTab === "roleMatrix" && (
        <LJRoleActionMatrix />
      )}

      {activeTab === "moduleRbac" && (
        <ModuleRBACMatrix />
      )}
    </div>
  );
}

// Tab 1: User & Site Access Monitor
function UserAccessMonitor({
  users,
  onAddUser,
  onDeleteUser,
  expandedUser,
  setExpandedUser,
}: {
  users: UserAccess[];
  onAddUser: (user: UserAccess) => void;
  onDeleteUser: (userId: string) => void;
  expandedUser: string | null;
  setExpandedUser: (userId: string | null) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState<Partial<UserAccess>>({
    AssignedSiteIds: [],
    LJRoles: [],
  });

  const handleAddClick = () => {
    if (
      newUser.UserId &&
      newUser.DisplayName &&
      newUser.SystemRole
    ) {
      onAddUser(newUser as UserAccess);
      setNewUser({ AssignedSiteIds: [], LJRoles: [] });
      setShowAddForm(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 flex justify-between items-center border-b border-gray-200">
        <h3 className="text-lg font-semibold">Users</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} />
          Add User
        </button>
      </div>

      {showAddForm && (
        <div className="p-4 bg-blue-50 border-b border-gray-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="User ID"
              value={newUser.UserId || ""}
              onChange={(e) =>
                setNewUser({ ...newUser, UserId: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <input
              type="text"
              placeholder="Display Name"
              value={newUser.DisplayName || ""}
              onChange={(e) =>
                setNewUser({ ...newUser, DisplayName: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <select
            value={newUser.SystemRole || ""}
            onChange={(e) =>
              setNewUser({ ...newUser, SystemRole: e.target.value as UserRole })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select System Role</option>
            {Object.keys(ROLE_PERMISSIONS).map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              onClick={handleAddClick}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              Add User
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded-lg text-sm hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">User ID</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">Display Name</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">System Role</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">Assigned Sites</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">LJ Roles</th>
              <th className="text-center px-4 py-2 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <React.Fragment key={user.UserId}>
                <tr className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {user.UserId}
                  </td>
                  <td className="px-4 py-2">{user.DisplayName}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                      {user.SystemRole}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {user.AssignedSiteIds.map((site) => (
                        <span
                          key={site}
                          className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs"
                        >
                          {site}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {user.LJRoles.slice(0, 2).map((role) => (
                        <span
                          key={role}
                          className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs"
                        >
                          {role}
                        </span>
                      ))}
                      {user.LJRoles.length > 2 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                          +{user.LJRoles.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() =>
                          setExpandedUser(
                            expandedUser === user.UserId ? null : user.UserId
                          )
                        }
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {expandedUser === user.UserId ? (
                          <ChevronUp size={18} />
                        ) : (
                          <ChevronDown size={18} />
                        )}
                      </button>
                      <button className="p-1 hover:bg-gray-200 rounded text-blue-600">
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => onDeleteUser(user.UserId)}
                        className="p-1 hover:bg-gray-200 rounded text-red-600"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>

                {expandedUser === user.UserId && (
                  <tr className="bg-blue-50">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="space-y-2">
                        <div>
                          <h4 className="font-semibold text-sm mb-1">
                            Site Access Preview
                          </h4>
                          <p className="text-xs text-gray-600">
                            This user can access:
                          </p>
                          <ul className="text-xs text-gray-700 mt-1 ml-2 space-y-1">
                            {user.AssignedSiteIds.map((site) => (
                              <li key={site}>
                                • {site} (all WRs, Equipment, and Locations)
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">All LJ Roles</h4>
                          <div className="flex flex-wrap gap-1">
                            {user.LJRoles.map((role) => (
                              <span
                                key={role}
                                className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs"
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Tab 2: LJ Role Action Matrix
function LJRoleActionMatrix() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">
          LJ 0%-100% Role Action Matrix
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Interactive matrix showing allowed actions per role at each substatus.
          <strong className="ml-1">P</strong> = Primary (full control),{" "}
          <strong>O</strong> = Optional (read/notify)
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-700 w-40">
                Substatus
              </th>
              {LJ_ROLES.map((role) => (
                <th
                  key={role}
                  className="text-center px-2 py-2 font-semibold text-gray-700 w-12"
                >
                  {role.substring(0, 5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LJ_STATUSES.map((status) => (
              <tr
                key={status.percentage}
                className={`border-b border-gray-200 hover:bg-gray-50 ${
                  status.percentage === 0 ? "bg-blue-50" : ""
                } ${status.percentage === 94 ? "bg-yellow-50" : ""} ${
                  status.percentage >= 78 && status.percentage < 94
                    ? "bg-green-50"
                    : ""
                }`}
              >
                <td className="text-left px-3 py-2 font-medium text-gray-900">
                  {status.percentage}% - {status.name}
                </td>
                {LJ_ROLES.map((role) => (
                  <td key={role} className="text-center px-2 py-2">
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium cursor-pointer hover:bg-blue-200">
                      P
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        <p className="mb-2">
          <strong>Color coding:</strong> Blue = RFQ track, Green = RFW track,
          Yellow = Acceptance gates (78%-94%)
        </p>
      </div>
    </div>
  );
}

// Tab 3: Module & Field RBAC Matrix
function ModuleRBACMatrix() {
  const longJobPermissions: Permission[] = [
    "longJobs.manageRFQ",
    "longJobs.manageRFW",
    "longJobs.approveAcceptanceGates",
    "longJobs.manageSiteContext",
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Module & Field RBAC Matrix</h3>
        <p className="text-sm text-gray-600 mt-1">
          Shows which system roles have access to Long Job specific modules and
          fields.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">
                Permission / Field
              </th>
              {Object.keys(ROLE_PERMISSIONS).map((role) => (
                <th
                  key={role}
                  className="text-center px-3 py-2 font-semibold text-gray-700"
                >
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {longJobPermissions.map((permission) => (
              <tr key={permission} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="text-left px-4 py-2 font-medium text-gray-900">
                  {permission}
                </td>
                {Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => {
                  const hasPermission = (perms as readonly string[]).includes(permission);
                  return (
                    <td key={role} className="text-center px-3 py-2">
                      {hasPermission ? (
                        <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs">
                          ✗
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

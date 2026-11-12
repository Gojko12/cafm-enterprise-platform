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
import { useSearchParams } from "next/navigation";
import { useCafmStore, useActiveUserPermissions, TRADE_ASSIGNMENT_ROLES, SITE_ASSIGNMENT_ROLES, ROLE_LABELS } from "@/lib/cafm-store";
import { FeaturePermissionMatrix, LJRoleActionMatrix } from "./RBACMatrices";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { StakeholderCatalogSection } from "@/components/modules/StakeholderCatalog";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";

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

type ConsoleTab =  "users" | "features" | "stages" | "trade-managers" | "teams";
const CONSOLE_TABS: { id: ConsoleTab; label: string }[] = [
  { id: "users", label: "1. Users & Site Access" },
  { id: "features", label: "2. Feature Permissions" },
  { id: "stages", label: "3. Long Job Stage Matrix (0%–100%)" },
  { id: "trade-managers", label: "4. Trade Managers" },
  { id: "teams", label: "5. Teams & Notices (Newsflash)" },
];

export function RBACDashboard() {
  const { data, setData } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState<ConsoleTab>(
    CONSOLE_TABS.some((tab) => tab.id === requestedTab) ? (requestedTab as ConsoleTab) : "users",
  );
  const setActiveTab = (tab: ConsoleTab) => {
    setActiveTabState(tab);
    window.history.replaceState(null, "", `?tab=${tab}`);
  };
  const users = data.users;
  const { profile } = useActiveUserPermissions();
  const canEditMatrices = !!(profile?.isSuperAdmin || profile?.isSiteAdmin);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserAccess | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);

  const handleAddUser = (user: UserAccess) => {
    if (users.some((item) => item.UserId === user.UserId)) {
      alert("A user with this ID already exists.");
      return;
    }
    const ljRole = LJ_ROLES.find((role) => role === user.SystemRole);
    setData((current) => ({ ...current, users: [...current.users, { ...user,
      AssignedSiteIds: [activeSiteId], LJRoles: ljRole ? [ljRole] : [], Trades: [...CLASSICAL_TRADES], CanAccessAll: false }] }));
    setShowAddUser(false);
  };

  const handleDeleteUser = (userId: string) => {
    if ([...data.tradeRoleMappings, ...data.siteRoleMappings].some((mapping) => Object.values(mapping.assignments).includes(userId))) {
      alert("Remove this user from the trade-role mappings before deleting them.");
      return;
    }
    setData((current) => ({ ...current, users: current.users.filter((user) => user.UserId !== userId) }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {CONSOLE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === tab.id
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "users" && <>
      <UserAccessMonitor
        users={users}
        onAddUser={handleAddUser}
        onDeleteUser={handleDeleteUser}
        expandedUser={expandedUser}
        setExpandedUser={setExpandedUser}
      />
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Site Administrator & Site-wide Role Assignments — {activeSiteId}</h2>
        <p className="text-sm text-gray-600">Choose who holds each site-wide role. Changes are saved automatically.</p>
        <div className="grid md:grid-cols-2 gap-3">
          {SITE_ASSIGNMENT_ROLES.map((role) => <label key={role} className="text-sm border rounded p-3 bg-gray-50">
            {ROLE_LABELS[role]} ({role})
            <select className="block w-full border rounded p-2 bg-white"
              value={data.siteRoleMappings.find((item) => item.SiteId === activeSiteId)?.assignments[role] ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setData((current) => {
                  const existing = current.siteRoleMappings.find((item) => item.SiteId === activeSiteId);
                  return { ...current, siteRoleMappings: [...current.siteRoleMappings.filter((item) => item.SiteId !== activeSiteId),
                    { SiteId: activeSiteId, assignments: { ...existing?.assignments, [role]: value } }] };
                });
              }}>
              <option value="">Unassigned</option>
              {users.filter((user) => (user.CanAccessAll || user.AssignedSiteIds.includes(activeSiteId)) &&
                (user.LJRoles.includes(role) || user.SystemRole === role)).map((user) =>
                <option key={user.UserId} value={user.UserId}>{user.DisplayName}</option>)}
            </select>
          </label>)}
        </div>
      </section>
      </>}

      {activeTab === "features" && <FeaturePermissionMatrix canEdit={canEditMatrices} />}

      {activeTab === "stages" && <LJRoleActionMatrix canEdit={canEditMatrices} />}

      {activeTab === "trade-managers" && (
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Trade Managers — {activeSiteId}</h2>
        <p className="text-sm text-gray-600">Main / Deputy manager and notification contacts for each trade. Changes are saved automatically.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50"><tr>
              <th className="text-left px-3 py-2">Trade</th>
              {TRADE_ASSIGNMENT_ROLES.map((role) => <th key={role} className="text-left px-3 py-2">{ROLE_LABELS[role]} <span className="text-xs text-gray-500">({role})</span></th>)}
            </tr></thead>
            <tbody>
              {CLASSICAL_TRADES.map((trade) => {
                const mapping = data.tradeRoleMappings.find((item) => item.SiteId === activeSiteId && item.Trade === trade);
                return <tr key={trade} className="border-t">
                  <td className="px-3 py-2 font-semibold">{trade}</td>
                  {TRADE_ASSIGNMENT_ROLES.map((role) => <td key={role} className="px-3 py-2">
                    <select className="block w-full border rounded p-1.5 text-sm" value={mapping?.assignments[role] ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setData((current) => {
                          const existing = current.tradeRoleMappings.find((item) => item.SiteId === activeSiteId && item.Trade === trade);
                          return { ...current, tradeRoleMappings: [...current.tradeRoleMappings.filter((item) => !(item.SiteId === activeSiteId && item.Trade === trade)),
                            { SiteId: activeSiteId, Trade: trade, assignments: { ...existing?.assignments, [role]: value } }] };
                        });
                      }}>
                      <option value="">Unassigned</option>
                      {users.filter((user) => (user.CanAccessAll || user.AssignedSiteIds.includes(activeSiteId)) &&
                        (user.LJRoles.includes(role) || user.SystemRole === role) &&
                        (user.Trades.length === 0 || user.Trades.includes(trade))).map((user) =>
                        <option key={user.UserId} value={user.UserId}>{user.DisplayName}</option>)}
                    </select>
                  </td>)}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {activeTab === "teams" && <StakeholderCatalogSection />}
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

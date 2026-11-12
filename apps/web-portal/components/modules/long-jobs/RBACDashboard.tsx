"use client";

import React, { useState, useMemo } from "react";
import {
  UserAccess,
  UserAccessProfile,
  SiteRoleAssignment,
  SITE_LABELS,
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
import { CLASSICAL_TRADES, PLATFORM_SITE_IDS } from "@cafm/shared-schema";
import type { CifmPerson } from "@cafm/shared-schema";
import { CifmDirectoryTab, FmAccessModal, FmStaffTable, SiteAdminCards } from "./PeopleDirectory";
import { TradeManagerAssignments } from "@/components/modules/TradeManagerAssignments";
import { OnboardingQueue, OnboardPersonModal } from "./OnboardingQueue";
import { pendingOnboardingCount } from "@/lib/onboarding";
import { UserAccessMatrix } from "@/components/modules/UserAccessMatrix";

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

const SITE_IDS: SiteId[] = [...PLATFORM_SITE_IDS];

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

type ConsoleTab = "directory" | "fm-roles" | "capabilities" | "stages" | "teams" | "onboarding";
const CONSOLE_TABS: { id: ConsoleTab; label: string }[] = [
  { id: "directory", label: "1. CIFM People Directory (All Employees)" },
  { id: "fm-roles", label: "2. FM Roles, Trades & Site Admins" },
  { id: "capabilities", label: "3. Role Capabilities & Permissions" },
  { id: "stages", label: "4. Long Job Stage Matrix (0%–100%)" },
  { id: "teams", label: "5. Teams & Notices (Newsflash)" },
  { id: "onboarding", label: "Onboarding Queue" },
];
const LEGACY_TAB_IDS: Record<string, ConsoleTab> = { users: "directory", features: "capabilities", "trade-managers": "fm-roles" };

export function RBACDashboard() {
  const { data, setData } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") ?? "";
  const [activeTab, setActiveTabState] = useState<ConsoleTab>(
    CONSOLE_TABS.some((tab) => tab.id === requestedTab) ? (requestedTab as ConsoleTab) : LEGACY_TAB_IDS[requestedTab] ?? "directory",
  );
  const [fmView, setFmView] = useState<"people" | "trades">("people");
  const [capView, setCapView] = useState<"modules" | "operations">("modules");
  const [fmEditing, setFmEditing] = useState<CifmPerson | null>(null);
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
  const [showOnboard, setShowOnboard] = useState(false);
  const pendingCount = pendingOnboardingCount(data.onboardingRequests);

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
      <div className="flex justify-end">
        <button type="button" onClick={() => setShowOnboard(true)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-800">+ Onboard New Person</button>
      </div>
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
            {tab.id === "onboarding" ? `Onboarding Queue (${pendingCount} Pending)` : tab.label}
            {tab.id === "onboarding" && pendingCount > 0 && <span className="ml-2 rounded-full bg-rose-600 px-1.5 py-0.5 text-xs text-white">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {showOnboard && <OnboardPersonModal onClose={() => setShowOnboard(false)} />}
      {activeTab === "onboarding" && <OnboardingQueue />}

      {activeTab === "directory" && <CifmDirectoryTab onGrantFm={setFmEditing} />}
      {fmEditing && <FmAccessModal person={fmEditing} onClose={() => setFmEditing(null)} />}

      {activeTab === "fm-roles" && <>
      <SiteAdminCards />
      <div className="flex gap-2">
        {([["people", "FM People & Access"], ["trades", "Long Job Main / Deputy by Trade"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFmView(id)} className={`rounded px-3 py-1.5 text-sm ${fmView === id ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{label}</button>))}
      </div>
      {fmView === "people" && <>
      <FmStaffTable onEdit={setFmEditing} />
      <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">Login accounts &amp; legacy site access for {activeSiteId}</summary>
      <UserAccessMonitor
        users={users}
        profiles={data.userAccessProfiles.filter((item) => item.siteId === activeSiteId)}
        assignments={data.siteRoleAssignments.filter((item) => item.SiteId === activeSiteId)}
        canEdit={canEditMatrices}
        onToggleSiteAdmin={(personName, value) => setData((current) => ({ ...current, userAccessProfiles: current.userAccessProfiles.map((item) =>
          item.siteId === activeSiteId && item.personName === personName ? { ...item, isSiteAdmin: value } : item) }))}
        onAddUser={handleAddUser}
        onDeleteUser={handleDeleteUser}
        expandedUser={expandedUser}
        setExpandedUser={setExpandedUser}
      />
      </details>
      </>}
      </>}

      {activeTab === "capabilities" && <>
      <div className="flex gap-2">
        {([["modules", "Module & Feature Permissions"], ["operations", "Operational Capabilities (Create FJ, Claim WR, Inspections…)"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setCapView(id)} className={`rounded px-3 py-1.5 text-sm ${capView === id ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{label}</button>))}
      </div>
      {capView === "modules" && <FeaturePermissionMatrix canEdit={canEditMatrices} />}
      {capView === "operations" && <UserAccessMatrix key={activeSiteId} mode="roles" />}
      </>}

      {activeTab === "stages" && <LJRoleActionMatrix canEdit={canEditMatrices} />}

      {activeTab === "fm-roles" && fmView === "trades" && <>
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
      <TradeManagerAssignments />
      </>}

      {activeTab === "teams" && <StakeholderCatalogSection />}
    </div>
  );
}

// Tab 1: User & Site Access Monitor
function UserAccessMonitor({
  users,
  profiles,
  assignments,
  canEdit,
  onToggleSiteAdmin,
  onAddUser,
  onDeleteUser,
  expandedUser,
  setExpandedUser,
}: {
  users: UserAccess[];
  profiles: UserAccessProfile[];
  assignments: SiteRoleAssignment[];
  canEdit: boolean;
  onToggleSiteAdmin: (personName: string, value: boolean) => void;
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
              <th className="text-left px-4 py-2 font-semibold text-gray-700">Person</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">Contact</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">System Role</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">Site Access</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">Site Admin</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">Main / Deputy Roles</th>
              <th className="text-center px-4 py-2 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const profile = profiles.find((item) => item.personName === user.DisplayName || item.username === user.UserId);
              const mine = assignments.filter((item) => item.PersonName === user.DisplayName);
              const mainRoles = [...new Set(mine.filter((item) => item.AssignmentLevel === "Main").map((item) => item.RoleCode))];
              const deputyRoles = [...new Set(mine.filter((item) => item.AssignmentLevel === "Deputy").map((item) => item.RoleCode))];
              const sites = profile?.siteAccess ?? user.AssignedSiteIds;
              return (
              <React.Fragment key={user.UserId}>
                <tr className="border-b border-gray-200 hover:bg-gray-50 align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{profile?.fullName ?? user.DisplayName}</div>
                    <div className="text-xs text-gray-500">@{profile?.username ?? user.UserId}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-700">
                    <div>{profile?.email ?? "—"}</div>
                    <div>{profile?.phone ?? ""}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                      {user.SystemRole === "HELPDESK" ? "Helpdesk" : user.SystemRole}
                    </span>
                    {profile?.isSuperAdmin && <span className="ml-1 px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs">Super Admin</span>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {sites.map((site) => (
                        <span key={site} className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">{SITE_LABELS[site] ?? site}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <label className="inline-flex items-center gap-1 text-xs">
                      <input type="checkbox" disabled={!canEdit || !profile || !!profile.isSuperAdmin} checked={!!(profile?.isSiteAdmin || profile?.isSuperAdmin)}
                        onChange={(e) => profile && onToggleSiteAdmin(profile.personName, e.target.checked)} />
                      Site Admin
                    </label>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {mainRoles.map((role) => <span key={`m-${role}`} className="px-2 py-1 bg-purple-100 text-purple-800 rounded">Main · {role}</span>)}
                      {deputyRoles.map((role) => <span key={`d-${role}`} className="px-2 py-1 bg-slate-100 text-slate-700 rounded">Deputy · {role}</span>)}
                      {!mainRoles.length && !deputyRoles.length && <span className="text-gray-400">—</span>}
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
                    <td colSpan={7} className="px-4 py-3">
                      <div className="space-y-2">
                        <div>
                          <h4 className="font-semibold text-sm mb-1">
                            Site Access Preview
                          </h4>
                          <p className="text-xs text-gray-600">
                            This user can access:
                          </p>
                          <ul className="text-xs text-gray-700 mt-1 ml-2 space-y-1">
                            {sites.map((site) => (
                              <li key={site}>
                                • {SITE_LABELS[site] ?? site} (all WRs, Equipment, and Locations)
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

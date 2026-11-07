"use client";

import React from "react";
import { 
  Building, Home, Settings, Wrench, Zap, Clipboard, 
  Calendar, Upload, BarChart3, Lock, Globe, AlertCircle
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/hooks/useApp";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { LJRole, SiteId } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import type { SiteRoleAssignment } from "@cafm/shared-schema";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { section: "Workspace", items: [
    { href: "/locations", label: "Locations", icon: Building },
    { href: "/floor-plans", label: "Floor Plans", icon: Building },
    { href: "/bim-viewer", label: "3D BIM Viewer", icon: Settings },
    { href: "/equipment", label: "Equipment Registry", icon: Settings },
    { href: "/desk-reservations", label: "Desk Reservations", icon: Settings },
  ]},
  { section: "Operations", items: [
    { href: "/work-requests", label: "Work Requests", icon: Wrench },
    { href: "/work-requests#PM", label: "Preventive Maintenance", icon: Wrench },
    { href: "/work-requests#FJ", label: "Fast Jobs", icon: Wrench },
    { href: "/work-requests#LJ", label: "Long Jobs", icon: Wrench },
    { href: "/site-role-assignments", label: "Site Role Assignments", icon: Lock },
    { href: "/smart-pm", label: "SmartPM", icon: Zap },
    { href: "/technical-audits", label: "Technical Audits", icon: Clipboard },
    { href: "/scheduler", label: "Scheduler", icon: Calendar },
  ]},
  { section: "Administration", items: [
    { href: "/import-export", label: "Import/Export", icon: Upload },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/rbac", label: "RBAC Settings", icon: Lock },
  ]},
];

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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-900 text-white h-screen overflow-y-auto border-r border-gray-800">
      <div className="p-6">
        <h1 className="text-2xl font-bold">CAFM Platform</h1>
        <p className="text-gray-400 text-sm mt-1">Enterprise Edition</p>
      </div>

      <nav className="px-3 py-4 space-y-6">
        {/* Dashboard */}
        <Link
          href="/"
          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            pathname === "/"
              ? "bg-blue-600 text-white"
              : "text-gray-300 hover:bg-gray-800"
          }`}
        >
          <Home size={20} />
          <span className="text-sm font-medium">Dashboard</span>
        </Link>

        {/* Sections */}
        {NAV_ITEMS.map((item) => {
          if ("section" in item && item.section) {
            return (
              <div key={item.section} className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase px-4">
                  {item.section}
                </p>
                <div className="space-y-1">
                  {item.items.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href || pathname.startsWith(href + "/");
                    if (href.includes("#")) {
                      return (
                        <a key={href} href={href} className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm text-gray-300 hover:bg-gray-800">
                          <Icon size={18} />
                          <span className="font-medium">{label}</span>
                        </a>
                      );
                    }
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm ${
                          isActive
                            ? "bg-blue-600 text-white"
                            : "text-gray-300 hover:bg-gray-800"
                        }`}
                      >
                        <Icon size={18} />
                        <span className="font-medium">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          }
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-400">© 2026 Enterprise CAFM</p>
      </div>
    </aside>
  );
}

export function TopBar() {
  const { currentRole, setCurrentRole, setSelectedBuilding, setSelectedFloor, setSelectedRoom } = useApp();
  const { activeSiteId, setActiveSiteId, activeLJRole, setActiveLJRole, activePerson, setActivePerson } = useSiteContext();
  const { data: storeData, reset } = useCafmStore();
  const roles = ["SiteAdministrator", "ESA_LongJobManager", "PM_Planner", "QA_Inspector", "MobileTechnician", "TeamLeader", "StandardEmployee"];

  const getRoleBadgeColor = (role: string) => {
    if (role.includes("Admin")) return "bg-red-100 text-red-800";
    if (role.includes("Manager") || role.includes("Planner")) return "bg-blue-100 text-blue-800";
    return "bg-emerald-100 text-emerald-800";
  };

  const getSiteName = (siteId: SiteId): string => {
    const siteNames: Record<SiteId, string> = {
      "SITE-01": "ESOC Darmstadt",
      "SITE-02": "ESTEC Noordwijk",
      "SITE-03": "ESRIN Frascati",
    };
    return siteNames[siteId];
  };
  const activeAssignments: SiteRoleAssignment[] = storeData.siteRoleAssignments.filter((assignment) =>
    assignment.SiteId === activeSiteId && assignment.PersonName === activePerson);
  const people = ["Mark", "Yvonne", "Claudia", "Bastian", "Thomas", "Draftsman", "Inventory Admin", "SiteAdmin"];

  return (
    <div className="min-h-20 h-auto bg-white border-b border-gray-200 px-6 py-2 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="text-right">
          <label className="text-xs font-medium text-gray-600" htmlFor="active-person">Active Person</label>
          <select id="active-person" aria-label="Active Person" value={activePerson} onChange={(event) => setActivePerson(event.target.value)}
            className="ml-2 max-w-40 rounded border border-gray-300 bg-white px-2 py-1 text-sm">
            {people.map((person) => <option key={person} value={person}>
              {person === "SiteAdmin" ? "SiteAdmin (All Override)" : person === "Thomas" ? "Thomas (ESA_TO)" :
                person === "Draftsman" ? "Draftsman (ESA_DO)" : person === "Inventory Admin" ? "Inventory Admin (ESA_IM)" : person}
            </option>)}
          </select>
          <div className="mt-1 flex max-w-[32rem] flex-wrap justify-end gap-1">
            {activePerson === "SiteAdmin" ? <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">All Override</span> :
              activeAssignments.map((assignment) => <span key={assignment.AssignmentId}
                className={`rounded px-2 py-0.5 text-xs font-semibold ${assignment.AssignmentLevel === "Main" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-900"}`}>
                {assignment.SiteId} · {assignment.Trade} · {assignment.RoleCode} · {assignment.AssignmentLevel}
              </span>)}
            {!activeAssignments.length && activePerson !== "SiteAdmin" && <span className="text-xs text-gray-500">No assignments at this site</span>}
          </div>
        </div>
        {/* Site Context Switcher */}
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-gray-600" />
          <select
            value={activeSiteId}
            onChange={(e) => {
              setSelectedBuilding(null);
              setSelectedFloor(null);
              setSelectedRoom(null);
              setActiveSiteId(e.target.value as SiteId);
            }}
            className="px-3 py-2 rounded border border-gray-300 text-sm font-medium bg-gray-50 hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
          >
            {SITE_IDS.map((site) => (
              <option key={site} value={site}>
                {getSiteName(site)} ({site})
              </option>
            ))}
          </select>
        </div>
        <button onClick={reset} className="px-3 py-2 border rounded text-sm">Reset Demo Data</button>
      </div>
      
      <div className="flex items-center gap-4">
        {/* LJ Role Selector */}
        <div className="text-right">
          <p className="text-xs font-medium text-gray-600">LJ Role</p>
          <select
            value={activeLJRole || ""}
            onChange={(e) => setActiveLJRole((e.target.value || null) as LJRole | null)}
            className="px-2 py-1 rounded text-xs border border-gray-300 bg-white"
          >
            <option value="">None</option>
            {LJ_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        {/* System Role Selector */}
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">Current Role</p>
          <div className="flex gap-2 mt-1">
            <select
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value as any)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border-0 ${getRoleBadgeColor(currentRole)}`}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LocationContextBar() {
  const { selectedBuilding, selectedFloor, selectedRoom } = useApp();

  return (
    <div className="h-12 bg-gray-100 border-b border-gray-200 px-6 flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-600">Location Context:</span>
        <span className="font-semibold text-gray-900">
          {selectedBuilding ? selectedBuilding.Name : "No Building"}
        </span>
        {selectedFloor && (
          <>
            <span className="text-gray-400">/</span>
            <span className="font-semibold text-gray-900">{selectedFloor.LevelName}</span>
          </>
        )}
        {selectedRoom && (
          <>
            <span className="text-gray-400">/</span>
            <span className="font-semibold text-gray-900">{selectedRoom.RoomCode}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <LocationContextBar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

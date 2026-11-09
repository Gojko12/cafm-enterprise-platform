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
import { SiteId } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
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
    { href: "/work-requests#PM", label: "Preventive Maintenance", icon: Wrench },
    { href: "/work-requests#FJ", label: "Fast Jobs", icon: Wrench },
    { href: "/work-requests#LJ", label: "Long Jobs", icon: Wrench },
    { href: "/site-role-assignments", label: "Site Role Assignments", icon: Lock },
    { href: "/smart-pm", label: "SmartPM", icon: Zap },
    { href: "/technical-audits", label: "Technical Audits", icon: Clipboard },
    { href: "/audit-assurance", label: "Audit & Assurance", icon: Clipboard },
    { href: "/scheduler", label: "Scheduler", icon: Calendar },
  ]},
  { section: "Administration", items: [
    { href: "/import-export", label: "Import/Export", icon: Upload },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/rbac", label: "RBAC Settings", icon: Lock },
  ]},
];

const SITE_IDS: SiteId[] = ["SITE-01", "SITE-02", "SITE-03"];

export function Sidebar() {
  const pathname = usePathname();
  const [hash, setHash] = React.useState("");
  React.useEffect(() => {
    const update = () => setHash(window.location.hash || "#PM");
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [pathname]);

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
                    const target = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
                    const route = target === "PM" ? "/preventive-maintenance" : target === "FJ" ? "/fast-jobs" : target === "LJ" ? "/long-jobs" : "";
                    const isActive = target ? pathname === route || (pathname === "/work-requests" && hash === `#${target}`) : pathname === href || pathname.startsWith(href + "/");
                    if (href.includes("#")) {
                      return (
                        <a key={href} href={href} aria-current={isActive ? "page" : undefined} className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm ${isActive ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}>
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
  const { setSelectedBuilding, setSelectedFloor, setSelectedRoom } = useApp();
  const { activeSiteId, setActiveSiteId, activePerson, setActivePerson } = useSiteContext();
  const { data: storeData, reset } = useCafmStore();
  const { governance } = useActiveUserPermissions();

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
  const people = [...new Set(["Mark", "Yvonne", "Claudia", "Bastian", "Thomas", "Draftsman", "Inventory Admin", "TeamLeader", ...storeData.siteRoleAssignments.map((item) => item.PersonName), ...storeData.userAccessProfiles.map((item) => item.personName), "SiteAdmin"])];

  return (
    <div className="h-14 shrink-0 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="text-right">
          <label className="text-xs font-medium text-gray-600" htmlFor="active-person">Active Person</label>
          <select id="active-person" aria-label="Active Person" value={activePerson} onChange={(event) => setActivePerson(event.target.value)}
            className="ml-2 max-w-40 rounded border border-gray-300 bg-white px-2 py-1 text-sm">
            {people.map((person) => <option key={person} value={person}>
              {person === "SiteAdmin" ? "SiteAdministrator (All Override)" : person === "Thomas" ? "Thomas (ESA_TO)" :
                person === "Draftsman" ? "Draftsman (ESA_DO)" : person === "Inventory Admin" ? "Inventory Admin (ESA_IM)" : person}
            </option>)}
          </select>
          <span tabIndex={0} title={activePerson === "SiteAdmin" ? "All Override" : activeAssignments.map((item) => `${item.Trade}: ${item.RoleCode} (${item.AssignmentLevel})`).join("\n") || "No assignments at this site"}
            className="ml-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">
            {activePerson === "SiteAdmin" ? "All Override" : `${activeAssignments.length} roles`}
          </span>
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
        <button disabled={!governance("canResetOrExportSiteData")} onClick={() => { if (governance("canResetOrExportSiteData")) reset(); }} className="px-3 py-2 border rounded text-sm disabled:opacity-40">Reset Demo Data</button>
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

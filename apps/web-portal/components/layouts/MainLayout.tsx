"use client";

import React from "react";
import {
  Armchair, ArrowLeftRight, BarChart3, Box, Building, Calendar, CalendarClock,
  ChevronsLeft, ChevronsRight, ClipboardCheck, Cog, Gauge, Globe, Home,
  Hourglass, Map, Repeat, Satellite, ShieldCheck, Users, Zap
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/hooks/useApp";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { SiteId, PLATFORM_SITE_IDS, SITE_LABELS } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import type { SiteRoleAssignment } from "@cafm/shared-schema";
import { PhoneShare } from "@/components/common/PhoneShare";
import { PLATFORM_VERSION } from "@/lib/platform-version";

const NAV_ITEMS = [
  { section: "Workspace", items: [
    { href: "/locations", label: "Locations", icon: Building },
    { href: "/floor-plans", label: "Floor Plans", icon: Map },
    { href: "/bim-viewer", label: "3D BIM Viewer", icon: Box },
    { href: "/equipment", label: "Equipment Registry", icon: Cog },
    { href: "/desk-reservations", label: "Desk Reservations", icon: Armchair },
  ]},
  { section: "Operations", items: [
    { href: "/preventive-maintenance", label: "Preventive Maintenance", icon: CalendarClock },
    { href: "/fast-jobs", label: "Fast Jobs", icon: Zap },
    { href: "/long-jobs", label: "Long Jobs", icon: Hourglass },
    { href: "/smart-pm", label: "SmartPM", icon: Repeat },
    { href: "/technical-audits", label: "Technical Audits", icon: ClipboardCheck },
    { href: "/audit-assurance", label: "Audit & Assurance", icon: ShieldCheck },
    { href: "/scheduler", label: "Scheduler", icon: Calendar },
    { href: "/mission-control", label: "Mission Control", icon: Satellite },
  ]},
  { section: "Administration", items: [
    { href: "/import-export", label: "Import/Export", icon: ArrowLeftRight },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/rbac", label: "People & Permissions", icon: Users },
    { href: "/sla-settings", label: "SLA Settings", icon: Gauge },
  ]},
];

const SITE_IDS: SiteId[] = [...PLATFORM_SITE_IDS];

const SIDEBAR_COLLAPSED_KEY = "cafm_sidebar_collapsed_v1";

function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const { alertsMuted, setAlertsMuted } = useCafmStore();

  React.useEffect(() => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Storage may be unavailable (private mode); collapse still applies for this session.
      }
      return next;
    });
  };

  return (
    <aside className={`${collapsed ? "w-20" : "w-64"} bg-gray-900 text-white h-screen overflow-y-auto border-r border-gray-800 shrink-0 transition-[width] duration-200`}>
      <div className={`p-6 ${collapsed ? "px-0 flex items-center justify-center" : "flex items-start justify-between gap-2"}`}>
        {!collapsed && (
          <div>
            <h1 className="text-2xl font-bold">CAFM Platform</h1>
            <p className="text-gray-400 text-sm mt-1">Enterprise Edition · {PLATFORM_VERSION}</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>

      <nav className="px-3 py-4 space-y-6">
        {/* Dashboard */}
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          title={collapsed ? "Dashboard" : undefined}
          className={`flex items-center gap-3 rounded-lg transition-colors ${
            collapsed ? "justify-center px-2 py-3" : "px-4 py-3"
          } ${
            pathname === "/"
              ? "bg-blue-600 text-white"
              : "text-gray-300 hover:bg-gray-800"
          }`}
        >
          <Home size={20} />
          {!collapsed && <span className="text-sm font-medium">Dashboard</span>}
        </Link>

        {/* Sections */}
        {NAV_ITEMS.map((item) => {
          if ("section" in item && item.section) {
            return (
              <div key={item.section} className="space-y-2">
                {collapsed ? (
                  <div className="border-t border-gray-800 mx-2" aria-hidden="true" />
                ) : (
                  <p className="text-xs font-semibold text-gray-500 uppercase px-4">
                    {item.section}
                  </p>
                )}
                <div className="space-y-1">
                  {item.items.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href || pathname.startsWith(href + "/");
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={collapsed ? label : undefined}
                        title={collapsed ? label : undefined}
                        className={`flex items-center gap-3 rounded-lg transition-colors text-sm ${
                          collapsed ? "justify-center px-2 py-3" : "px-4 py-3"
                        } ${
                          isActive
                            ? "bg-blue-600 text-white"
                            : "text-gray-300 hover:bg-gray-800"
                        }`}
                      >
                        <Icon size={18} />
                        {!collapsed && <span className="font-medium">{label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          }
          return null;
        })}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-400">© 2026 Enterprise CAFM</p>
          {alertsMuted && <button type="button" onClick={() => setAlertsMuted(false)} className="mt-2 block text-xs text-gray-500 hover:text-gray-300 underline">System alerts are hidden · Show</button>}
        </div>
      )}
    </aside>
  );
}

export function TopBar() {
  const [shareOpen, setShareOpen] = React.useState(false);
  const [mobileUrl, setMobileUrl] = React.useState("");
  React.useEffect(() => {
    setMobileUrl(`${window.location.origin}/mobile/`);
  }, []);
  const { setSelectedBuilding, setSelectedFloor, setSelectedRoom } = useApp();
  const { activeSiteId, setActiveSiteId, activePerson, setActivePerson } = useSiteContext();
  const { data: storeData, reset } = useCafmStore();
  const { governance, profile } = useActiveUserPermissions();
  const getSiteName = (siteId: SiteId): string => SITE_LABELS[siteId];
  // Strict 2-SuperAdmin multi-site rule: everyone else is locked to their single assigned site.
  const multiSite = !profile || !!profile.isSuperAdmin;
  const visibleSites: SiteId[] = multiSite ? SITE_IDS : [profile.siteAccess?.[0] ?? profile.siteId];
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
            disabled={!multiSite}
            title={multiSite ? undefined : "Single-site access · SuperAdmin required for multi-site"}
            onChange={(e) => {
              setSelectedBuilding(null);
              setSelectedFloor(null);
              setSelectedRoom(null);
              setActiveSiteId(e.target.value as SiteId);
            }}
            className="px-3 py-2 rounded border border-gray-300 text-sm font-medium bg-gray-50 hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
          >
            {(visibleSites.includes(activeSiteId) ? visibleSites : [...visibleSites, activeSiteId]).map((site) => (
              <option key={site} value={site}>
                {getSiteName(site)} ({site})
              </option>
            ))}
          </select>
          {!multiSite && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600" title="Only Mark Meyer and Gregor Kovac (SuperAdmins) may view all five ESA sites.">Single-site access · SuperAdmin required for multi-site</span>}
        </div>
        <button disabled={!governance("canResetOrExportSiteData")} onClick={() => { if (governance("canResetOrExportSiteData")) reset(); }} className="px-3 py-2 border rounded text-sm disabled:opacity-40">Reset Demo Data</button>
      </div>
      <div className="flex items-center gap-2"><a href="/mobile/" className="rounded bg-blue-700 px-3 py-2 text-sm font-semibold text-white">📱 Open Mobile App</a><button onClick={() => setShareOpen(true)} className="rounded border px-3 py-2 text-sm">QR / Share</button></div>
      {shareOpen && <PhoneShare initialUrl={mobileUrl} onClose={() => setShareOpen(false)} />}
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

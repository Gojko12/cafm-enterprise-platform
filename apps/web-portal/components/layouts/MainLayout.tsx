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

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
        <p className="text-xs text-gray-400">© 2026 Enterprise CAFM</p>
      </div>
    </aside>
  );
}

export function TopBar() {
  const { currentRole, setCurrentRole } = useApp();
  const { activeSiteId, setActiveSiteId, availableSites, canSwitchSites, activeLJRole, setActiveLJRole } = useSiteContext();
  const roles = ["SiteAdministrator", "ESA_LongJobManager", "PM_Planner", "QA_Inspector", "MobileTechnician", "StandardEmployee"];

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

  return (
    <div className="h-20 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {/* Site Context Switcher */}
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-gray-600" />
          <select
            value={activeSiteId}
            onChange={(e) => {
              if (canSwitchSites()) {
                setActiveSiteId(e.target.value as SiteId);
              }
            }}
            disabled={!canSwitchSites() && availableSites.length === 1}
            className="px-3 py-2 rounded border border-gray-300 text-sm font-medium bg-gray-50 hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
          >
            {availableSites.map((site) => (
              <option key={site} value={site}>
                {getSiteName(site)}
              </option>
            ))}
          </select>
          {availableSites.length > 1 && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
              Multi-Site Active
            </span>
          )}
        </div>

        {/* Isolation Banner */}
        {availableSites.length === 1 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
            <AlertCircle size={14} />
            <span>Site Isolation Active</span>
          </div>
        )}
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

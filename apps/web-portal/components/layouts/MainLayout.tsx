"use client";

import React from "react";
import { Building, Home, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/hooks/useApp";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/locations", label: "Locations", icon: Building },
  { href: "/floor-plans", label: "Floor Plans", icon: Building },
  { href: "/bim-viewer", label: "3D BIM Viewer", icon: Settings },
  { href: "/equipment", label: "Equipment Registry", icon: Settings },
  { href: "/desk-reservations", label: "Desk Reservations", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-900 text-white h-screen overflow-y-auto border-r border-gray-800">
      <div className="p-6">
        <h1 className="text-2xl font-bold">CAFM Platform</h1>
        <p className="text-gray-400 text-sm mt-1">Enterprise Edition</p>
      </div>

      <nav className="px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              <Icon size={20} />
              <span className="text-sm font-medium">{label}</span>
            </Link>
          );
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
  const roles = ["SiteAdministrator", "ESA_LongJobManager", "PM_Planner", "QA_Inspector", "MobileTechnician", "StandardEmployee"];

  const getRoleBadgeColor = (role: string) => {
    if (role.includes("Admin")) return "bg-red-100 text-red-800";
    if (role.includes("Manager") || role.includes("Planner")) return "bg-blue-100 text-blue-800";
    return "bg-emerald-100 text-emerald-800";
  };

  return (
    <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
      <div className="flex-1" />
      
      <div className="flex items-center gap-4">
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

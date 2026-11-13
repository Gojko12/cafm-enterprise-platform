import React, { useEffect, useState } from "react";
import { formatDateTimeDDMMYYYY, normalizeSiteId, PLATFORM_SITE_IDS, SITE_LABELS } from "@cafm/shared-schema";
import type { SiteId, UserAccessProfile } from "@cafm/shared-schema";
import type { SyncStatus } from "../lib/offline-engine";
import { notify } from "../lib/toast";

export type DrawerTarget = "home" | "scanner" | "timers" | "audit-assurance" | "settings";

export const MenuButton: React.FC<{ onClick: () => void; badge?: "offline" | "pending" | null }> = ({ onClick, badge }) => (
  <button type="button" onClick={onClick} aria-label="Open menu" className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-slate-700">
    {"\u2630"}
    {badge && <span aria-hidden="true" className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white ${badge === "offline" ? "bg-amber-500" : "bg-blue-500"}`} />}
  </button>
);

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  activeSiteId: SiteId;
  onSiteChange: (site: SiteId) => void;
  technicianId: string;
  technicians: Array<{ id: string; Name: string; LastName: string; Trade: string }>;
  profiles: UserAccessProfile[];
  vpaTrades: readonly string[];
  onTechnicianChange: (id: string) => void;
  onSyncNow: () => Promise<SyncStatus>;
  onClearPending: () => Promise<number>;
  isSimulatedOffline: boolean;
  isOffline: boolean;
  pendingCount: number;
  onToggleOffline: (offline: boolean) => void;
  currentView: string;
  onNavigate: (view: DrawerTarget) => void;
  version: string;
  timerCount: number;
}

const items: Array<[DrawerTarget, string]> = [
  ["home", "Work Requests"],
  ["scanner", "Scan QR"],
  ["timers", "Timers"],
  ["audit-assurance", "Audit & Assurance (Sophia)"],
  ["settings", "Profile & Settings"],
];

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  open, onClose, activeSiteId, onSiteChange, technicianId, technicians, profiles, vpaTrades, onTechnicianChange,
  onSyncNow, onClearPending, isSimulatedOffline, isOffline, pendingCount, onToggleOffline, currentView, onNavigate, version, timerCount,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>();
  useEffect(() => {
    const synced = () => setLastSync(new Date());
    window.addEventListener("cafm-sync-success", synced);
    return () => window.removeEventListener("cafm-sync-success", synced);
  }, []);
  if (!open) return null;

  const sync = async () => {
    setSyncing(true);
    try {
      await onSyncNow();
      setLastSync(new Date());
    } catch (error) {
      notify(error instanceof Error ? error.message : "Synchronization failed.");
    } finally { setSyncing(false); }
  };
  const clearPending = async () => {
    if (!window.confirm(`Permanently remove ${pendingCount} pending sync item${pendingCount === 1 ? "" : "s"} from this device? Saved work requests remain on this device, but these changes will no longer upload.`)) return;
    setClearing(true);
    try {
      const count = await onClearPending();
      notify(`Removed ${count} pending sync item${count === 1 ? "" : "s"}. Saved work requests remain on this device.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not clear the pending sync queue.");
    } finally { setClearing(false); }
  };
  const forceReload = async () => {
    try {
      const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    } finally { window.location.reload(); }
  };

  return (
    <div className="fixed inset-0 z-[95] flex" role="presentation">
      <aside role="dialog" aria-modal="true" aria-label="Menu" className="flex h-full w-[82%] max-w-xs flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="space-y-3 border-b p-4">
          <div className="flex items-center justify-between">
            <strong className="text-base">CAFM Mobile</strong>
            <button type="button" onClick={onClose} aria-label="Close menu" className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600">{"\u2715"}</button>
          </div>
          <label className="block text-xs text-slate-500">Site
            <select aria-label="Active site" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900" value={activeSiteId} onChange={(event) => {
              const site = normalizeSiteId(event.target.value);
              if ((PLATFORM_SITE_IDS as readonly string[]).includes(site)) onSiteChange(site);
            }}>{PLATFORM_SITE_IDS.map((id) => <option key={id} value={id}>{SITE_LABELS[id]}</option>)}</select>
          </label>
          <label className="block text-xs text-slate-500">Technician
            <select aria-label="Technician" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900" value={technicianId} onChange={(event) => onTechnicianChange(event.target.value)}>
              {!technicianId && <option value="">Select technician</option>}
              {technicians.map((item) => {
                const profile = profiles.find((entry) => entry.linkedCraftpersonId === item.id);
                return <option key={item.id} value={item.id}>{item.Name} {item.LastName.charAt(0)}. {"\u00b7"} {profile?.primaryRole ?? "Technician"}</option>;
              })}
            </select>
          </label>
          <p className="text-xs text-slate-500">VPA trades: {vpaTrades.join(", ") || "None"}</p>
        </div>
        <div className="space-y-2 border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${isOffline ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
              {isOffline ? `Offline${pendingCount > 0 ? ` \u00b7 ${pendingCount} queued` : ""}` : pendingCount > 0 ? `Online \u00b7 ${pendingCount} queued` : "Online"}
            </span>
            <button type="button" onClick={() => void sync()} disabled={syncing || isSimulatedOffline} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              <span className={syncing ? "inline-block animate-spin" : ""}>{"\u21bb"}</span> Sync Now
            </button>
          </div>
          <p className="text-xs text-slate-500">{lastSync ? `Last synced ${formatDateTimeDDMMYYYY(lastSync)}` : "Not synced yet"}</p>
          {pendingCount > 0 && <button type="button" onClick={() => void clearPending()} disabled={clearing || syncing}
            className="rounded border border-rose-300 px-2 py-1 text-[11px] font-medium text-rose-800 disabled:opacity-50">
            {clearing ? "Clearing…" : "Clear pending queue"}
          </button>}
          <label className="flex items-center justify-between text-xs text-slate-700">
            Simulate Offline
            <input type="checkbox" checked={isSimulatedOffline} onChange={(event) => onToggleOffline(event.target.checked)} className="h-4 w-4" />
          </label>
        </div>
        <nav className="flex-1 p-2">
          {items.map(([view, label]) => (
            <button key={view} type="button" onClick={() => onNavigate(view)} aria-current={currentView === view ? "page" : undefined}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm ${currentView === view ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-800 hover:bg-slate-50"}`}>
              {label}
              {view === "timers" && timerCount > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-xs text-white">{timerCount}</span>}
            </button>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t p-4 text-[11px] text-slate-500">
          <span>CAFM Mobile {"\u00b7"} {version}</span>
          <button type="button" className="underline" onClick={() => void forceReload()}>{"\u21bb"} Force App Reload</button>
        </div>
      </aside>
      <button type="button" aria-label="Close menu" className="h-full flex-1 bg-slate-900/50" onClick={onClose} />
    </div>
  );
};

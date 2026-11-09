import React, { useEffect, useState } from "react";
import type { SiteId, UserAccessProfile } from "@cafm/shared-schema";
import type { SyncStatus } from "../lib/offline-engine";
import { notify } from "../lib/toast";

interface MobileHeaderProps {
  activeSiteId: SiteId;
  onSiteChange?: (site: SiteId) => void;
  onSyncNow?: () => Promise<SyncStatus>;
  isSimulatedOffline?: boolean;
  isOffline: boolean;
  pendingCount: number;
  technicianId: string;
  technicians: Array<{ id: string; Name: string; LastName: string; Trade: string }>;
  vpaTrades?: readonly string[];
  profiles: UserAccessProfile[];
  onTechnicianChange: (id: string) => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ activeSiteId, onSiteChange, onSyncNow, isSimulatedOffline, isOffline, pendingCount, technicianId, technicians, profiles, onTechnicianChange }) => {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>();
  const [picker, setPicker] = useState(false);
  useEffect(() => {
    const synced = () => setLastSync(new Date());
    window.addEventListener("cafm-sync-success", synced);
    return () => window.removeEventListener("cafm-sync-success", synced);
  }, []);
  const person = technicians.find((item) => item.id === technicianId);
  const sync = async () => {
    setSyncing(true);
    try {
      if (!onSyncNow) throw new Error("Synchronization is not available.");
      await onSyncNow();
      setLastSync(new Date());
    } catch (error) {
      notify(error instanceof Error ? error.message : "Synchronization failed.");
    } finally { setSyncing(false); }
  };
  return <>
    <header className="relative z-40 flex h-14 shrink-0 items-center justify-between gap-1 bg-slate-900 px-3 text-white shadow-sm">
      <select aria-label="Active site" className="min-w-0 rounded-full bg-slate-700 px-2 py-2 text-xs" value={activeSiteId} onChange={(event) => {
        const site = event.target.value;
        if (site === "SITE-01" || site === "SITE-02" || site === "SITE-03") onSiteChange?.(site);
      }}><option>SITE-01</option><option>SITE-02</option><option>SITE-03</option></select>
      <button className="min-w-0 truncate rounded-full bg-slate-700 px-2 py-2 text-xs" onClick={() => setPicker(true)}>👤 {person ? `${person.Name} ${person.LastName.charAt(0)}.` : "Select technician"} ▾</button>
      <span className="whitespace-nowrap text-xs" title={isOffline ? "Offline" : "Online"}>{isOffline ? "🟠" : "🟢"}{pendingCount > 0 ? ` ${pendingCount}` : ""}</span>
      <button className="whitespace-nowrap rounded-full bg-blue-600 px-3 py-2 text-xs disabled:opacity-50" onClick={() => void sync()} disabled={syncing || isSimulatedOffline} title={lastSync ? `Synced ${lastSync.toLocaleTimeString()}` : "Sync now"}><span className={syncing ? "inline-block animate-spin" : ""}>↻</span> Sync</button>
    </header>
    {picker && <div className="fixed inset-0 z-[90] flex items-end bg-slate-900/50" onClick={() => setPicker(false)}><div role="dialog" aria-modal="true" aria-label="Select technician" className="max-h-[70vh] w-full overflow-auto rounded-t-2xl bg-white p-4 pb-8" onClick={(event) => event.stopPropagation()}><div className="flex justify-between"><strong>Technician</strong><button onClick={() => setPicker(false)}>Close</button></div>{technicians.map((item) => { const profile = profiles.find((entry) => entry.linkedCraftpersonId === item.id); return <button key={item.id} className="block w-full border-b py-3 text-left" onClick={() => { onTechnicianChange(item.id); setPicker(false); }}><strong>{item.Name} {item.LastName}</strong><span className="block text-xs text-slate-500">{profile?.primaryRole ?? "Technician"} · {profile?.vpaTrades.join(", ") || item.Trade}</span></button>; })}</div></div>}
  </>;
};

import React, { useState } from "react";
import { formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import type { SiteId } from "@cafm/shared-schema";
import { clearEquipmentDetailCache, EQ_DETAIL_MAX_ITEMS, getEquipmentCacheCount } from "../lib/equipment-details";

type ViewMode = "card" | "compact" | "calendar";

interface ProfileSettingsProps {
  technicianName: string;
  technicianId: string;
  technicians: Array<{ id: string; Name: string; LastName: string }>;
  siteId: SiteId;
  role: string;
  vpaTrades: readonly string[];
  onSiteChange: (site: SiteId) => void;
  onTechnicianChange: (id: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  phoneFrame: boolean;
  onPhoneFrameChange: (value: boolean) => void;
  offline: boolean;
  simulatedOffline: boolean;
  onToggleOffline: (offline: boolean) => void;
  pendingCount: number;
  lastSync?: Date;
  onSync: () => Promise<unknown>;
  submittedUpdates: number;
  onShare: () => void;
  apiBase: string;
  onApiBaseChange: (value: string) => void;
  onSaveApiBase: () => void;
  settingsError: string;
  version: string;
}

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const heading = "mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500";
const select = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900";

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";

export function ProfileSettings(props: ProfileSettingsProps) {
  const [cached, setCached] = useState(getEquipmentCacheCount);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const wide = typeof window !== "undefined" && window.innerWidth >= 768;
  const sync = () => {
    setSyncing(true); setSyncError("");
    props.onSync().catch((error: unknown) => setSyncError(error instanceof Error ? error.message : "Synchronization failed.")).finally(() => setSyncing(false));
  };
  const modeButton = (mode: ViewMode, label: string, icon: string) => <button type="button" aria-pressed={props.viewMode === mode} onClick={() => props.onViewModeChange(mode)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium ${props.viewMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}><Icon d={icon} />{label}</button>;
  const forceReload = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.map((reg) => reg.unregister()));
      if ("caches" in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    } finally { window.location.reload(); }
  };

  return <section className="space-y-3 p-3 pb-32">
    <div className={card}>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-bold text-white" aria-hidden="true">{initialsOf(props.technicianName)}</div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{props.technicianName || "Select technician"}</p>
          <p className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{props.role} · {props.siteId}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-500">Site
          <select aria-label="Site" className={select} value={props.siteId} onChange={(event) => props.onSiteChange(event.target.value as SiteId)}><option>SITE-01</option><option>SITE-02</option><option>SITE-03</option></select>
        </label>
        <label className="text-xs text-slate-500">Technician
          <select aria-label="Technician" className={select} value={props.technicianId} onChange={(event) => props.onTechnicianChange(event.target.value)}>
            {props.technicians.map((item) => <option key={item.id} value={item.id}>{item.Name} {item.LastName}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="VPA trades">
        {props.vpaTrades.length ? props.vpaTrades.map((trade) => <span key={trade} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800">{trade}</span>) : <span className="text-xs text-slate-500">No VPA trades</span>}
      </div>
    </div>

    <div className={card}>
      <h2 className={heading}><Icon d="M4 6h16M4 12h16M4 18h16" />Display Preferences</h2>
      <p className="mb-1.5 text-sm font-medium text-slate-800">WR Overview Layout</p>
      <div role="group" aria-label="WR Overview Layout" className="flex gap-0.5 rounded-xl bg-slate-100 p-0.5">
        {modeButton("card", "Card View", "M4 5h16v6H4z M4 14h16v5H4z")}
        {modeButton("compact", "Compact View", "M4 6h16 M4 10h16 M4 14h16 M4 18h16")}
        {modeButton("calendar", "Calendar", "M5 5h14v15H5z M5 10h14 M9 3v4 M15 3v4")}
      </div>
      {wide && <div className="mt-3 flex items-center justify-between text-sm text-slate-800"><span>Desktop layout</span>
        <div role="group" aria-label="Desktop layout" className="flex gap-0.5 rounded-xl bg-slate-100 p-0.5">
          <button type="button" aria-pressed={props.phoneFrame} onClick={() => props.onPhoneFrameChange(true)} className={`rounded-lg px-3 py-1 text-xs font-medium ${props.phoneFrame ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>Phone Frame</button>
          <button type="button" aria-pressed={!props.phoneFrame} onClick={() => props.onPhoneFrameChange(false)} className={`rounded-lg px-3 py-1 text-xs font-medium ${!props.phoneFrame ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>Full Width</button>
        </div></div>}
    </div>

    <div className={card}>
      <h2 className={heading}><Icon d="M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5" />Sync &amp; Offline Mode</h2>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900"><span className={`h-2 w-2 rounded-full ${props.offline ? "bg-amber-500" : "bg-emerald-500"}`} />{props.offline ? "Offline" : "Online"}{props.pendingCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{props.pendingCount} queued</span>}</p>
          <p className="text-xs text-slate-500">{props.lastSync ? `Last synced ${formatDateTimeDDMMYYYY(props.lastSync)}` : "Not synced yet"}</p>
        </div>
        <button type="button" disabled={syncing} onClick={sync} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{syncing ? "Syncing…" : "↻ Sync Now"}</button>
      </div>
      {syncError && <p role="alert" className="mt-2 text-xs text-rose-700">{syncError}</p>}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <div><p className="text-sm text-slate-900" id="sim-offline-label">Simulate Offline Mode</p><p className="text-xs text-slate-500">Work on device only until switched off</p></div>
        <button type="button" role="switch" aria-checked={props.simulatedOffline} aria-labelledby="sim-offline-label" onClick={() => props.onToggleOffline(!props.simulatedOffline)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${props.simulatedOffline ? "bg-blue-600" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${props.simulatedOffline ? "left-[22px]" : "left-0.5"}`} /></button>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
        <div><p className="text-slate-900">Offline equipment details</p><p className="text-xs text-slate-500">{cached} / {EQ_DETAIL_MAX_ITEMS} assets cached</p></div>
        <button type="button" disabled={cached === 0} onClick={() => { clearEquipmentDetailCache(); setCached(getEquipmentCacheCount()); }} className="text-sm font-medium text-blue-700 underline disabled:text-slate-400 disabled:no-underline">Clear</button>
      </div>
    </div>

    <div className={card}>
      <h2 className={heading}><Icon d="M12 3a4 4 0 0 0-4 4v3H6v11h12V10h-2V7a4 4 0 0 0-4-4z" />Field Activity &amp; Mobile Access</h2>
      <p className="mb-2 text-sm text-slate-800">{props.submittedUpdates} submitted field update{props.submittedUpdates === 1 ? "" : "s"}</p>
      <button type="button" onClick={props.onShare} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 hover:bg-slate-50"><span>Share / Open on Phone (QR &amp; URL)</span><Icon d="M9 6l6 6-6 6" /></button>
    </div>

    <details className={card}>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">Advanced &amp; Diagnostics</summary>
      <div className="mt-3 space-y-3">
        <label className="block text-xs text-slate-500">API base URL (blank uses same origin)
          <input className={select} value={props.apiBase} onChange={(event) => props.onApiBaseChange(event.target.value)} placeholder="https://example.com" />
        </label>
        {props.settingsError && <p role="alert" className="text-xs text-rose-700">{props.settingsError}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={props.onSaveApiBase} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">Save API base</button>
          <button type="button" onClick={() => void forceReload()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">↻ Force App Reload</button>
        </div>
        <p className="text-xs text-slate-500">Offline refresh requires a previously installed production build over HTTPS or localhost.</p>
        <p className="text-center text-[11px] text-slate-400">CAFM Mobile · {props.version}</p>
      </div>
    </details>
  </section>;
}

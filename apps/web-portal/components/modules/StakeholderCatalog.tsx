"use client";

import { useState } from "react";
import { COORDINATION_CATEGORIES } from "@cafm/shared-schema";
import type { SiteCoordinationRequirement, SiteStakeholderTeam } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { TeamBadge } from "@/components/modules/PmCoordinationWorkspace";

const field = "rounded border px-2 py-1 text-sm";
type Category = (typeof COORDINATION_CATEGORIES)[number];
const blankTeam = { id: "", code: "", name: "", color: "#2563eb", contactInfo: "", defaultLeadDays: 7, requiresApproval: true };
const blankReq = { id: "", code: "", name: "", category: "Communication" as Category, color: "#0891b2", defaultLeadDays: 5, mandatoryBeforeStart: true, templateText: "" };

export function StakeholderCatalogSection() {
  const { data, setData } = useCafmStore();
  const { profile } = useActiveUserPermissions();
  const { activeSiteId } = useSiteContext();
  const canEdit = !!(profile?.isSiteAdmin || profile?.isSuperAdmin);
  const teams = (data.stakeholderTeams ?? []).filter((item) => item.siteId === activeSiteId);
  const requirements = (data.coordinationRequirements ?? []).filter((item) => item.siteId === activeSiteId);
  const [team, setTeam] = useState(blankTeam);
  const [req, setReq] = useState(blankReq);
  const [error, setError] = useState("");
  const now = () => new Date().toISOString();

  const saveTeam = () => {
    const code = team.code.trim(), name = team.name.trim();
    if (!code || !name) { setError("A team needs a short code and a name."); return; }
    if (teams.some((item) => item.id !== team.id && item.code.toLowerCase() === code.toLowerCase())) { setError("That team code already exists on this site."); return; }
    setError("");
    const record: SiteStakeholderTeam = {
      id: team.id || `TEAM-${activeSiteId}-${Date.now().toString(36)}`, siteId: activeSiteId, code, name, color: team.color,
      contactInfo: team.contactInfo.trim() || undefined, defaultLeadDays: Math.max(0, Math.round(team.defaultLeadDays) || 0), requiresApproval: team.requiresApproval,
      active: teams.find((item) => item.id === team.id)?.active ?? true, description: teams.find((item) => item.id === team.id)?.description, updatedAt: now(),
    };
    setData((current) => ({ ...current, stakeholderTeams: [...(current.stakeholderTeams ?? []).filter((item) => item.id !== record.id), record] }));
    setTeam(blankTeam);
  };
  const saveReq = () => {
    const code = req.code.trim(), name = req.name.trim();
    if (!code || !name) { setError("A notice needs a short code and a name."); return; }
    if (requirements.some((item) => item.id !== req.id && item.code.toLowerCase() === code.toLowerCase())) { setError("That notice code already exists on this site."); return; }
    setError("");
    const record: SiteCoordinationRequirement = {
      id: req.id || `REQ-${activeSiteId}-${Date.now().toString(36)}`, siteId: activeSiteId, code, name, category: req.category, color: req.color,
      defaultLeadDays: Math.max(0, Math.round(req.defaultLeadDays) || 0), mandatoryBeforeStart: req.mandatoryBeforeStart, templateText: req.templateText.trim() || undefined,
      active: requirements.find((item) => item.id === req.id)?.active ?? true, updatedAt: now(),
    };
    setData((current) => ({ ...current, coordinationRequirements: [...(current.coordinationRequirements ?? []).filter((item) => item.id !== record.id), record] }));
    setReq(blankReq);
  };
  const toggleTeam = (item: SiteStakeholderTeam) => setData((current) => ({ ...current, stakeholderTeams: (current.stakeholderTeams ?? []).map((entry) => entry.id === item.id ? { ...entry, active: !entry.active, updatedAt: now() } : entry) }));
  const toggleReq = (item: SiteCoordinationRequirement) => setData((current) => ({ ...current, coordinationRequirements: (current.coordinationRequirements ?? []).map((entry) => entry.id === item.id ? { ...entry, active: !entry.active, updatedAt: now() } : entry) }));

  return <section className="space-y-4 rounded border bg-white p-4" aria-label="Stakeholder Teams and Operational Notices">
    <div><h2 className="text-lg font-bold">Stakeholder Teams &amp; Operational Notices</h2>
      <p className="text-sm text-slate-600">Site catalog of teams affected by planned maintenance and notices (e.g. Newsflash) used by SmartPM and the Team Alignment Hub. {canEdit ? "" : "View only — Site Admin or Super Admin can edit."}</p></div>
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-800">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <h3 className="font-semibold">Teams ({teams.length})</h3>
        <ul className="space-y-1">{teams.map((item) => <li key={item.id} className={`flex flex-wrap items-center gap-2 rounded border p-2 ${item.active ? "" : "opacity-50"}`}>
          <TeamBadge item={item} /><span className="font-medium">{item.name}</span><span className="text-xs text-slate-500">{item.defaultLeadDays}d lead{item.requiresApproval ? " · approval" : ""}{item.contactInfo ? ` · ${item.contactInfo}` : ""}</span>
          {canEdit && <span className="ml-auto flex gap-1"><button type="button" className="rounded border px-2 text-xs" onClick={() => setTeam({ id: item.id, code: item.code, name: item.name, color: item.color, contactInfo: item.contactInfo ?? "", defaultLeadDays: item.defaultLeadDays, requiresApproval: item.requiresApproval })}>Edit</button><button type="button" className="rounded border px-2 text-xs" onClick={() => toggleTeam(item)}>{item.active ? "Deactivate" : "Activate"}</button></span>}
        </li>)}</ul>
        {canEdit && <div className="grid grid-cols-2 gap-2 rounded bg-slate-50 p-2">
          <input aria-label="Team name" className={field} placeholder="Name" value={team.name} onChange={(event) => setTeam({ ...team, name: event.target.value })} />
          <input aria-label="Team short code" className={field} placeholder="Short code" value={team.code} onChange={(event) => setTeam({ ...team, code: event.target.value })} />
          <label className="flex items-center gap-2 text-sm">Badge <input aria-label="Team badge color" type="color" value={team.color} onChange={(event) => setTeam({ ...team, color: event.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm">Lead days <input aria-label="Team default lead days" type="number" min={0} className={`${field} w-20`} value={team.defaultLeadDays} onChange={(event) => setTeam({ ...team, defaultLeadDays: Number(event.target.value) })} /></label>
          <input aria-label="Team contact role or email" className={`${field} col-span-2`} placeholder="Contact role / email" value={team.contactInfo} onChange={(event) => setTeam({ ...team, contactInfo: event.target.value })} />
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={team.requiresApproval} onChange={(event) => setTeam({ ...team, requiresApproval: event.target.checked })} /> Mandatory approval before execution</label>
          <div className="col-span-2 flex gap-2"><button type="button" className="rounded bg-blue-700 px-3 py-1 text-white" onClick={saveTeam}>{team.id ? "Save Team" : "+ Add Team"}</button>{team.id && <button type="button" className="rounded border px-3 py-1" onClick={() => setTeam(blankTeam)}>Cancel</button>}</div>
        </div>}
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold">Operational Notices ({requirements.length})</h3>
        <ul className="space-y-1">{requirements.map((item) => <li key={item.id} className={`flex flex-wrap items-center gap-2 rounded border p-2 ${item.active ? "" : "opacity-50"}`}>
          <TeamBadge item={item} /><span className="font-medium">{item.name}</span><span className="text-xs text-slate-500">{item.category} · {item.defaultLeadDays}d lead{item.mandatoryBeforeStart ? " · mandatory" : ""}</span>
          {canEdit && <span className="ml-auto flex gap-1"><button type="button" className="rounded border px-2 text-xs" onClick={() => setReq({ id: item.id, code: item.code, name: item.name, category: item.category, color: item.color, defaultLeadDays: item.defaultLeadDays, mandatoryBeforeStart: item.mandatoryBeforeStart, templateText: item.templateText ?? "" })}>Edit</button><button type="button" className="rounded border px-2 text-xs" onClick={() => toggleReq(item)}>{item.active ? "Deactivate" : "Activate"}</button></span>}
        </li>)}</ul>
        {canEdit && <div className="grid grid-cols-2 gap-2 rounded bg-slate-50 p-2">
          <input aria-label="Notice name" className={field} placeholder="Name" value={req.name} onChange={(event) => setReq({ ...req, name: event.target.value })} />
          <input aria-label="Notice short code" className={field} placeholder="Short code" value={req.code} onChange={(event) => setReq({ ...req, code: event.target.value })} />
          <select aria-label="Notice category" className={field} value={req.category} onChange={(event) => setReq({ ...req, category: event.target.value as Category })}>{COORDINATION_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
          <label className="flex items-center gap-2 text-sm">Badge <input aria-label="Notice badge color" type="color" value={req.color} onChange={(event) => setReq({ ...req, color: event.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm">Lead days <input aria-label="Notice default lead days" type="number" min={0} className={`${field} w-20`} value={req.defaultLeadDays} onChange={(event) => setReq({ ...req, defaultLeadDays: Number(event.target.value) })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={req.mandatoryBeforeStart} onChange={(event) => setReq({ ...req, mandatoryBeforeStart: event.target.checked })} /> Mandatory before execution</label>
          <textarea aria-label="Notice message template" className={`${field} col-span-2`} rows={4} placeholder="Default message template — use {date} {location} {asset} {impact} {teams}" value={req.templateText} onChange={(event) => setReq({ ...req, templateText: event.target.value })} />
          <div className="col-span-2 flex gap-2"><button type="button" className="rounded bg-blue-700 px-3 py-1 text-white" onClick={saveReq}>{req.id ? "Save Notice" : "+ Add Notice"}</button>{req.id && <button type="button" className="rounded border px-3 py-1" onClick={() => setReq(blankReq)}>Cancel</button>}</div>
        </div>}
      </div>
    </div>
  </section>;
}

export function StakeholderCatalogButton({ className = "rounded border px-3 py-1" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={className} onClick={() => setOpen(true)}>⚙ Configure Teams &amp; Notices</button>
    {open && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex justify-end"><button type="button" className="rounded border px-3 py-1" onClick={() => setOpen(false)}>Close</button></div>
        <StakeholderCatalogSection />
      </div>
    </div>}
  </>;
}

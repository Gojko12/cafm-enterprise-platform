"use client";

import React, { useMemo, useState } from "react";
import type { CifmPerson, LJRole, SiteId } from "@cafm/shared-schema";
import { CLASSICAL_TRADES, PLATFORM_SITE_IDS, SITE_LABELS } from "@cafm/shared-schema";
import { stateRequest, useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { cifmUsername, withCifmDirectory } from "@/lib/cifm-people";
import { PEOPLE_DIRECTORY } from "@/lib/people-directory";

const SITES: SiteId[] = [...PLATFORM_SITE_IDS];
const LJ_ROLE_CODES: LJRole[] = ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_CCM", "ESA_DO", "ESA_IM", "TRADE_CM", "TRADE_TM"];
const FM_ROLES: [string, string][] = [
  ["Helpdesk", "Helpdesk"], ["HELPDESK", "Helpdesk"], ["Craftsperson", "Craftsperson"], ["TeamLeader", "Team Leader"], ["QAInspector", "QA Inspector"],
  ["PM_Planner", "Planner"], ["TechnicalOfficer", "Technical Officer"], ["SiteAdministrator", "Site Administrator"], ["SuperAdmin", "Super Admin"],
  ["ESA_TO", "ESA Technical Officer (ESA_TO)"], ["ESA_TM", "ESA Trade Manager (ESA_TM)"], ["ESA_CCM", "ESA Cost Centre Manager (ESA_CCM)"],
  ["ESA_LJM", "ESA Long Job Manager (ESA_LJM)"], ["ESA_DO", "Draftsman (ESA_DO)"], ["ESA_IM", "CIFM Inventory Admin (ESA_IM)"],
  ["TRADE_TM", "Trade Manager (TRADE_TM)"], ["TRADE_CM", "Trade Contract Manager (TRADE_CM)"],
];
const roleLabel = (role?: string) => FM_ROLES.find(([value]) => value === role)?.[1] ?? role ?? "FM User";
const isSuperAdminPerson = (person: CifmPerson) => PEOPLE_DIRECTORY.some((entry) => entry.superAdmin && entry.username === (person.username ?? cifmUsername(person.displayName)));

export function usePeopleDirectory() {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { profile } = useActiveUserPermissions();
  const people = data.cifmPeople ?? [];
  const canEdit = !!(profile?.isSuperAdmin || profile?.isSiteAdmin);
  const isSuperAdmin = !!profile?.isSuperAdmin;
  const [notice, setNotice] = useState("");

  const commit = (change: (current: CifmPerson[]) => CifmPerson[], syncTrades?: CifmPerson) => {
    const latest = change(people);
    setData((current) => {
      const next = withCifmDirectory({ ...current, cifmPeople: change(current.cifmPeople ?? []) });
      if (!syncTrades) return next;
      const username = syncTrades.username ?? cifmUsername(syncTrades.displayName);
      return { ...next, userAccessProfiles: next.userAccessProfiles.map((item) => item.siteId === activeSiteId &&
        (item.username === username || item.fullName === syncTrades.displayName) ? { ...item, vpaTrades: CLASSICAL_TRADES.filter((trade) => (syncTrades.tradeAccess ?? []).includes(trade)) } : item) };
    });
    // Best effort: other sites keep their own saved state, so replicate the master directory there.
    void Promise.allSettled(SITES.filter((site) => site !== activeSiteId).map(async (site) => {
      const result = await stateRequest(site, activePerson, "GET");
      if (!result.state || typeof result.state !== "object") return;
      await stateRequest(site, activePerson, "POST", { revision: result.revision, state: { ...(result.state as Record<string, unknown>), cifmPeople: latest } });
    })).then((results) => setNotice(results.some((item) => item.status === "rejected") ? "Saved here. Some other sites could not be updated yet and will pick up the change when opened by an administrator." : ""));
  };
  return { data, people, canEdit, isSuperAdmin, commit, notice, activeSiteId };
}

const input = "mt-1 w-full rounded border px-2 py-1.5 text-sm";
const blank = (site: SiteId): CifmPerson => ({
  id: "", employeeCode: "", displayName: "", email: "", phone: "", departmentTeam: "", stationedSiteId: site,
  stationedBuildingId: "", stationedFloorId: "", stationedRoomId: "", isFmStaff: false,
});

export function CifmDirectoryTab({ onGrantFm }: { onGrantFm: (person: CifmPerson) => void }) {
  const { data, people, canEdit, commit, notice, activeSiteId } = usePeopleDirectory();
  const [site, setSite] = useState<SiteId | "All">("All");
  const [type, setType] = useState<"all" | "nonfm" | "fm">("all");
  const [team, setTeam] = useState("All");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CifmPerson | null>(null);
  const [error, setError] = useState("");
  const teams = useMemo(() => Array.from(new Set(people.map((item) => item.departmentTeam).filter(Boolean))).sort(), [people]);
  const rows = useMemo(() => people.filter((item) => {
    if (site !== "All" && item.stationedSiteId !== site) return false;
    if (type === "nonfm" && item.isFmStaff) return false;
    if (type === "fm" && !item.isFmStaff) return false;
    if (team !== "All" && item.departmentTeam !== team) return false;
    const query = search.trim().toLowerCase();
    return !query || [item.displayName, item.email, item.employeeCode, item.departmentTeam, item.stationedRoomId, item.stationedBuildingId].some((value) => value.toLowerCase().includes(query));
  }).sort((a, b) => a.displayName.localeCompare(b.displayName)), [people, site, type, team, search]);

  const save = () => {
    if (!editing) return;
    if (!editing.displayName.trim()) { setError("Employee name is required."); return; }
    const next: CifmPerson = { ...editing, displayName: editing.displayName.trim(), username: editing.username ?? cifmUsername(editing.displayName) };
    commit((current) => {
      if (next.id) return current.map((item) => item.id === next.id ? next : item);
      const nextNumber = current.reduce((max, item) => Math.max(max, Number(item.employeeCode.replace(/\D/g, "")) || 0), 2040) + 1;
      return [...current, { ...next, id: `cifm-${next.username}-${current.length + 1}`, employeeCode: next.employeeCode || `EMP-${String(nextNumber).padStart(5, "0")}` }];
    });
    setEditing(null); setError("");
  };

  return <section className="space-y-3">
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3">
      <label className="text-xs font-semibold text-slate-600">Site<select value={site} onChange={(event) => setSite(event.target.value as SiteId | "All")} className={input}>
        <option value="All">All Sites</option>{SITES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Type<select value={type} onChange={(event) => setType(event.target.value as typeof type)} className={input}>
        <option value="all">All CIFM People</option><option value="nonfm">Non-FM Employees (Requestors)</option><option value="fm">FM Staff &amp; Contractors</option></select></label>
      <label className="text-xs font-semibold text-slate-600">Team / Department<select value={team} onChange={(event) => setTeam(event.target.value)} className={input}>
        <option value="All">All Teams</option>{teams.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="min-w-[14rem] flex-1 text-xs font-semibold text-slate-600">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, code, room…" className={input} /></label>
      <button type="button" disabled={!canEdit} onClick={() => { setEditing(blank(activeSiteId)); setError(""); }} className="rounded bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">+ Add Employee</button>
    </div>
    <p className="text-xs text-slate-500">{rows.length} of {people.length} people{!canEdit ? " · read-only (Site Administrator or Super Admin required to edit)" : ""}</p>
    {notice && <p role="status" className="rounded bg-amber-50 p-2 text-xs text-amber-900">{notice}</p>}
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>
          {["Employee", "Stationed Location (Site · Building · Floor · Room)", "Team / Department", "Email & Phone", "Account Type", "Actions"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}
        </tr></thead>
        <tbody className="divide-y">
          {rows.map((person) => <tr key={person.id} className="hover:bg-slate-50">
            <td className="px-3 py-2"><div className="font-semibold">{person.displayName}</div><div className="text-xs text-slate-500">{person.employeeCode}</div></td>
            <td className="px-3 py-2 text-xs">{[person.stationedSiteId, person.stationedBuildingId, person.stationedFloorId, person.stationedRoomId].filter(Boolean).join(" · ")}</td>
            <td className="px-3 py-2">{person.departmentTeam}</td>
            <td className="px-3 py-2 text-xs"><div>{person.email}</div><div className="text-slate-500">{person.phone}</div></td>
            <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${person.isFmStaff ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>
              {person.isFmStaff ? `FM User · ${roleLabel(person.systemRole)}` : "CIFM Employee (Non-FM)"}</span></td>
            <td className="space-x-3 px-3 py-2 text-xs">
              <button type="button" disabled={!canEdit} onClick={() => { setEditing(person); setError(""); }} className="font-medium text-blue-700 hover:underline disabled:opacity-40">Edit</button>
              <button type="button" disabled={!canEdit} onClick={() => onGrantFm(person)} className="font-medium text-emerald-700 hover:underline disabled:opacity-40">{person.isFmStaff ? "Edit FM Access" : "Grant FM Access"}</button>
            </td>
          </tr>)}
          {!rows.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">No people match these filters.</td></tr>}
        </tbody>
      </table>
    </div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-xl space-y-3 rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold">{editing.id ? "Edit Employee" : "Add Employee"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Full name *<input className={input} value={editing.displayName} onChange={(event) => setEditing({ ...editing, displayName: event.target.value })} /></label>
          <label className="text-xs font-semibold">Team / Department<input className={input} value={editing.departmentTeam} onChange={(event) => setEditing({ ...editing, departmentTeam: event.target.value })} /></label>
          <label className="text-xs font-semibold">Email<input className={input} value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></label>
          <label className="text-xs font-semibold">Phone<input className={input} value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} /></label>
          <label className="text-xs font-semibold">Stationed site<select className={input} value={editing.stationedSiteId} onChange={(event) => setEditing({ ...editing, stationedSiteId: event.target.value })}>{SITES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold">Building<input list="cifm-buildings" className={input} value={editing.stationedBuildingId} onChange={(event) => setEditing({ ...editing, stationedBuildingId: event.target.value })} /></label>
          <label className="text-xs font-semibold">Floor<input list="cifm-floors" className={input} value={editing.stationedFloorId} onChange={(event) => setEditing({ ...editing, stationedFloorId: event.target.value })} /></label>
          <label className="text-xs font-semibold">Room<input list="cifm-rooms" className={input} value={editing.stationedRoomId} onChange={(event) => {
            const room = data.rooms.find((item) => item.SiteId === editing.stationedSiteId && item.RoomCode === event.target.value);
            setEditing({ ...editing, stationedRoomId: event.target.value, ...(room ? { stationedBuildingId: room.bl_id, stationedFloorId: room.LevelName } : {}) });
          }} /></label>
        </div>
        <datalist id="cifm-buildings">{data.buildings.filter((item) => item.SiteId === editing.stationedSiteId).map((item) => <option key={item.bl_id} value={item.bl_id} />)}</datalist>
        <datalist id="cifm-floors">{Array.from(new Set(data.floors.filter((item) => item.SiteId === editing.stationedSiteId).map((item) => item.LevelName))).map((item) => <option key={item} value={item} />)}</datalist>
        <datalist id="cifm-rooms">{data.rooms.filter((item) => item.SiteId === editing.stationedSiteId).map((item) => <option key={item.RoomCode} value={item.RoomCode} />)}</datalist>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded border px-4 py-2 text-sm">Cancel</button>
          <button type="button" onClick={save} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Save</button></div>
      </div>
    </div>}
  </section>;
}

function Checks<T extends string>({ label, options, value, onChange, disabled }: { label: string; options: T[]; value: T[]; onChange: (next: T[]) => void; disabled?: boolean }) {
  return <fieldset className="text-xs"><legend className="font-semibold">{label}</legend>
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{options.map((option) => <label key={option} className="flex items-center gap-1">
      <input type="checkbox" disabled={disabled} checked={value.includes(option)} onChange={(event) => onChange(event.target.checked ? [...value, option] : value.filter((item) => item !== option))} />{option}</label>)}</div></fieldset>;
}

export function FmAccessModal({ person, onClose }: { person: CifmPerson; onClose: () => void }) {
  const { commit, isSuperAdmin } = usePeopleDirectory();
  const [draft, setDraft] = useState<CifmPerson>({
    ...person, isFmStaff: true, systemRole: person.systemRole ?? "Craftsperson", assignedSiteIds: person.assignedSiteIds ?? [person.stationedSiteId],
    siteAdminSiteIds: person.siteAdminSiteIds ?? [], tradeAccess: person.tradeAccess ?? [], auditTrades: person.auditTrades ?? [], ljRoles: person.ljRoles ?? [],
  });
  const roleOptions = FM_ROLES.some(([value]) => value === draft.systemRole) ? FM_ROLES : [...FM_ROLES, [draft.systemRole ?? "", roleLabel(draft.systemRole)] as [string, string]];
  const save = () => {
    const sites = Array.from(new Set([...(draft.assignedSiteIds ?? []), ...(draft.siteAdminSiteIds ?? [])]));
    const next = { ...draft, username: draft.username ?? cifmUsername(draft.displayName), assignedSiteIds: sites };
    commit((current) => current.map((item) => item.id === next.id ? next : item), next);
    onClose();
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
    <div className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
      <h3 className="text-lg font-bold">Edit FM Role &amp; Trades — {draft.displayName}</h3>
      <label className="block text-xs font-semibold">FM system role<select className={input} value={draft.systemRole} onChange={(event) => setDraft({ ...draft, systemRole: event.target.value })}>
        {roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <Checks label="Site access" options={SITES} value={(draft.assignedSiteIds ?? []) as SiteId[]} onChange={(next) => setDraft({ ...draft, assignedSiteIds: next })} />
      <Checks label={isSuperAdmin ? "Site Administrator of" : "Site Administrator of (Super Admin only)"} options={SITES} value={(draft.siteAdminSiteIds ?? []) as SiteId[]} disabled={!isSuperAdmin} onChange={(next) => setDraft({ ...draft, siteAdminSiteIds: next })} />
      <Checks label="Trade access" options={[...CLASSICAL_TRADES] as string[]} value={draft.tradeAccess ?? []} onChange={(next) => setDraft({ ...draft, tradeAccess: next })} />
      <Checks label="Audit trades" options={[...CLASSICAL_TRADES] as string[]} value={draft.auditTrades ?? []} onChange={(next) => setDraft({ ...draft, auditTrades: next })} />
      <Checks label="Long Job roles" options={LJ_ROLE_CODES as string[]} value={draft.ljRoles ?? []} onChange={(next) => setDraft({ ...draft, ljRoles: next })} />
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded border px-4 py-2 text-sm">Cancel</button>
        <button type="button" onClick={save} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Save FM Access</button></div>
    </div>
  </div>;
}

export function SiteAdminCards() {
  const { people, isSuperAdmin, commit } = usePeopleDirectory();
  const [pick, setPick] = useState<Partial<Record<SiteId, string>>>({});
  const fm = people.filter((item) => item.isFmStaff);
  const setAdmin = (site: SiteId, person: CifmPerson, grant: boolean) => commit((current) => current.map((item) => item.id !== person.id ? item : {
    ...item,
    siteAdminSiteIds: grant ? Array.from(new Set([...(item.siteAdminSiteIds ?? []), site])) : (item.siteAdminSiteIds ?? []).filter((entry) => entry !== site),
    assignedSiteIds: grant ? Array.from(new Set([...(item.assignedSiteIds ?? []), site])) : item.assignedSiteIds,
  }));
  return <section className="space-y-2 rounded-lg border bg-white p-4">
    <h2 className="font-bold">👑 Multi-Site Administrators</h2>
    {!isSuperAdmin && <p className="text-xs text-slate-500">Read-only: only a Super Admin can assign or revoke Site Administrators.</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {SITES.map((site) => {
        const admins = fm.filter((item) => (item.siteAdminSiteIds ?? []).includes(site));
        const candidates = fm.filter((item) => !(item.siteAdminSiteIds ?? []).includes(site));
        return <div key={site} className="space-y-2 rounded border p-3">
          <h3 className="text-sm font-bold">{SITE_LABELS[site]} · {site}</h3>
          <ul className="space-y-1 text-sm">{admins.map((item) => <li key={item.id} className="flex items-center justify-between gap-2">
            <span>{item.displayName}{isSuperAdminPerson(item) && <span className="ml-1 rounded bg-purple-100 px-1.5 text-[10px] font-semibold text-purple-800">Super Admin</span>}</span>
            {!isSuperAdminPerson(item) && <button type="button" disabled={!isSuperAdmin} onClick={() => setAdmin(site, item, false)} className="text-xs text-red-700 hover:underline disabled:opacity-40">Revoke</button>}
          </li>)}{!admins.length && <li className="text-xs text-slate-500">No Site Administrator assigned.</li>}</ul>
          <div className="flex gap-1">
            <select disabled={!isSuperAdmin} value={pick[site] ?? ""} onChange={(event) => setPick({ ...pick, [site]: event.target.value })} className="min-w-0 flex-1 rounded border px-2 py-1 text-xs">
              <option value="">Assign FM person…</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>
            <button type="button" disabled={!isSuperAdmin || !pick[site]} onClick={() => { const person = people.find((item) => item.id === pick[site]); if (person) { setAdmin(site, person, true); setPick({ ...pick, [site]: "" }); } }}
              className="rounded bg-blue-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40">Assign</button>
          </div>
        </div>;
      })}
    </div>
  </section>;
}

export function FmStaffTable({ onEdit }: { onEdit: (person: CifmPerson) => void }) {
  const { people, canEdit } = usePeopleDirectory();
  const [site, setSite] = useState<SiteId | "All">("All");
  const rows = people.filter((item) => item.isFmStaff && (site === "All" || (item.assignedSiteIds ?? []).includes(site))).sort((a, b) => a.displayName.localeCompare(b.displayName));
  return <section className="space-y-2">
    <label className="text-xs font-semibold text-slate-600">Site access filter <select value={site} onChange={(event) => setSite(event.target.value as SiteId | "All")} className="ml-2 rounded border px-2 py-1 text-sm">
      <option value="All">All Sites</option>{SITES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>{["FM Person", "FM System Role", "Site Access", "Trade Access", "Audit Trades", "Long Job Main/Deputy Roles", "Actions"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr></thead>
        <tbody className="divide-y">{rows.map((person) => <tr key={person.id} className="hover:bg-slate-50">
          <td className="px-3 py-2"><div className="font-semibold">{person.displayName}</div><div className="text-xs text-slate-500">{person.departmentTeam}</div></td>
          <td className="px-3 py-2">{roleLabel(person.systemRole)}</td>
          <td className="px-3 py-2 text-xs">{(person.assignedSiteIds ?? []).join(", ") || "—"}</td>
          <td className="px-3 py-2 text-xs">{(person.tradeAccess ?? []).join(", ") || "All / none set"}</td>
          <td className="px-3 py-2 text-xs">{(person.auditTrades ?? []).join(", ") || "—"}</td>
          <td className="px-3 py-2 text-xs">{(person.ljRoles ?? []).join(", ") || "—"}</td>
          <td className="px-3 py-2"><button type="button" disabled={!canEdit} onClick={() => onEdit(person)} className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-40">Edit FM Role &amp; Trades</button></td>
        </tr>)}{!rows.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">No FM staff for this site.</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

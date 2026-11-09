"use client";

import { useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { UserAccessProfile, UserGranularPermissions } from "@cafm/shared-schema";
import { useCafmStore, useActiveUserPermissions } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { DEFAULT_SITE_ADMIN_GOVERNANCE, permissionsForPreset } from "@/lib/access-profiles";
import type { AccessPreset } from "@/lib/access-profiles";

type Flag = { [K in keyof UserGranularPermissions]: UserGranularPermissions[K] extends boolean ? K : never }[keyof UserGranularPermissions];
const groups: Array<{ title: string; fields: Array<[Flag, string]> }> = [
  { title: "Work Requests & Field Execution", fields: [["canGeneratePM_WR", "Generate PM WR"], ["canOpenFollowUpFJ", "Open Follow-Up FJ"], ["canCreateFJ", "Create FJ"], ["canCreateLJ", "Create LJ"], ["canClaimUnassignedWR", "Claim Unassigned WRs"], ["canCompleteWR78", "Set WR to 78%"], ["canCloseWR100", "Close WR to 100%"]] },
  { title: "Checklists & SmartPM Engineering", fields: [["canDefineChecklistPM", "Define PM Checklist"], ["canDefineChecklistFJ", "Define FJ Checklist"], ["canDefineChecklistLJ", "Define LJ Checklist"], ["canDefinePMSchedule", "Define PM Schedule"], ["canAssignPMPToEQ", "Assign PMP to EQ"], ["canManageEquipment", "Manage Equipment"]] },
  { title: "Technical Audits", fields: [["canAuditChooseWRs", "Choose WRs for Audit"], ["canAuditDoInspection", "Do Inspection"], ["canAuditReopenWR", "Re-Open WR"], ["canManageFailureReasons", "Manage Failure Reasons"]] },
  { title: "Scheduling & Workforce", fields: [["canScheduleCraftperson", "Schedule Craftperson"], ["canOverwriteLaborTime", "Overwrite Working Time"], ["canManageShiftsAndLeaves", "Manage Shifts and Leaves"], ["canManageLocationFreezes", "Manage Location Freezes"]] },
];
const presets: Array<[AccessPreset, string]> = [["Craftperson", "Craftperson"], ["TeamLeader", "Team Leader"], ["QAInspector", "QA Inspector"], ["PMEngineer", "PM Engineer"], ["FullAdmin", "Full Admin"]];
const PRIMARY_ROLES: readonly UserAccessProfile["primaryRole"][] = ["Craftperson", "TeamLeader", "QAInspector", "TechnicalOfficer", "SiteAdministrator", "SuperAdmin"];

export function UserAccessMatrix() {
  const { data, setData } = useCafmStore();
  const { profile } = useActiveUserPermissions();
  const { activeSiteId } = useSiteContext();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<UserAccessProfile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const superAdmin = profile?.isSuperAdmin === true && (profile.managedSiteIds ?? []).includes(activeSiteId);
  const editable = !profile?.isSiteAdmin || superAdmin || (!!profile.managedSiteIds?.includes(activeSiteId) && !!profile.siteAdminGovernance?.canManageUsersAndVPA);
  const isAdmin = (item: UserAccessProfile) => item.isSuperAdmin || item.isSiteAdmin || item.primaryRole === "SuperAdmin" || item.primaryRole === "SiteAdministrator";
  const profiles = data.userAccessProfiles.filter((item) => item.siteId === activeSiteId && `${item.personName} ${item.fullName}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = <T,>(values: T[], value: T): T[] => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const create = () => setDraft({ id: crypto.randomUUID(), siteId: activeSiteId, personName: "", fullName: "", primaryRole: "Craftperson", isCraftperson: true, isTeamLeader: false, isQAInspector: false, isSiteAdmin: false, vpaTrades: [], vpaBuildingIds: [], permissions: permissionsForPreset("Craftperson") });
  const save = () => {
    if (!editable || draft?.siteId !== activeSiteId) { setError("Permission required to manage users on this site."); return; }
    const saved = { ...draft, personName: draft.personName.trim(), fullName: draft.fullName.trim(), email: draft.email?.trim() || undefined };
    if (!saved.personName || !saved.fullName) { setError("Person name and full name are required."); return; }
    if (saved.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(saved.email)) { setError("Enter a valid email address."); return; }
    if (!PRIMARY_ROLES.includes(saved.primaryRole)) { setError("Select a valid primary role."); return; }
    if (!superAdmin && (isAdmin(saved) || data.userAccessProfiles.some((item) => item.id === saved.id && isAdmin(item)))) { setError("Only a Super Admin may manage administrator profiles."); return; }
    if (data.userAccessProfiles.some((item) => item.siteId === activeSiteId && item.id !== saved.id &&
      ([item.personName.toLowerCase(), item.fullName.toLowerCase()].some((name) => [saved.personName.toLowerCase(), saved.fullName.toLowerCase()].includes(name)) ||
        (!!saved.linkedCraftpersonId && item.linkedCraftpersonId === saved.linkedCraftpersonId)))) { setError("Person name or linked craftsperson is already assigned to a profile."); return; }
    if (!saved.isSiteAdmin && data.userAccessProfiles.some((item) => item.id === saved.id && item.siteId === activeSiteId && item.isSiteAdmin) &&
      !data.userAccessProfiles.some((item) => item.siteId === activeSiteId && item.id !== saved.id && item.isSiteAdmin)) { setError("The site must retain at least one administrator."); return; }
    if (!saved.isSuperAdmin && data.userAccessProfiles.some((item) => item.id === saved.id && item.siteId === activeSiteId && item.isSuperAdmin) &&
      !data.userAccessProfiles.some((item) => item.siteId === activeSiteId && item.id !== saved.id && item.isSuperAdmin)) { setError("The site must retain at least one Super Admin."); return; }
    if (saved.isSiteAdmin && !saved.isSuperAdmin && !saved.siteAdminGovernance) saved.siteAdminGovernance = { ...DEFAULT_SITE_ADMIN_GOVERNANCE };
    setData((current) => ({ ...current, userAccessProfiles: [...current.userAccessProfiles.filter((item) => item.id !== saved.id), saved] }));
    setError(""); setDraft(null); setNotice(`Saved access profile for ${saved.personName}.`);
  };
  return <section className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="text-xl font-bold">1. Users, VPA Trades &amp; Granular Capabilities Matrix</h2><button disabled={!editable} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" onClick={create}>+ Add User / Craftperson</button></div>
    {!editable && <p className="text-sm text-slate-600">Your site administrator governance does not permit user management on this site.</p>}
    {notice && <p role="status" className="rounded bg-green-100 p-2 text-green-800">{notice}</p>}
    <input aria-label="Search users" className="rounded border p-2" placeholder="Search users" value={query} onChange={(e) => setQuery(e.target.value)} />
    <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Person / Technician", "Roles", "VPA Trades", "Audit Trades", "Active capabilities", ""].map((label, index) => <th key={index} className="p-2">{label}</th>)}</tr></thead><tbody>{profiles.map((item) => <tr key={item.id} className="border-t"><td className="p-2">{item.fullName}</td><td>{[item.isSuperAdmin && "Super Admin", item.isTeamLeader && "TeamLeader", item.isCraftperson && "Craftperson", item.isQAInspector && "QA Inspector", item.isSiteAdmin && "Admin"].filter(Boolean).join(", ") || item.primaryRole}</td><td>{item.vpaTrades.map((trade) => <span key={trade} className="m-0.5 inline-block rounded bg-blue-100 px-1 text-blue-800">{trade}</span>)}</td><td>{item.permissions.auditTrades.join(", ") || "—"}</td><td>{groups.flatMap((group) => group.fields).filter(([key]) => item.permissions[key]).map(([, label]) => label).join(", ") || "None"}</td><td><button disabled={!editable || (!superAdmin && !!isAdmin(item))} className="text-blue-700 disabled:opacity-50" onClick={() => { setError(""); setDraft(item); }}>Edit</button></td></tr>)}</tbody></table></div>
    {draft && <div role="dialog" aria-modal="true" aria-label="Edit access profile" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"><div className="max-h-[90vh] w-full max-w-5xl space-y-4 overflow-y-auto rounded border bg-slate-50 p-4"><div className="flex items-center justify-between"><h3 className="font-bold">Edit access profile</h3><div><button className="rounded bg-blue-700 px-3 py-2 text-white" onClick={save}>Save User Profile</button>{" "}<button onClick={() => setDraft(null)}>Cancel</button></div></div>{error && <p role="alert" className="text-rose-700">{error}</p>}
      <div className="grid gap-2 md:grid-cols-3"><label>Person name<input className="block w-full rounded border p-2" value={draft.personName} onChange={(e) => setDraft({ ...draft, personName: e.target.value })} /></label><label>Full name<input className="block w-full rounded border p-2" value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} /></label><label>Email<input type="email" className="block w-full rounded border p-2" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value || undefined })} /></label><label>Linked craftsperson<select className="block w-full rounded border p-2" value={draft.linkedCraftpersonId ?? ""} onChange={(e) => setDraft({ ...draft, linkedCraftpersonId: e.target.value || undefined })}><option value="">None</option>{data.craftspeople.filter((item) => item.SiteId === activeSiteId).map((item) => <option key={item.id} value={item.id}>{item.Name} {item.LastName}</option>)}</select></label><label>Primary role<select className="block w-full rounded border p-2" value={draft.primaryRole} onChange={(e) => { const role = PRIMARY_ROLES.find((value) => value === e.target.value); if (role) setDraft({ ...draft, primaryRole: role, isSuperAdmin: role === "SuperAdmin", isSiteAdmin: role === "SiteAdministrator" || role === "SuperAdmin", managedSiteIds: role === "SuperAdmin" ? ["SITE-01", "SITE-02", "SITE-03"] : role === "SiteAdministrator" ? [activeSiteId] : [] }); }}>{PRIMARY_ROLES.map((role) => <option key={role} disabled={!superAdmin && (role === "SuperAdmin" || role === "SiteAdministrator")}>{role}</option>)}</select></label></div>
      <div className="flex flex-wrap gap-3">{(["isTeamLeader", "isCraftperson", "isQAInspector"] as const).map((key) => <label key={key}><input type="checkbox" checked={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} /> {key.slice(2)}</label>)}</div>
      <div className="flex flex-wrap gap-2">{presets.map(([preset, label]) => <button key={preset} disabled={!superAdmin && preset === "FullAdmin"} className="rounded border bg-white px-2 py-1 disabled:opacity-40" onClick={() => setDraft({ ...draft,
        primaryRole: preset === "FullAdmin" ? "SiteAdministrator" : preset === "PMEngineer" ? "TechnicalOfficer" : preset,
        isCraftperson: preset === "Craftperson", isTeamLeader: preset === "TeamLeader" || preset === "FullAdmin",
        isQAInspector: preset === "QAInspector" || preset === "FullAdmin", isSiteAdmin: preset === "FullAdmin", isSuperAdmin: false,
        managedSiteIds: preset === "FullAdmin" ? [activeSiteId] : [],
        permissions: permissionsForPreset(preset) })}>Apply {label} Preset</button>)}</div>
      <div><h4 className="font-semibold">VPA Trades</h4><div className="flex flex-wrap gap-2">{CLASSICAL_TRADES.map((trade) => <button key={trade} aria-pressed={draft.vpaTrades.includes(trade)} className={`rounded border px-2 py-1 ${draft.vpaTrades.includes(trade) ? "bg-blue-700 text-white" : "bg-white"}`} onClick={() => setDraft({ ...draft, vpaTrades: toggle(draft.vpaTrades, trade) })}>{trade}</button>)}<button onClick={() => setDraft({ ...draft, vpaTrades: [...CLASSICAL_TRADES] })}>Select All 7 Trades</button><button onClick={() => setDraft({ ...draft, vpaTrades: [] })}>Clear</button></div></div>
      <div><h4 className="font-semibold">Buildings (none selected = all)</h4>{data.buildings.filter((b) => b.SiteId === activeSiteId).map((b) => <label key={b.bl_id} className="mr-3"><input type="checkbox" checked={draft.vpaBuildingIds.includes(b.bl_id)} onChange={() => setDraft({ ...draft, vpaBuildingIds: toggle(draft.vpaBuildingIds, b.bl_id) })} /> {b.bl_id}</label>)}</div>
      <div className="grid gap-3 lg:grid-cols-2">{groups.map((group) => <div key={group.title} className="space-y-2 rounded border bg-white p-3"><h4 className="font-semibold">{group.title}</h4>{group.title === "Technical Audits" && <><div>Audit Trades: {CLASSICAL_TRADES.map((trade) => <label key={trade} className="mr-2 inline-block"><input type="checkbox" checked={draft.permissions.auditTrades.includes(trade)} onChange={() => setDraft({ ...draft, permissions: { ...draft.permissions, auditTrades: toggle(draft.permissions.auditTrades, trade) } })} /> {trade}</label>)}</div><div>WR Types: {(["PM", "FJ"] as const).map((type) => <label key={type} className="mr-2"><input type="checkbox" checked={draft.permissions.auditWRTypes.includes(type)} onChange={() => setDraft({ ...draft, permissions: { ...draft.permissions, auditWRTypes: toggle(draft.permissions.auditWRTypes, type) } })} /> {type}</label>)}</div></>}{group.fields.map(([key, label]) => <label key={key} className="block"><input type="checkbox" checked={draft.permissions[key]} onChange={(e) => setDraft({ ...draft, permissions: { ...draft.permissions, [key]: e.target.checked } })} /> {label}</label>)}</div>)}</div>
      <button className="rounded bg-blue-700 px-3 py-2 text-white" onClick={save}>Save User Profile</button>{" "}<button onClick={() => setDraft(null)}>Cancel</button>
    </div></div>}
  </section>;
}

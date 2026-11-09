"use client";

import { useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { RoleDefinition, UserAccessProfile, UserGranularPermissions } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { assignRoles, isPersonProfile, permissionsForPreset, resolveEffectivePermissions } from "@/lib/access-profiles";

type Flag = { [K in keyof UserGranularPermissions]: UserGranularPermissions[K] extends boolean ? K : never }[keyof UserGranularPermissions];
const groups: Array<{ title: string; fields: Array<[Flag, string]> }> = [
  { title: "Work Requests & Execution", fields: [["canGeneratePM_WR", "Generate PM WR"], ["canOpenFollowUpFJ", "Open Follow-Up FJ"], ["canCreateFJ", "Create FJ"], ["canCreateLJ", "Create LJ"], ["canClaimUnassignedWR", "Claim WR"], ["canCompleteWR78", "Complete 78%"], ["canCloseWR100", "Close 100%"]] },
  { title: "Checklists & SmartPM", fields: [["canDefineChecklistPM", "Define PM Checklist"], ["canDefineChecklistFJ", "Define FJ Checklist"], ["canDefineChecklistLJ", "Define LJ Checklist"], ["canDefinePMSchedule", "Define PM Schedule"], ["canAssignPMPToEQ", "Assign PMP"], ["canManageEquipment", "Manage Equipment"]] },
  { title: "Technical Audits", fields: [["canAuditChooseWRs", "Choose WRs"], ["canAuditDoInspection", "Do Inspection"], ["canAuditReopenWR", "Reopen WR"], ["canManageFailureReasons", "Manage Failure Reasons"]] },
  { title: "Scheduling & Workforce", fields: [["canScheduleCraftperson", "Schedule Craftperson"], ["canOverwriteLaborTime", "Overwrite Labor Time"], ["canManageShiftsAndLeaves", "Manage Shifts and Leaves"], ["canManageLocationFreezes", "Manage Freezes"]] },
];
const colors: Record<RoleDefinition["badgeColor"], string> = { amber: "bg-amber-100 text-amber-900", purple: "bg-purple-100 text-purple-900", blue: "bg-blue-100 text-blue-900", emerald: "bg-emerald-100 text-emerald-900", cyan: "bg-cyan-100 text-cyan-900", slate: "bg-slate-100 text-slate-900", rose: "bg-rose-100 text-rose-900" };
const toggle = <T,>(values: T[], value: T): T[] => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
const protectedRole = (role: RoleDefinition) => role.baseRoleType === "SuperAdmin" || role.baseRoleType === "SiteAdministrator";
const privileged = (person: UserAccessProfile) => person.isSuperAdmin || person.isSiteAdmin || person.primaryRole === "SuperAdmin" || person.primaryRole === "SiteAdministrator";

function Capabilities({ value, onChange }: { value: UserGranularPermissions; onChange?: (next: UserGranularPermissions) => void }) {
  return <div className="grid gap-3 lg:grid-cols-2">{groups.map((group) => <fieldset key={group.title} className="space-y-1 rounded border p-3"><legend className="font-bold">{group.title}</legend>
    {group.title === "Technical Audits" && <><div>Audit trades: {CLASSICAL_TRADES.map((trade) => <label key={trade} className="mr-2 inline-block"><input type="checkbox" disabled={!onChange} checked={value.auditTrades.includes(trade)} onChange={() => onChange?.({ ...value, auditTrades: toggle(value.auditTrades, trade) })} /> {trade}</label>)}</div><div>Types: {(["PM", "FJ"] as const).map((type) => <label key={type} className="mr-2"><input type="checkbox" disabled={!onChange} checked={value.auditWRTypes.includes(type)} onChange={() => onChange?.({ ...value, auditWRTypes: toggle(value.auditWRTypes, type) })} /> {type}</label>)}</div></>}
    {group.fields.map(([key, label]) => <label key={key} className="block"><input type="checkbox" disabled={!onChange} checked={value[key]} onChange={(e) => onChange?.({ ...value, [key]: e.target.checked })} /> {label}</label>)}
  </fieldset>)}</div>;
}

export function UserAccessMatrix({ mode = "users" }: { mode?: "users" | "roles" }) {
  const { data, setData } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const { profile, governance } = useActiveUserPermissions();
  const admin = !!profile?.isSuperAdmin;
  const allowed = !!profile && (admin || (!!profile.isSiteAdmin && governance("canManageUsersAndVPA")));
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [capability, setCapability] = useState("");
  const [draft, setDraft] = useState<UserAccessProfile | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDefinition | null>(null);
  const [pendingRole, setPendingRole] = useState<RoleDefinition | null>(null);
  const [assignPerson, setAssignPerson] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const roles = data.roleDefinitions;
  const profiles = data.userAccessProfiles.filter((item) => item.siteId === activeSiteId && isPersonProfile(item));
  const canEditRole = (role: RoleDefinition) => allowed && (admin || (!protectedRole(role) && !profiles.some((person) => privileged(person) && person.assignedRoleIds?.includes(role.id))));
  const create = () => { setError(""); setPendingRole(null); setDraft({ id: crypto.randomUUID(), siteId: activeSiteId, personName: "", fullName: "", primaryRole: "Craftperson", isCraftperson: true, isTeamLeader: false, isQAInspector: false, isSiteAdmin: false, vpaTrades: [], vpaBuildingIds: [], assignedRoleIds: ["craftperson"], permissions: permissionsForPreset("Craftperson") }); };
  const save = () => {
    if (!draft || draft.siteId !== activeSiteId || !allowed || (!admin && privileged(draft))) { setError("You cannot edit this profile on the active site."); return; }
    const name = draft.personName.trim(), fullName = draft.fullName.trim();
    if (!name || !fullName || (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email))) { setError("Enter names and a valid email address."); return; }
    if (!isPersonProfile({ ...draft, personName: name, fullName })) { setError("Enter a person's name, not a role title."); return; }
    if (profiles.some((item) => item.id !== draft.id && (item.personName.toLowerCase() === name.toLowerCase() || (!!draft.linkedCraftpersonId && item.linkedCraftpersonId === draft.linkedCraftpersonId)))) { setError("This person or craftsperson already has a profile."); return; }
    const nextRoles = pendingRole ? [...roles, pendingRole] : roles;
    if (!draft.assignedRoleIds?.length || draft.assignedRoleIds.some((id) => !nextRoles.some((role) => role.id === id))) { setError("Select valid roles."); return; }
    if (!admin && nextRoles.some((role) => draft.assignedRoleIds?.includes(role.id) && protectedRole(role))) { setError("Only Super Admin can assign administrator roles."); return; }
    const saved = assignRoles({ ...draft, personName: name, fullName }, draft.assignedRoleIds, nextRoles);
    if (!saved.isSuperAdmin && profiles.some((person) => person.id === saved.id && person.isSuperAdmin) && !profiles.some((person) => person.id !== saved.id && person.isSuperAdmin)) { setError("The site must retain at least one Super Admin."); return; }
    setData((state) => ({ ...state, roleDefinitions: nextRoles, userAccessProfiles: [...state.userAccessProfiles.filter((item) => item.id !== saved.id), saved] }));
    setNotice(`Saved access profile for ${name}.`); setDraft(null); setPendingRole(null); setError("");
  };
  const saveRole = () => {
    if (!roleDraft || !roles.some((role) => role.id === roleDraft.id) || !canEditRole(roleDraft)) { setError("This role is unavailable or cannot be edited."); return; }
    if (!roleDraft.name.trim()) { setError("Role name is required."); return; }
    setData((state) => {
      const next = state.roleDefinitions.map((role) => role.id === roleDraft.id ? { ...roleDraft, name: roleDraft.name.trim() } : role);
      return { ...state, roleDefinitions: next, userAccessProfiles: state.userAccessProfiles.map((person) => ({ ...person, permissions: resolveEffectivePermissions(person, next) })) };
    });
    setNotice(`Saved role ${roleDraft.name}.`); setError("");
  };
  const duplicate = (role: RoleDefinition) => {
    if (!canEditRole(role)) { setError("You cannot duplicate this role."); return; }
    const copy = { ...role, id: crypto.randomUUID(), name: `${role.name} — Custom`, parentRoleId: role.id, isCustomVariant: true };
    setData((state) => ({ ...state, roleDefinitions: [...state.roleDefinitions, copy] })); setRoleDraft(copy); setError("");
  };
  if (mode === "roles") return <section className="rounded border bg-white p-4">
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status" className="text-green-700">{notice}</p>}
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]"><div className="space-y-2"><h2 className="font-bold">Roles &amp; Custom Role Variants</h2>{roles.map((role) => <div key={role.id} className="rounded border p-2"><button onClick={() => { setRoleDraft(role); setError(""); }} className={`rounded px-2 ${colors[role.badgeColor]}`}>{role.name}</button><p>{role.description}</p><p>{profiles.filter((person) => person.assignedRoleIds?.includes(role.id)).length} users</p><button disabled={!canEditRole(role)} onClick={() => duplicate(role)}>Duplicate / Make Version</button>{" "}{role.isCustomVariant && <button disabled={!canEditRole(role)} onClick={() => {
      if (profiles.some((person) => person.assignedRoleIds?.includes(role.id))) { setError("Unassign this role before deleting it."); return; }
      if (window.confirm(`Delete ${role.name}?`)) { setData((state) => ({ ...state, roleDefinitions: state.roleDefinitions.filter((item) => item.id !== role.id) })); if (roleDraft?.id === role.id) setRoleDraft(null); }
    }}>Delete</button>}</div>)}</div>
    {roleDraft && <div className="space-y-3"><label className="block">Role name<input className="block w-full border p-1" value={roleDraft.name} onChange={(e) => setRoleDraft({ ...roleDraft, name: e.target.value })} /></label><label className="block">Description<input className="block w-full border p-1" value={roleDraft.description} onChange={(e) => setRoleDraft({ ...roleDraft, description: e.target.value })} /></label><label>Badge color <select value={roleDraft.badgeColor} onChange={(e) => { const color = Object.keys(colors).find((key) => key === e.target.value); if (color && color in colors) setRoleDraft({ ...roleDraft, badgeColor: color as RoleDefinition["badgeColor"] }); }}>{Object.keys(colors).map((color) => <option key={color}>{color}</option>)}</select></label>
      <Capabilities value={roleDraft.permissions} onChange={canEditRole(roleDraft) ? (permissions) => setRoleDraft({ ...roleDraft, permissions }) : undefined} />
      <p>Users assigned: {profiles.filter((person) => person.assignedRoleIds?.includes(roleDraft.id)).map((person) => person.fullName).join(", ") || "None"}</p>
      <select value={assignPerson} onChange={(e) => setAssignPerson(e.target.value)}><option value="">Select user</option>{profiles.filter((person) => !person.assignedRoleIds?.includes(roleDraft.id) && (admin || !privileged(person))).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>{" "}<button disabled={!canEditRole(roleDraft) || !assignPerson} onClick={() => {
        const person = profiles.find((item) => item.id === assignPerson); if (!person || (!admin && (privileged(person) || protectedRole(roleDraft)))) return;
        setData((state) => ({ ...state, userAccessProfiles: state.userAccessProfiles.map((item) => item.id === person.id ? assignRoles(item, [...(item.assignedRoleIds ?? []), roleDraft.id], state.roleDefinitions) : item) })); setAssignPerson("");
      }}>+ Assign User to This Role</button><div><button disabled={!canEditRole(roleDraft)} className="rounded bg-blue-700 p-2 text-white disabled:opacity-40" onClick={saveRole}>Save Role Changes</button>{" "}<button disabled={!canEditRole(roleDraft)} onClick={() => duplicate(roleDraft)}>+ Duplicate / Create Custom Role Version</button></div>
    </div>}</div></section>;
  const shown = profiles.filter((person) => `${person.personName} ${person.fullName}`.toLowerCase().includes(query.toLowerCase()) && (!roleFilter || person.assignedRoleIds?.includes(roleFilter)) && (!tradeFilter || person.vpaTrades.some((trade) => trade === tradeFilter)) && (!capability || groups.flatMap((group) => group.fields).some(([key]) => key === capability && resolveEffectivePermissions(person, roles)[key])));
  const draftRoles = pendingRole ? [...roles, pendingRole] : roles;
  return <section className="space-y-4 rounded border bg-white p-4">
    {notice && <p role="status" className="rounded bg-green-100 p-2 text-green-800">{notice}</p>}
    {!allowed && <p>Site administrator permission is required to manage users and roles.</p>}
    <div className="flex flex-wrap gap-2"><input placeholder="Search person" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Filter by assigned role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="">All roles</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><select aria-label="Filter by VPA trade" value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value)}><option value="">All trades</option>{CLASSICAL_TRADES.map((trade) => <option key={trade}>{trade}</option>)}</select><select aria-label="Filter by capability" value={capability} onChange={(e) => setCapability(e.target.value)}><option value="">All capabilities</option>{groups.flatMap((group) => group.fields).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button disabled={!allowed} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-40" onClick={create}>+ Add User / Craftperson</button></div>
    <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Person / Technician", "Assigned Role(s)", "VPA Trades", "Audit Trades", "Active Capabilities (Derived from Role)", "Actions"].map((title) => <th key={title} className="p-2">{title}</th>)}</tr></thead><tbody>{shown.map((person) => { const effective = resolveEffectivePermissions(person, roles); return <tr key={person.id} className="border-t"><td>{person.fullName} <span className="rounded bg-blue-100 p-1">{person.siteId}</span></td><td>{roles.filter((role) => person.assignedRoleIds?.includes(role.id)).map((role) => <span key={role.id} className={`m-1 inline-block rounded px-1 ${colors[role.badgeColor]}`}>{role.name}</span>)}</td><td>{person.vpaTrades.join(", ")}</td><td>{effective.auditTrades.join(", ") || "—"}</td><td>{groups.map((group) => <div key={group.title}>{group.fields.filter(([key]) => effective[key]).map(([key, label]) => <span key={key} className="m-0.5 inline-block rounded bg-emerald-100 px-1">{label}</span>)}</div>)}</td><td><button disabled={!allowed || (!admin && !!privileged(person))} onClick={() => { setPendingRole(null); setError(""); setDraft(person); }}>Edit User &amp; Role</button></td></tr>; })}</tbody></table></div>
    {draft && <div role="dialog" aria-modal="true" aria-label="Edit user and role" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"><div className="max-h-[90vh] w-full max-w-5xl space-y-3 overflow-auto rounded bg-white p-4"><div className="flex justify-between"><h2 className="font-bold">Edit User &amp; Role</h2><div><button onClick={save}>Save User Profile</button>{" "}<button onClick={() => setDraft(null)}>Cancel</button></div></div>{error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="grid gap-2 md:grid-cols-3"><label>Person name<input className="block border p-1" value={draft.personName} onChange={(e) => setDraft({ ...draft, personName: e.target.value })} /></label><label>Full name<input className="block border p-1" value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} /></label><label>Email<input className="block border p-1" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value || undefined })} /></label><label>Linked craftsperson<select className="block border p-1" value={draft.linkedCraftpersonId ?? ""} onChange={(e) => setDraft({ ...draft, linkedCraftpersonId: e.target.value || undefined })}><option value="">None</option>{data.craftspeople.filter((item) => item.SiteId === activeSiteId).map((person) => <option key={person.id} value={person.id}>{person.Name} {person.LastName}</option>)}</select></label></div>
      <h3 className="font-bold">1. Assigned Roles</h3>{draftRoles.map((role) => <label key={role.id} className="mr-3 inline-block"><input type="checkbox" disabled={!admin && protectedRole(role)} checked={draft.assignedRoleIds?.includes(role.id) ?? false} onChange={() => setDraft({ ...draft, assignedRoleIds: toggle(draft.assignedRoleIds ?? [], role.id) })} /> {role.name}</label>)}
      <h3 className="font-bold">2. VPA Trades &amp; Buildings</h3><div>{CLASSICAL_TRADES.map((trade) => <label key={trade} className="mr-2"><input type="checkbox" checked={draft.vpaTrades.includes(trade)} onChange={() => setDraft({ ...draft, vpaTrades: toggle(draft.vpaTrades, trade) })} /> {trade}</label>)} <button onClick={() => setDraft({ ...draft, vpaTrades: [...CLASSICAL_TRADES] })}>Select All 7 Trades</button></div><div>Buildings (none = all): {data.buildings.filter((item) => item.SiteId === activeSiteId).map((building) => <label key={building.bl_id} className="mr-2"><input type="checkbox" checked={draft.vpaBuildingIds.includes(building.bl_id)} onChange={() => setDraft({ ...draft, vpaBuildingIds: toggle(draft.vpaBuildingIds, building.bl_id) })} /> {building.bl_id}</label>)}</div>
      <h3 className="font-bold">3. Active Capabilities</h3><button className="rounded bg-purple-700 p-2 text-white" onClick={() => { const base = draftRoles.find((role) => draft.assignedRoleIds?.includes(role.id)); if (!base) { setError("Select a base role first."); return; } if (!admin && protectedRole(base)) { setError("Only a Super Admin may customize administrator roles."); return; } const custom: RoleDefinition = { ...base, id: crypto.randomUUID(), name: `${base.name} — Custom (${draft.personName || "New User"})`, parentRoleId: base.id, isCustomVariant: true, permissions: resolveEffectivePermissions(draft, draftRoles) }; setPendingRole(custom); setDraft({ ...draft, assignedRoleIds: [custom.id] }); }}>✨ Create Custom Role Version for {draft.personName || "This Person"}</button>
      <Capabilities value={resolveEffectivePermissions(draft, draftRoles)} onChange={pendingRole && draft.assignedRoleIds?.length === 1 && draft.assignedRoleIds[0] === pendingRole.id ? (permissions) => setPendingRole({ ...pendingRole, permissions }) : undefined} />
      <button className="rounded bg-blue-700 p-2 text-white" onClick={save}>Save User Profile</button>{" "}<button onClick={() => setDraft(null)}>Cancel</button>
    </div></div>}
  </section>;
}

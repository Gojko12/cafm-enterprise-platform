"use client";

import React, { useMemo, useState } from "react";
import { Lock, RotateCcw, Search } from "lucide-react";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import type { UserRole, UserAccessProfile } from "@cafm/shared-schema";
import { useCafmStore, useActiveUserPermissions } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { auditPermissionFlags, isPersonProfile, resolveEffectivePermissions, roleDeterminedFlags } from "@/lib/access-profiles";
import { resolveGovernanceActor } from "@/lib/governance-actor";
import { FEATURE_GROUPS, HARD_LOCKED_FEATURES, roleHasPermission } from "@/lib/rbac-matrix";
import { PERSON_MODULE_CATALOG } from "@/lib/person-modules";

/**
 * V66 (Section 116) — brainstorm tab: per-person permission exceptions layered
 * on top of the role defaults. Every person keeps exactly what their roles give
 * them (nothing changes until an admin sets an exception), and the three-state
 * controls make the divergence visible at a glance:
 * emerald = granted beyond the person's roles, rose = denied despite the
 * roles, slate = exactly what the roles say.
 *
 * Key namespaces stored in profile.permissionExceptions:
 * - raw capability flags ("canCreateFJ", ...) -> applied in resolveEffectivePermissions;
 * - feature permission strings ("workRequests.readAll", ...) -> applied in useApp.canAccess;
 * - module keys ("module.fastJobs", ...) -> hide the sidebar entry + block the page.
 * Protect rails: Super Admins are never restricted; QA/audit capabilities and
 * the strictly role-determined flags can be denied but never granted; the
 * hard-locked features can never be granted per person.
 */

type ExState = "default" | "added" | "removed";
type Exceptions = NonNullable<UserAccessProfile["permissionExceptions"]>;

const CAPABILITY_GROUPS: Array<{ title: string; fields: Array<[string, string]> }> = [
  { title: "Work Requests & Execution", fields: [["canGeneratePM_WR", "Generate PM WR"], ["canOpenFollowUpFJ", "Open Follow-Up FJ"], ["canCreateFJ", "Create FJ"], ["canCreateLJ", "Create LJ"], ["canClaimUnassignedWR", "Claim WR"], ["canCompleteWR78", "Complete 78%"], ["canCloseWR100", "Close 100%"], ["canEditSlaDates", "Edit SLA Dates (Due / Margin)"], ["canReopenCancelledWR", "Reopen Cancelled WR"], ["canChangeIssuedWRChecklist", "Change Issued WR Checklist"]] },
  { title: "Checklists & SmartPM", fields: [["canDefineChecklistPM", "Define PM Checklist"], ["canDefineChecklistFJ", "Define FJ Checklist"], ["canDefineChecklistLJ", "Define LJ Checklist"], ["canDefinePMSchedule", "Define PM Schedule"], ["canAssignPMPToEQ", "Assign PMP"], ["canManageEquipment", "Manage Equipment"]] },
  { title: "Technical Audits", fields: [["canAuditChooseWRs", "Choose WRs"], ["canAuditDoInspection", "Do Inspection"], ["canAuditReopenWR", "Reopen WR"], ["canManageFailureReasons", "Manage Failure Reasons"]] },
  { title: "Scheduling & Workforce", fields: [["canScheduleCraftperson", "Schedule Craftperson"], ["canOverwriteLaborTime", "Overwrite Labor Time"], ["canManageShiftsAndLeaves", "Manage Shifts and Leaves"], ["canManageLocationFreezes", "Manage Freezes"], ["canManageMissionEvents", "Manage Mission Events"]] },
];
/** Capability keys where a per-person GRANT would break the role laws (denies stay allowed). */
const grantLockedKeys: readonly string[] = [...roleDeterminedFlags, ...auditPermissionFlags];

const stateOf = (exceptions: Exceptions | undefined, key: string): ExState =>
  exceptions?.removed.includes(key) ? "removed" : exceptions?.added.includes(key) ? "added" : "default";
const addKey = (list: string[], key: string) => [...new Set([...list, key])];
const dropKey = (list: string[], key: string) => list.filter((item) => item !== key);

function TriStateControl({ state, grantable, canEdit, grantLabel, denyLabel, onSelect, title }: {
  state: ExState; grantable: boolean; canEdit: boolean; grantLabel?: string; denyLabel?: string;
  onSelect: (next: ExState) => void; title?: string;
}) {
  const button = (label: string, value: ExState, tone: string, disabled = false) => (
    <button key={value} type="button" aria-pressed={state === value} title={title} disabled={!canEdit || disabled}
      onClick={() => onSelect(value)}
      className={`px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${state === value ? tone : "bg-white text-slate-600 hover:bg-slate-50"}`}>
      {label}
    </button>
  );
  return (
    <span className="inline-flex overflow-hidden rounded border align-middle">
      {button("Default", "default", "bg-slate-200 text-slate-800")}
      {grantable && button(grantLabel ?? "Grant", "added", "bg-emerald-600 text-white")}
      {button(denyLabel ?? "Deny", "removed", "bg-rose-600 text-white")}
    </span>
  );
}

function EffectBadge({ inherited, effective }: { inherited: boolean; effective: boolean }) {
  if (effective && !inherited) return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Yes · added</span>;
  if (!effective && inherited) return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">No · denied</span>;
  if (effective) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Yes · from roles</span>;
  return <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400">No · from roles</span>;
}

export function PersonPermissionExceptions() {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { profile: myProfile } = useActiveUserPermissions();
  const canEdit = !!myProfile && (!!myProfile.isSuperAdmin || !!myProfile.isSiteAdmin);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [permissionQuery, setPermissionQuery] = useState("");

  const profiles = data.userAccessProfiles.filter((item) => item.siteId === activeSiteId && isPersonProfile(item));
  const filtered = profiles.filter((person) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [person.personName, person.fullName, person.username, person.primaryRole].some((value) => value?.trim().toLowerCase().includes(q));
  });
  const person = profiles.find((item) => item.id === selectedId) ?? null;
  const exceptions: Exceptions | undefined = person?.permissionExceptions;
  const isSelf = !!person && person.personName.trim().toLowerCase() === activePerson.trim().toLowerCase();

  const personRoles: UserRole[] = useMemo(
    () => person ? (resolveGovernanceActor(data, activeSiteId, person.personName)?.roles ?? []) : [],
    [data, activeSiteId, person]);
  const inheritedPerms = useMemo(
    () => person ? resolveEffectivePermissions({ ...person, permissionExceptions: undefined }, data.roleDefinitions) : null,
    [person, data.roleDefinitions]);
  const effectivePerms = useMemo(
    () => person ? resolveEffectivePermissions(person, data.roleDefinitions) : null,
    [person, data.roleDefinitions]);
  const inheritedFeature = (permission: string) =>
    personRoles.some((role) => roleHasPermission(role, permission, data.featurePermissionOverrides));
  const pq = permissionQuery.trim().toLowerCase();

  const writeExceptions = (mutate: (current: Exceptions) => Exceptions) => {
    if (!person || !canEdit || person.isSuperAdmin) return;
    setData((current) => ({
      ...current,
      userAccessProfiles: current.userAccessProfiles.map((item) => item.id !== person.id ? item : {
        ...item,
        permissionExceptions: mutate(item.permissionExceptions ?? { added: [], removed: [] }),
      }),
    }));
  };
  const setKeyState = (key: string, state: ExState) => {
    writeExceptions((current) => {
      let added = current.added;
      let removed = current.removed;
      if (state === "added") { added = addKey(added, key); removed = dropKey(removed, key); }
      else if (state === "removed") { removed = addKey(removed, key); added = dropKey(added, key); }
      else { added = dropKey(added, key); removed = dropKey(removed, key); }
      return { added, removed, updatedBy: activePerson, updatedAt: new Date().toISOString() };
    });
  };
  const resetPerson = () => writeExceptions(() => ({ added: [], removed: [] }));

  const divergence = (entry: UserAccessProfile) => ({
    added: entry.permissionExceptions?.added.length ?? 0,
    removed: entry.permissionExceptions?.removed.length ?? 0,
  });
  const roleChip = (entry: UserAccessProfile) => data.roleDefinitions
    .filter((role) => entry.assignedRoleIds?.includes(role.id))
    .map((role) => role.name)
    .join(", ") || entry.primaryRole;

  return (
    <section className="space-y-4">
      <div className="rounded border bg-white p-3 text-sm">
        <h2 className="font-semibold">Person Permission Exceptions</h2>
        <p className="mt-1 text-slate-600">
          Everyone starts with exactly what their roles grant. Pick a person to add or take away
          individual permissions: the color coding shows the divergence from their role defaults at a glance.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Default · what the roles say</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Added · granted beyond the roles</span>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">Removed · denied despite the roles</span>
        </div>
      </div>
      {!canEdit && (
        <p role="alert" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You are viewing this tab read-only. Switch to a Super Admin or Site Administrator persona to edit exceptions.
        </p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 space-y-2 lg:w-80">
          <label className="flex items-center gap-2 rounded border bg-white px-3 py-2">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Filter people"
              placeholder="Search person, username or role…" className="w-full text-sm outline-none" />
          </label>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto rounded border bg-white p-2">
            {filtered.length === 0 && <p className="p-2 text-xs text-slate-500">No person matches this search.</p>}
            {filtered.map((entry) => {
              const div = divergence(entry);
              const roles = roleChip(entry);
              return (
                <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)}
                  className={`block w-full rounded px-3 py-2 text-left text-sm ${entry.id === selectedId ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-slate-50"}`}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{entry.fullName}</span>
                    {entry.isSuperAdmin && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Super Admin</span>}
                  </span>
                  <span className="block text-xs text-slate-500">{entry.username ? `@${entry.username} · ` : ""}{roles}</span>
                  {(div.added > 0 || div.removed > 0) && (
                    <span className="mt-1 block">
                      {div.added > 0 && <span className="mr-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">+{div.added} added</span>}
                      {div.removed > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">-{div.removed} removed</span>}
                    </span>
                  )}
                  {div.added === 0 && div.removed === 0 && (
                    <span className="mt-1 block w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">role defaults</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {person ? (
          <div className="min-w-0 flex-1 space-y-4">
            <div className="rounded border bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{person.fullName}</h3>
                  <p className="text-xs text-slate-500">@{person.username ?? person.id} · {roleChip(person)}</p>
                  {exceptions?.updatedAt && (
                    <p className="mt-1 text-xs text-slate-400">
                      Last edited {formatDateDDMMYYYY(exceptions.updatedAt)} {exceptions.updatedAt.slice(11, 16)}
                      {exceptions.updatedBy ? ` by ${exceptions.updatedBy}` : ""}
                    </p>
                  )}
                </div>
                <button type="button" disabled={!canEdit || person.isSuperAdmin} onClick={resetPerson}
                  title={person.isSuperAdmin ? "Super Admins always have full access" : "Clear every exception; permissions follow the roles again"}
                  className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                  <RotateCcw size={12} /> Reset to role defaults
                </button>
              </div>
              {person.isSuperAdmin && (
                <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Super Admins always have full access; exceptions never apply to them.
                </p>
              )}
              {isSelf && !person.isSuperAdmin && (
                <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  You are editing your own access. Revoking a module also hides its sidebar entry for you;
                  the People &amp; Permissions page itself can never be revoked.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 rounded border bg-white px-3 py-2">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input value={permissionQuery} onChange={(event) => setPermissionQuery(event.target.value)}
                aria-label="Filter permissions" placeholder="Filter permissions…"
                className="w-full text-sm outline-none" />
            </label>

            <fieldset className="rounded border bg-white">
              <legend className="px-2 text-sm font-semibold">Module access</legend>
              <p className="px-3 pb-2 text-xs text-slate-500">
                Revoking a module hides its sidebar entry and blocks the page for this person only.
              </p>
              <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
                {PERSON_MODULE_CATALOG.map((module) => {
                  const state = stateOf(exceptions, `module.${module.key}`);
                  const label = pq && !module.label.toLowerCase().includes(pq) ? null : (
                    <div key={module.key} className="flex items-center justify-between gap-2 rounded border bg-slate-50 px-3 py-2 text-sm">
                      <span>{module.label}</span>
                      {state === "removed"
                        ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">Revoked</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Open</span>}
                      <TriStateControl state={state} grantable={false} canEdit={canEdit && !person.isSuperAdmin}
                        denyLabel="Revoke" onSelect={(next) => next === "default"
                          ? setKeyState(`module.${module.key}`, "default")
                          : setKeyState(`module.${module.key}`, "removed")} />
                    </div>
                  );
                  return label;
                })}
              </div>
            </fieldset>

            <fieldset className="rounded border bg-white">
              <legend className="px-2 text-sm font-semibold">Feature permissions</legend>
              <p className="px-3 pb-2 text-xs text-slate-500">
                Page-level rights (view, edit, approve). Grants of hard-locked admin features are not possible.
              </p>
              <div className="grid gap-3 px-3 pb-3 lg:grid-cols-2">
                {FEATURE_GROUPS.map((group) => {
                  const items = group.items.filter(([permission, label]) =>
                    !pq || label.toLowerCase().includes(pq) || permission.toLowerCase().includes(pq));
                  if (!items.length) return null;
                  return (
                    <div key={group.title} className="space-y-1 rounded border p-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{group.title}</p>
                      {items.map(([permission, label]) => {
                        const hardLocked = (HARD_LOCKED_FEATURES as readonly string[]).includes(permission);
                        const inherited = inheritedFeature(permission);
                        const state = stateOf(exceptions, permission);
                        const effective = state === "added" ? true : state === "removed" ? false : inherited;
                        return (
                          <div key={permission} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="min-w-0">
                              {label}
                              {hardLocked && <Lock size={11} className="ml-1 inline text-slate-400" aria-label="Hard locked" />}
                            </span>
                            <span className="flex items-center gap-2">
                              <EffectBadge inherited={inherited} effective={effective} />
                              <TriStateControl state={state} grantable={!hardLocked}
                                canEdit={canEdit && !person.isSuperAdmin}
                                title={hardLocked ? "Hard-locked features can be denied but never granted per person" : undefined}
                                onSelect={(next) => setKeyState(permission, next)} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="rounded border bg-white" disabled={!canEdit || !!person.isSuperAdmin}>
              <legend className="px-2 text-sm font-semibold">Operational capabilities</legend>
              <p className="px-3 pb-2 text-xs text-slate-500">
                The button-level rights (create, edit, close, schedule…). QA/audit rights and the
                strictly role-determined flags can be denied but never granted per person.
              </p>
              <div className="grid gap-3 px-3 pb-3 lg:grid-cols-2">
                {CAPABILITY_GROUPS.map((group) => {
                  const items = group.fields.filter(([key, label]) =>
                    !pq || label.toLowerCase().includes(pq) || key.toLowerCase().includes(pq));
                  if (!items.length) return null;
                  const capabilityRows = items.map(([key, label]) => {
                    const inherited = inheritedPerms && (inheritedPerms as unknown as Record<string, unknown>)[key] === true;
                    const effective = effectivePerms && (effectivePerms as unknown as Record<string, unknown>)[key] === true;
                    const state = stateOf(exceptions, key);
                    const grantLocked = grantLockedKeys.includes(key);
                    return (
                      <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>{label}</span>
                        <span className="flex items-center gap-2">
                          <EffectBadge inherited={!!inherited} effective={!!effective} />
                          <TriStateControl state={state} grantable={!grantLocked}
                            canEdit={canEdit && !person.isSuperAdmin}
                            title={grantLocked ? "This capability follows the role laws: it can be denied but never granted per person" : undefined}
                            onSelect={(next) => setKeyState(key, next)} />
                        </span>
                      </div>
                    );
                  });
                  return (
                    <div key={group.title} className="space-y-1 rounded border p-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{group.title}</p>
                      {capabilityRows}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </div>
        ) : (
          <div className="min-w-0 flex-1 rounded border bg-white p-6 text-sm text-slate-500">
            Select a person on the left to review and edit their permission exceptions.
          </div>
        )}
      </div>
    </section>
  );
}

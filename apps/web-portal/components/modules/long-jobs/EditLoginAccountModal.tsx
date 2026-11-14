"use client";

import React, { useState } from "react";
import type { LJRole, SiteId, UserAccess, UserAccessProfile } from "@cafm/shared-schema";
import { PLATFORM_SITE_IDS, ROLE_PERMISSIONS, SITE_LABELS } from "@cafm/shared-schema";
import type { UserRole } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";

const LJ_ROLE_CODES: LJRole[] = ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_CCM", "ESA_DO", "ESA_IM", "TRADE_CM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"];
const SITES: SiteId[] = [...PLATFORM_SITE_IDS];

/**
 * Edit User modal behind the pencil icon in `Login accounts & legacy site access`:
 * edits the login's system role, Long Job roles, Main/Deputy stage assignments and
 * site access — multi-site checkboxes stay locked unless `SuperAdmin` is selected.
 */
export function EditLoginAccountModal({ user, profile, isSuperAdminEditor, onClose }: {
  user: UserAccess;
  profile?: UserAccessProfile;
  isSuperAdminEditor: boolean;
  onClose: () => void;
}) {
  const { data, setData } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const [systemRole, setSystemRole] = useState<UserRole>(user.SystemRole);
  const [ljRoles, setLjRoles] = useState<LJRole[]>([...user.LJRoles]);
  const [sites, setSites] = useState<SiteId[]>(profile?.siteAccess ?? user.AssignedSiteIds);
  const [superAdminSelected, setSuperAdminSelected] = useState(!!profile?.isSuperAdmin);
  const personName = profile?.personName ?? user.DisplayName;
  const levelFor = (role: LJRole) => {
    const mine = data.siteRoleAssignments.filter((item) => item.SiteId === activeSiteId && item.PersonName === personName && item.RoleCode === role);
    return mine.some((item) => item.AssignmentLevel === "Main") ? "Main" : mine.some((item) => item.AssignmentLevel === "Deputy") ? "Deputy" : "";
  };
  const [stageLevels, setStageLevels] = useState<Record<string, string>>(() => Object.fromEntries(LJ_ROLE_CODES.map((role) => [role, levelFor(role)])));
  const multiSiteLocked = !superAdminSelected;

  const save = () => {
    const nextSites = superAdminSelected ? sites : [activeSiteId];
    setData((current) => ({
      ...current,
      users: current.users.map((item) => item.UserId === user.UserId
        ? { ...item, SystemRole: systemRole, LJRoles: ljRoles, AssignedSiteIds: nextSites.length ? nextSites : [activeSiteId] }
        : item),
      userAccessProfiles: profile ? current.userAccessProfiles.map((item) => item.id === profile.id
        ? { ...item, siteAccess: nextSites.length ? nextSites : [activeSiteId] }
        : item) : current.userAccessProfiles,
      // Main/Deputy stage assignments: claim every trade row of the chosen role/level at this site.
      // Rows always need an assignee, so releasing a level is done by assigning someone else to it.
      siteRoleAssignments: current.siteRoleAssignments.map((item) => {
        if (item.SiteId !== activeSiteId) return item;
        const chosen = stageLevels[item.RoleCode];
        return chosen && item.AssignmentLevel === chosen ? { ...item, PersonName: personName } : item;
      }),
    }));
    onClose();
  };

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4">
    <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
      <header className="shrink-0 border-b p-4">
        <h3 className="text-lg font-bold">Edit User — {profile?.fullName ?? user.DisplayName}</h3>
        <p className="text-xs text-slate-500">@{profile?.username ?? user.UserId} · {activeSiteId}</p>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm">
        <label className="block font-semibold">System role
          <select className="mt-1 block w-full rounded border px-2 py-1.5 font-normal" value={systemRole} onChange={(event) => setSystemRole(event.target.value as UserRole)}>
            {Object.keys(ROLE_PERMISSIONS).map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="font-semibold">Long Job roles</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {LJ_ROLE_CODES.map((role) => <label key={role} className="flex items-center gap-1">
              <input type="checkbox" checked={ljRoles.includes(role)}
                onChange={(event) => setLjRoles(event.target.checked ? [...ljRoles, role] : ljRoles.filter((item) => item !== role))} /> {role}
            </label>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-semibold">Main / Deputy stage roles at {activeSiteId}</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {LJ_ROLE_CODES.map((role) => <label key={role} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
              <span>{role}</span>
              <select aria-label={`${role} assignment level`} className="rounded border px-1 py-0.5" value={stageLevels[role] ?? ""}
                onChange={(event) => setStageLevels({ ...stageLevels, [role]: event.target.value })}>
                <option value="">Not assigned here</option><option value="Main">Main</option><option value="Deputy">Deputy</option>
              </select>
            </label>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-semibold">Site access {multiSiteLocked && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">Single-site access · SuperAdmin required for multi-site</span>}</legend>
          {isSuperAdminEditor && <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={superAdminSelected} onChange={(event) => { setSuperAdminSelected(event.target.checked); if (!event.target.checked) setSites([activeSiteId]); }} /> SuperAdmin (unlocks multi-site checkboxes — reserved for Mark Meyer and Gregor Kovac)</label>}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {SITES.map((site) => <label key={site} className={`flex items-center gap-1 ${multiSiteLocked && site !== activeSiteId ? "opacity-50" : ""}`}
              title={multiSiteLocked && site !== activeSiteId ? "Single-site access · SuperAdmin required for multi-site" : undefined}>
              <input type="checkbox" disabled={multiSiteLocked && site !== activeSiteId}
                checked={multiSiteLocked ? site === activeSiteId : sites.includes(site)}
                onChange={(event) => setSites(event.target.checked ? [...new Set([...sites, site])] : sites.filter((item) => item !== site))} />
              {SITE_LABELS[site]} ({site})
            </label>)}
          </div>
        </fieldset>
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t bg-slate-50 p-4">
        <button type="button" onClick={onClose} className="rounded border px-4 py-2 text-sm">Cancel</button>
        <button type="button" onClick={save} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Save User</button>
      </footer>
    </div>
  </div>;
}

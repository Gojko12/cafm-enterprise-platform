"use client";

import { useMemo, useState } from "react";
import {
  AssignmentLevel,
  AssignmentLevelSchema,
  CLASSICAL_TRADES,
  LJRole,
  LJRoleEnum,
  SiteId,
  SiteIdSchema,
  PLATFORM_SITE_IDS,
  SiteRoleAssignment,
  SiteRoleAssignmentSchema,
  SiteRoleAssignmentTrade,
  SiteRoleAssignmentTradeSchema,
} from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { QAInspectorSettings } from "@/components/modules/QASettings";
import { isPersonProfile } from "@/lib/access-profiles";

const ROLE_NAMES: Record<LJRole, string> = {
  ESA_TM: "ESA Trade Manager",
  TRADE_TM: "Trade Manager",
  ESA_CCM: "ESA Cost Centre Manager",
  TRADE_CM: "Trade Contract Manager",
  ESA_TO: "ESA Technical Officer",
  ESA_LJM: "ESA Long Job Manager",
  ESA_DO: "Draftsman",
  ESA_IM: "CIFM Inventory Admin",
  ESA_LONG_JOB: "ESA Long Job",
  TRADE_LONG_JOB: "Trade Long Job",
};
const TRADES: SiteRoleAssignmentTrade[] = [...CLASSICAL_TRADES, "All"];
const SITES: SiteId[] = [...PLATFORM_SITE_IDS];
const blankAssignment = (siteId: SiteId): Omit<SiteRoleAssignment, "AssignmentId"> => ({
  SiteId: siteId,
  PersonName: "",
  RoleCode: "ESA_TM",
  Trade: "Mechanical",
  AssignmentLevel: "Main",
  ReceiveNotifications: true,
});

export function TradeManagerAssignments() {
  const { activeSiteId } = useSiteContext();
  const { data, setData } = useCafmStore();
  const { governance } = useActiveUserPermissions();
  const [siteFilter, setSiteFilter] = useState<SiteId | "All">(activeSiteId);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<LJRole | "All">("All");
  const [tradeFilter, setTradeFilter] = useState<SiteRoleAssignmentTrade | "All">("All");
  const [levelFilter, setLevelFilter] = useState<AssignmentLevel | "All">("All");
  const [notificationFilter, setNotificationFilter] = useState<"All" | "Yes" | "No">("All");
  const [editing, setEditing] = useState<SiteRoleAssignment | null>(null);
  const [draft, setDraft] = useState<Omit<SiteRoleAssignment, "AssignmentId">>(blankAssignment(activeSiteId));
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");

  const assignments = useMemo(() => data.siteRoleAssignments.filter((assignment) => {
    if (siteFilter !== "All" && assignment.SiteId !== siteFilter) return false;
    if (roleFilter !== "All" && assignment.RoleCode !== roleFilter) return false;
    if (tradeFilter !== "All" && assignment.Trade !== tradeFilter) return false;
    if (levelFilter !== "All" && assignment.AssignmentLevel !== levelFilter) return false;
    if (notificationFilter !== "All" && assignment.ReceiveNotifications !== (notificationFilter === "Yes")) return false;
    const query = search.trim().toLowerCase();
    return !query || [assignment.PersonName, assignment.SiteId, assignment.Trade, assignment.RoleCode, ROLE_NAMES[assignment.RoleCode]]
      .some((value) => value.toLowerCase().includes(query));
  }), [data.siteRoleAssignments, siteFilter, roleFilter, tradeFilter, levelFilter, notificationFilter, search]);

  const openNew = () => {
    if (!governance("canManageRoleAssignments")) { setError("Site governance does not permit managing role assignments."); return; }
    setEditing(null);
    setDraft(blankAssignment(siteFilter === "All" ? activeSiteId : siteFilter));
    setError("");
    setFormOpen(true);
  };
  const openEdit = (assignment: SiteRoleAssignment) => {
    if (!governance("canManageRoleAssignments")) { setError("Site governance does not permit managing role assignments."); return; }
    setEditing(assignment);
    setDraft({
      SiteId: assignment.SiteId,
      PersonName: assignment.PersonName,
      RoleCode: assignment.RoleCode,
      Trade: assignment.Trade,
      AssignmentLevel: assignment.AssignmentLevel,
      ReceiveNotifications: assignment.ReceiveNotifications,
    });
    setError("");
    setFormOpen(true);
  };
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!governance("canManageRoleAssignments")) { setError("Site governance does not permit managing role assignments."); return; }
    if (draft.SiteId !== activeSiteId) { setError("Switch to the target site before editing its assignments."); return; }
    const parsed = SiteRoleAssignmentSchema.safeParse({
      ...draft,
      AssignmentId: editing?.AssignmentId ?? crypto.randomUUID(),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "The assignment is invalid.");
      return;
    }
    setData((current) => ({
      ...current,
      siteRoleAssignments: editing
        ? current.siteRoleAssignments.map((assignment) => assignment.AssignmentId === editing.AssignmentId ? parsed.data : assignment)
        : [...current.siteRoleAssignments, parsed.data],
    }));
    setEditing(null);
    setFormOpen(false);
  };
  const toggleNotifications = (assignment: SiteRoleAssignment) => { if (!governance("canManageRoleAssignments")) { setError("Site governance does not permit managing role assignments."); return; } setData((current) => ({
    ...current,
    siteRoleAssignments: current.siteRoleAssignments.map((item) => item.AssignmentId === assignment.AssignmentId
      ? { ...item, ReceiveNotifications: !item.ReceiveNotifications }
      : item),
  })); };
  const remove = (assignmentId: string) => { if (!governance("canManageRoleAssignments")) { setError("Site governance does not permit managing role assignments."); return; } setData((current) => ({
    ...current,
    siteRoleAssignments: current.siteRoleAssignments.filter((assignment) => assignment.AssignmentId !== assignmentId),
  })); };

  return <div className="space-y-5">
    <>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Long Job Main / Deputy Managers by Trade</h2>
        <p className="mt-1 text-sm text-slate-600">Manage Main and Deputy workflow roles and notification recipients by site and trade.</p>
      </div>
      <button type="button" disabled={!governance("canManageRoleAssignments")} onClick={openNew} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40">Add Assignment</button>
    </header>

    <section className="rounded-lg border bg-white p-4 shadow-sm" aria-label="Assignment filters">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-semibold text-slate-600">Site
          <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value as SiteId | "All")} className="mt-1 w-full rounded border px-2 py-2 text-sm">
            <option value="All">All sites</option>{SITES.map((site) => <option key={site} value={site}>{site}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Person, role or trade" className="mt-1 w-full rounded border px-2 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Role
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as LJRole | "All")} className="mt-1 w-full rounded border px-2 py-2 text-sm">
            <option value="All">All roles</option>{LJRoleEnum.options.map((role) => <option key={role} value={role}>{ROLE_NAMES[role]} ({role})</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Trade
          <select value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value as SiteRoleAssignmentTrade | "All")} className="mt-1 w-full rounded border px-2 py-2 text-sm">
            <option value="All">All trades</option>{TRADES.map((trade) => <option key={trade} value={trade}>{trade}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Assignment Level
          <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as AssignmentLevel | "All")} className="mt-1 w-full rounded border px-2 py-2 text-sm">
            <option value="All">Main and Deputy</option>{AssignmentLevelSchema.options.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Notifications
          <select value={notificationFilter} onChange={(event) => setNotificationFilter(event.target.value as "All" | "Yes" | "No")} className="mt-1 w-full rounded border px-2 py-2 text-sm">
            <option value="All">Yes and No</option><option value="Yes">Yes</option><option value="No">No</option>
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-500">{assignments.length} assignments</p>
    </section>

    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-600">
          <tr>{["Site", "Person", "Role", "Trade", "Level", "Receive Notifications", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {assignments.map((assignment) => <tr key={assignment.AssignmentId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium">{assignment.SiteId}</td>
            <td className="px-4 py-3">{assignment.PersonName}</td>
            <td className="px-4 py-3">{ROLE_NAMES[assignment.RoleCode]} <span className="text-xs text-slate-500">({assignment.RoleCode})</span></td>
            <td className="px-4 py-3">{assignment.Trade}</td>
            <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${assignment.AssignmentLevel === "Main" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-900"}`}>{assignment.AssignmentLevel}</span></td>
            <td className="px-4 py-3">
              <button type="button" role="switch" aria-checked={assignment.ReceiveNotifications}
                aria-label={`Receive notifications for ${assignment.PersonName} ${assignment.RoleCode}`}
                onClick={() => toggleNotifications(assignment)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${assignment.ReceiveNotifications ? "bg-emerald-600" : "bg-slate-300"}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${assignment.ReceiveNotifications ? "translate-x-6" : "translate-x-1"}`} />
              </button><span className="ml-2 text-xs text-slate-600">{assignment.ReceiveNotifications ? "Yes" : "No"}</span>
            </td>
            <td className="space-x-3 px-4 py-3">
              <button type="button" onClick={() => openEdit(assignment)} className="font-medium text-blue-700 hover:underline">Edit</button>
              <button type="button" onClick={() => remove(assignment.AssignmentId)} className="font-medium text-red-700 hover:underline">Delete</button>
            </td>
          </tr>)}
          {!assignments.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No assignments match these filters.</td></tr>}
        </tbody>
      </table>
    </div>

    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <form onSubmit={save} className="w-full max-w-xl space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{editing ? "Edit Site Role Assignment" : "Add Site Role Assignment"}</h2>
          <button type="button" onClick={() => { setEditing(null); setFormOpen(false); setError(""); }} aria-label="Close assignment form" className="rounded px-2 py-1 text-xl hover:bg-slate-100">×</button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Site<select required value={draft.SiteId} onChange={(event) => setDraft({ ...draft, SiteId: SiteIdSchema.parse(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2">{SITES.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>
          <label className="text-sm">Person<select required value={draft.PersonName} onChange={(event) => setDraft({ ...draft, PersonName: event.target.value })} className="mt-1 w-full rounded border px-3 py-2"><option value="">Select person</option>{data.userAccessProfiles.filter((person) => person.siteId === activeSiteId && isPersonProfile(person)).map((person) => <option key={person.id} value={person.personName}>{person.fullName}</option>)}</select></label>
          <label className="text-sm">Role<select value={draft.RoleCode} onChange={(event) => setDraft({ ...draft, RoleCode: LJRoleEnum.parse(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2">{LJRoleEnum.options.map((role) => <option key={role} value={role}>{ROLE_NAMES[role]} ({role})</option>)}</select></label>
          <label className="text-sm">Trade<select value={draft.Trade} onChange={(event) => setDraft({ ...draft, Trade: SiteRoleAssignmentTradeSchema.parse(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2">{TRADES.map((trade) => <option key={trade} value={trade}>{trade}</option>)}</select></label>
          <label className="text-sm">Assignment Level<select value={draft.AssignmentLevel} onChange={(event) => setDraft({ ...draft, AssignmentLevel: AssignmentLevelSchema.parse(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2">{AssignmentLevelSchema.options.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
          <div className="self-end pb-2">
            <p className="text-sm">Receive notifications</p>
            <button type="button" role="switch" aria-checked={draft.ReceiveNotifications}
              onClick={() => setDraft({ ...draft, ReceiveNotifications: !draft.ReceiveNotifications })}
              className={`mt-1 inline-flex h-6 w-11 items-center rounded-full transition-colors ${draft.ReceiveNotifications ? "bg-emerald-600" : "bg-slate-300"}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${draft.ReceiveNotifications ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="ml-2 text-xs text-slate-600">{draft.ReceiveNotifications ? "Yes" : "No"}</span>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => { setEditing(null); setFormOpen(false); setError(""); }} className="rounded border px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Save Assignment</button></div>
      </form>
    </div>}
    <QAInspectorSettings />
    </>
  </div>;
}

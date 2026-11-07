"use client";

import React, { useState } from "react";
import type { BaseWorkRequest, LJRole } from "@cafm/shared-schema";
import { LJRoleEnum } from "@cafm/shared-schema";
import { useCafmStore, ASSIGNMENT_ROLES } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";

const TABS = [
  "Work request details & Roles",
  "Quotation, Budget & Ordering (0% - 32%)",
  "Execution, Labor & Freeze (32% - 78%)",
  "Acceptances: SAT, Drawing & Inventory (78% - 94%)",
  "Financial Closure & Yellow Page (94% - 100%)",
  "Attached Documents",
] as const;
type Tab = (typeof TABS)[number];
const ROLE_LABEL: Record<string, string> = {
  ESA_TM: "ESA Trade Manager", ESA_CCM: "ESA Cost Centre Manager", TRADE_TM: "Trade Manager",
  TRADE_CM: "Trade Contract Manager", ESA_TO: "ESA Technical Officer", ESA_LJM: "ESA Long Job Manager",
  ESA_DO: "ESA_DO Draftsman", ESA_IM: "CIFM Inventory Admin",
};

export function LJWorkRequestPopup({ workRequest, onClose, onNavigate }: {
  workRequest: BaseWorkRequest;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activeLJRole, setActiveLJRole, currentUser } = useSiteContext();
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const [role, setRole] = useState<LJRole>(activeLJRole ?? "ESA_TO");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<"all" | "comment" | "log">("all");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const actorId = currentUser?.UserId ?? "current-user";
  const actorName = currentUser?.DisplayName ?? "Current user";
  const track = workRequest.ProcessTrack ?? (workRequest.Percentage >= 30 ? "RFW" : "RFQ");

  const update = (change: (wr: BaseWorkRequest) => BaseWorkRequest, log?: string) => {
    const now = new Date().toISOString();
    setData((state) => ({ ...state, workRequests: state.workRequests.map((wr) => {
      if (wr.WR_ID !== workRequest.WR_ID || wr.SiteId !== workRequest.SiteId) return wr;
      const changed = change(wr);
      return { ...changed, UpdatedAt: now, ...(log ? { Activity: [...(changed.Activity ?? []), {
        id: crypto.randomUUID(), kind: "log" as const, actorId, actorName, actorRole: role, createdAt: now, text: log,
      }] } : {}) };
    }) }));
  };
  const stage = (percentage: number, description: string, extra: Partial<BaseWorkRequest> = {}, allowedRoles?: LJRole[]) => {
    if (percentage < 0 || percentage > 100) return;
    if (allowedRoles && !allowedRoles.includes(role)) {
      window.alert(`This stage requires one of these LJ roles: ${allowedRoles.join(", ")}.`);
      return;
    }
    if (percentage < workRequest.Percentage && !(percentage === 50 && workRequest.Percentage === 55)) {
      window.alert("Long Job stages cannot be moved backwards.");
      return;
    }
    const now = new Date();
    const freezeStart = workRequest.FreezeStartedAt ? Date.parse(workRequest.FreezeStartedAt) : Number.NaN;
    const marginTime = workRequest.MarginDate ? Date.parse(workRequest.MarginDate) : Number.NaN;
    const freezeDuration = workRequest.IsFrozen && Number.isFinite(freezeStart)
      ? Math.max(0, now.getTime() - freezeStart)
      : 0;
    const extendedMargin = Number.isFinite(marginTime) && freezeDuration
      ? new Date(marginTime + freezeDuration).toISOString()
      : workRequest.MarginDate;
    const freezeUpdates: Partial<BaseWorkRequest> = percentage === 55
      ? { IsFrozen: true, FreezeStartedAt: workRequest.FreezeStartedAt ?? now.toISOString() }
      : workRequest.IsFrozen ? {
        IsFrozen: false, FreezeEndedAt: now.toISOString(), ActiveFreezeName: undefined,
        ...(extendedMargin ? { MarginDate: extendedMargin } : {}),
      } : {};
    update((wr) => ({ ...wr, ...extra, ...freezeUpdates, Percentage: percentage,
      WorkRequestStatus: percentage === 100 ? "Closed" : percentage >= 78 ? "Technically Completed" : percentage === 27 ? "Cancelled" : "In Progress",
      WorkRequestSubstatus: description }), `${description} (${workRequest.Percentage}% to ${percentage}%) by ${actorName} as ${role}`);
  };
  const post = () => {
    if (!message.trim()) return;
    const now = new Date().toISOString();
    update((wr) => ({ ...wr, Activity: [...(wr.Activity ?? []), {
      id: crypto.randomUUID(), kind: "comment", actorId, actorName, actorRole: role, createdAt: now, text: message.trim(), editHistory: [],
    }] }));
    setMessage("");
  };
  const saveEdit = (id: string) => {
    if (!draft.trim()) return;
    const now = new Date().toISOString();
    update((wr) => ({ ...wr, Activity: (wr.Activity ?? []).map((entry) =>
      entry.id === id && entry.kind === "comment" && entry.actorId === actorId
        ? { ...entry, text: draft.trim(), editedAt: now, editHistory: [
          ...(entry.editHistory ?? []), { text: entry.text, timestamp: entry.editedAt ?? entry.createdAt },
        ] } : entry) }));
    setEditing(null);
  };
  const setActingRole = (value: string) => {
    const parsed = LJRoleEnum.safeParse(value);
    if (!parsed.success) return;
    setRole(parsed.data);
    setActiveLJRole(parsed.data);
    update((wr) => wr, `Acting LJ role changed to ${parsed.data} by ${actorName}`);
  };
  const changeAssignedRole = (key: keyof NonNullable<BaseWorkRequest["AssignedRoles"]>, value: string) => {
    update((wr) => ({ ...wr, AssignedRoles: { ...wr.AssignedRoles, [key]: value || undefined } }),
      `${ROLE_LABEL[key]} assignment changed by ${actorName}`);
  };
  const attach = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => window.alert(`Could not read ${file.name}.`);
    reader.onload = () => {
      if (typeof reader.result !== "string") { window.alert(`Could not read ${file.name}.`); return; }
      update((wr) => ({ ...wr, Attachments: [...(wr.Attachments ?? []), {
        id: crypto.randomUUID(), name: file.name, type: file.type, dataUrl: reader.result as string,
      }] }), `LJ document '${file.name}' added by ${actorName}`);
    };
    reader.readAsDataURL(file);
  };
  const group = (title: string, children: React.ReactNode) => <details open className="rounded border bg-white">
    <summary className="cursor-pointer bg-slate-50 px-4 py-3 font-semibold">{title}</summary><div className="grid gap-3 p-4 sm:grid-cols-2">{children}</div>
  </details>;
  const field = (label: string, value: React.ReactNode) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm">{value || "—"}</dd></div>;
  const required = workRequest.RequiresSAT || workRequest.RequiresDrawingUpdate || workRequest.RequiresInventoryUpdate;
  const gates = workRequest.AcceptanceGates ?? [];
  const gateState = (type: "SAT" | "DrawingEngineering" | "CIFMInventory") => gates.find((item) => item.GateType === type);
  const approveGate = (type: "SAT" | "DrawingEngineering" | "CIFMInventory") => {
    const approvers: Record<typeof type, LJRole[]> = {
      SAT: ["ESA_TO", "ESA_TM"], DrawingEngineering: ["ESA_DO"], CIFMInventory: ["ESA_IM"],
    };
    if (!approvers[type].includes(role)) {
      window.alert(`${type} approval requires ${approvers[type].join(" or ")}.`);
      return;
    }
    if (type === "SAT" && workRequest.RequiresSAT && !workRequest.PreSATApproved) {
      window.alert("Pre-SAT must be approved before SAT.");
      return;
    }
    if (type === "SAT" && gateState(type)?.Status !== "InvitationSent") {
      window.alert("Send the SAT invitation before recording SAT approval.");
      return;
    }
    if ((type === "SAT" && !workRequest.RequiresSAT) || (type === "DrawingEngineering" && !workRequest.RequiresDrawingUpdate) ||
      (type === "CIFMInventory" && !workRequest.RequiresInventoryUpdate)) return;
    const next = [...gates.filter((item) => item.GateType !== type), {
      GateType: type, IsRequired: true, Status: "Approved" as const, ApprovedBy: actorName, ApprovedAt: new Date().toISOString(),
    }];
    const complete = (!workRequest.RequiresSAT || next.some((gate) => gate.GateType === "SAT" && gate.Status === "Approved")) &&
      (!workRequest.RequiresDrawingUpdate || next.some((gate) => gate.GateType === "DrawingEngineering" && gate.Status === "Approved")) &&
      (!workRequest.RequiresInventoryUpdate || next.some((gate) => gate.GateType === "CIFMInventory" && gate.Status === "Approved"));
    const percentage = complete ? 94 : type === "SAT" ? 81 : Math.max(79, workRequest.Percentage);
    stage(percentage, complete ? "All Acceptances Completed" : `${type} approved`, { AcceptanceGates: next });
  };
  const gateAction = (type: "SAT" | "DrawingEngineering" | "CIFMInventory", status: "ReviewRequested" | "InvitationSent") => {
    const assignees: Record<typeof type, LJRole[]> = {
      SAT: ["ESA_TO", "ESA_TM"], DrawingEngineering: ["ESA_DO"], CIFMInventory: ["ESA_IM"],
    };
    if (!assignees[type].includes(role)) {
      window.alert(`${type} actions require ${assignees[type].join(" or ")}.`);
      return;
    }
    if (type === "SAT" && !workRequest.PreSATApproved) {
      window.alert("Pre-SAT must be approved before SAT actions.");
      return;
    }
    const next = [...gates.filter((item) => item.GateType !== type), { GateType: type, IsRequired: true, Status: status as "ReviewRequested" | "InvitationSent" }];
    const percentage = type === "SAT" && status === "InvitationSent" ? 80 : Math.max(78, workRequest.Percentage);
    stage(percentage, `${type}: ${status}`, { AcceptanceGates: next });
  };
  const roles = ASSIGNMENT_ROLES.filter((item) => ["ESA_TM", "ESA_CCM", "TRADE_TM", "TRADE_CM", "ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"].includes(item));
  const roleUsers = (key: typeof roles[number]) => data.users.filter((user) =>
    (user.CanAccessAll || user.AssignedSiteIds.includes(activeSiteId)) &&
    (user.LJRoles.includes(key) || user.SystemRole === key) &&
    (["ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"].includes(key) || !workRequest.TradeId || !user.Trades.length || user.Trades.includes(workRequest.TradeId)));
  const printYellowPage = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { window.alert("Allow pop-ups to print the Yellow Page."); return; }
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character] ?? character);
    const cell = (label: string, value: string) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`;
    const rows = [
      cell("WR ID", workRequest.WR_ID), cell("Description", workRequest.Description), cell("Process", track),
      cell("Trade", workRequest.TradeName ?? workRequest.TradeId ?? ""), cell("Estimated Cost", `${workRequest.EstimatedCostEur ?? 0} EUR`),
      cell("Actual Cost", `${workRequest.ActualCostEur ?? 0} EUR`),
      ...roles.map((key) => cell(`${ROLE_LABEL[key]} signature`, data.users.find((user) => user.UserId === workRequest.AssignedRoles?.[key])?.DisplayName ?? workRequest.AssignedRoles?.[key] ?? "Pending")),
      ...gates.filter((gate) => gate.Status === "Approved").map((gate) => cell(`${gate.GateType} approval`,
        `${gate.ApprovedBy ?? "Unknown"} · ${gate.ApprovedAt ?? "Date not recorded"}`)),
      ...(workRequest.Activity ?? []).filter((entry) => entry.kind === "log" && /approved|sign|completed|archived/i.test(entry.text))
        .map((entry) => cell("Stage signature / approval", `${entry.text} · ${entry.createdAt}`)),
    ].join("");
    printWindow.document.write(`<!doctype html><html><head><title>Yellow Page ${escapeHtml(workRequest.WR_ID)}</title><style>
      body{font:14px Arial,sans-serif;color:#111;padding:32px}h1{text-align:center;background:#fef3c7;padding:18px;border:2px solid #111}
      table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #777;padding:9px;text-align:left}th{width:32%;background:#f3f4f6}
      </style></head><body><h1>Official Yellow Page</h1><table>${rows}</table><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
    <section role="dialog" aria-modal="true" aria-label="LJ Details Popup" className="flex h-[95vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-xl bg-slate-100 shadow-2xl">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3">
        <div><h2 className="text-xl font-bold">LJ Details Popup</h2><p className="text-sm text-slate-600">{workRequest.WR_ID} · {workRequest.Description}</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-indigo-100 px-3 py-1 text-sm font-semibold">Process: {track}</span>
          <span className="rounded bg-slate-800 px-3 py-1 text-sm font-bold text-white">{workRequest.Percentage}% · {workRequest.WorkRequestSubstatus}</span>
          <label className="text-sm">Act as LJ Role<select aria-label="Act as LJ Role" value={role} onChange={(e) => setActingRole(e.target.value)} className="ml-2 rounded border px-2 py-1">{LJRoleEnum.options.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <button onClick={printYellowPage} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950">Print Yellow Page</button>
          <button aria-label="Close LJ Details Popup" onClick={onClose} className="rounded px-3 py-2 text-xl hover:bg-slate-100">×</button>
        </div>
      </header>
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b bg-white px-3 pt-2" aria-label="Long Job detail tabs">
        {TABS.map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}
          className={`shrink-0 rounded-t-md border px-3 py-2 text-sm ${tab === item ? "border-blue-600 bg-blue-50 font-semibold text-blue-800" : "border-transparent text-slate-600 hover:bg-slate-50"}`}>{item}</button>)}
      </nav>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === TABS[0] && <div className="space-y-4">
          {group("Long Job Core", <>
            {field("WR ID", workRequest.WR_ID)}{field("Process (RFQ/RFW)", track)}{field("Work request status", workRequest.WorkRequestStatus)}
            {field("Current Substatus", `${workRequest.Percentage}% ${workRequest.WorkRequestSubstatus}`)}{field("Substatus Description", workRequest.WorkRequestSubstatus)}
            {field("Trade", workRequest.TradeName ?? workRequest.TradeId)}
            {field("Estimated Cost (≥ 750 EUR)", <label className="flex items-center gap-2"><input aria-label="Estimated Cost (minimum 750 EUR)" type="number" min="750" step="0.01"
              value={workRequest.EstimatedCostEur ?? 750} onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= 750) update((wr) => ({ ...wr, EstimatedCostEur: value }));
              }} onBlur={(e) => {
                if (Number(e.currentTarget.value) < 750) window.alert("Long Job estimated cost must be at least 750 EUR.");
              }} className="w-36 rounded border px-2 py-1" /> EUR</label>)}{field("Actual Cost", `${workRequest.ActualCostEur ?? 0} EUR`)}
            {field("Created Date", workRequest.CreatedDate)}{field("Due Date", workRequest.DueDate)}{field("Margin Date", workRequest.MarginDate)}
            {field("Originating FJ WR ID", workRequest.OriginatingFJ_WR_ID ? <button className="text-blue-700 underline" onClick={() => onNavigate(workRequest.OriginatingFJ_WR_ID!)}>{workRequest.OriginatingFJ_WR_ID}</button> : "—")}
            {field("Parent PM WR ID", workRequest.ParentPM_WR_ID ? <button className="text-blue-700 underline" onClick={() => onNavigate(workRequest.ParentPM_WR_ID!)}>{workRequest.ParentPM_WR_ID}</button> : "—")}
          </>)}
          {group("Work Location & Equipment", <>{field("bl id", workRequest.bl_id)}{field("Level name", workRequest.LevelName)}{field("Room code", workRequest.RoomCode)}{field("Problem location", workRequest.ProblemLocation)}{field("Equipment", workRequest.EquipmentCodes.join(", "))}</>)}
          {group("Assigned Trade & ESA Roles", <>{roles.map((key) => <label key={key} className="text-sm">{ROLE_LABEL[key]} ({key})
            <select value={workRequest.AssignedRoles?.[key] ?? ""} onChange={(e) => changeAssignedRole(key, e.target.value)} className="mt-1 block w-full rounded border px-2 py-2">
              <option value="">Unassigned</option>{roleUsers(key).map((user) => <option key={user.UserId} value={user.UserId}>{user.DisplayName}</option>)}
            </select></label>)}</>)}
        </div>}
        {tab === TABS[1] && <section className="space-y-4 rounded border bg-white p-4">
          <h3 className="font-semibold">Quotation, Budget &amp; Ordering</h3><div className="flex flex-wrap gap-2">
            {(track === "RFQ" ? [0, 10, 20, 21, 23, 25, 26, 28] : [0, 10, 30, 31, 32]).map((percent) => <button key={percent}
              disabled={percent !== (track === "RFQ" ? [0, 10, 20, 21, 23, 25, 26, 28] : [0, 10, 30, 31, 32]).find((value) => value > workRequest.Percentage)}
              onClick={() => stage(percent, percent === 31 ? "On Hold for Budget" : `${track} stage ${percent}%`, { ProcessTrack: track }, ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_CCM", "TRADE_TM", "TRADE_CM"])}
              className="rounded bg-indigo-700 px-3 py-2 text-sm text-white disabled:opacity-40">{percent}% {percent === 31 ? "On Hold for Budget" : ""}</button>)}
            {track === "RFQ" && <button disabled={workRequest.Percentage !== 28} onClick={() => stage(30, "Converted RFQ to RFW", { ProcessTrack: "RFW" }, ["ESA_TO", "ESA_TM", "ESA_LJM"])} className="rounded bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-40">Convert RFQ to RFW (30%)</button>}
          </div>
          <div className="flex items-center justify-between"><h4 className="font-medium">Quotation line items</h4><button type="button" onClick={() => update((wr) => ({ ...wr, QuotationLines: [...(wr.QuotationLines ?? []), { id: crypto.randomUUID(), description: "", quantity: 1, unitCostEur: 0 }] }), `Quotation line added by ${actorName}`)} className="rounded border px-3 py-1 text-sm">+ Add line</button></div>
          <div className="space-y-2">{(workRequest.QuotationLines ?? []).map((line) => <div key={line.id} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <input aria-label="Quotation line description" value={line.description} onChange={(e) => update((wr) => ({ ...wr, QuotationLines: (wr.QuotationLines ?? []).map((item) => item.id === line.id ? { ...item, description: e.target.value } : item) }))} placeholder="Description" className="rounded border px-2 py-1" />
            <input aria-label="Quotation quantity" type="number" min="0" value={line.quantity} onChange={(e) => update((wr) => ({ ...wr, QuotationLines: (wr.QuotationLines ?? []).map((item) => item.id === line.id ? { ...item, quantity: Number(e.target.value) } : item) }))} className="rounded border px-2 py-1" />
            <input aria-label="Quotation unit cost" type="number" min="0" step="0.01" value={line.unitCostEur} onChange={(e) => update((wr) => ({ ...wr, QuotationLines: (wr.QuotationLines ?? []).map((item) => item.id === line.id ? { ...item, unitCostEur: Number(e.target.value) } : item) }))} className="rounded border px-2 py-1" />
            <button type="button" onClick={() => update((wr) => ({ ...wr, QuotationLines: (wr.QuotationLines ?? []).filter((item) => item.id !== line.id) }), `Quotation line removed by ${actorName}`)} className="text-red-700">Remove</button>
          </div>)}</div>
          <p className="text-sm text-slate-600">Quotation total: {(workRequest.QuotationLines ?? []).reduce((total, item) => total + item.quantity * item.unitCostEur, 0).toFixed(2)} EUR · Estimate: {workRequest.EstimatedCostEur ?? 0} EUR · Actual: {workRequest.ActualCostEur ?? 0} EUR</p>
          <div className="flex flex-wrap gap-2">{roles.map((key) => <span key={key} className="rounded bg-slate-100 px-2 py-1 text-xs">{key}: {workRequest.AssignedRoles?.[key] ?? "Unassigned"}</span>)}</div>
        </section>}
        {tab === TABS[2] && <section className="space-y-4 rounded border bg-white p-4">
          <h3 className="font-semibold">Execution, Labor &amp; Freeze</h3><div className="flex flex-wrap gap-2">
            <button disabled={workRequest.Percentage !== 32} onClick={() => stage(40, "Commit", {}, ["ESA_TO", "ESA_TM", "TRADE_TM"])} className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-40">40% Commit</button>
            <button disabled={workRequest.Percentage !== 40 && workRequest.Percentage !== 55} onClick={() => stage(50, "Work Execution / Resume Work", {}, ["TRADE_TM", "TRADE_LONG_JOB"])} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-40">50% Execution / Resume Work</button>
            {(["Access", "Labor", "Parts"] as const).map((reason) => <button key={reason} disabled={workRequest.Percentage !== 50} onClick={() => stage(55, `On Hold for ${reason}`, { IsFrozen: true, FreezeReason: reason, ActiveFreezeName: `Waiting for ${reason}`, PlannedFreezeText: `On Hold for ${reason}` }, ["TRADE_TM", "TRADE_LONG_JOB"])} className="rounded bg-amber-600 px-3 py-2 text-white disabled:opacity-40">55% On Hold for {reason}</button>)}
          </div>
          <label className="text-sm font-medium">Assign Craftperson<select aria-label="Assign Craftperson to Long Job" value="" onChange={(e) => {
            const person = data.craftspeople.find((item) => item.id === e.target.value && item.SiteId === activeSiteId);
            if (!person || (workRequest.CraftpersonLabor ?? []).some((line) => line.craftpersonId === person.id)) return;
            update((wr) => ({ ...wr, CraftpersonLabor: [...(wr.CraftpersonLabor ?? []), {
              craftpersonId: person.id, hourlyRate: person.HourlyRate, workingTimeMinutes: 0, name: person.Name, lastName: person.LastName,
            }] }), `${person.Name} ${person.LastName} assigned by ${actorName}`);
          }} className="ml-3 rounded border px-3 py-2"><option value="">Select craftperson</option>{data.craftspeople.filter((item) => item.SiteId === activeSiteId).map((person) => <option key={person.id} value={person.id}>{person.Name} {person.LastName} — {person.Trade}</option>)}</select></label>
          <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Hourly rate", "Working time (minutes)", "Name", "LastName", "Action"].map((item) => <th key={item} className="p-3">{item}</th>)}</tr></thead><tbody>
            {(workRequest.CraftpersonLabor ?? []).map((person) => <tr key={person.craftpersonId} className="border-t">
              <td className="p-3"><input type="number" min="0" step="0.01" value={person.hourlyRate} onChange={(e) => update((wr) => ({ ...wr, CraftpersonLabor: (wr.CraftpersonLabor ?? []).map((line) => line.craftpersonId === person.craftpersonId ? { ...line, hourlyRate: Number(e.target.value) } : line) }))} className="w-24 rounded border px-2 py-1" /> EUR</td>
              <td className="p-3"><input type="number" min="0" value={person.workingTimeMinutes} onChange={(e) => update((wr) => ({ ...wr, CraftpersonLabor: (wr.CraftpersonLabor ?? []).map((line) => line.craftpersonId === person.craftpersonId ? { ...line, workingTimeMinutes: Number(e.target.value) } : line) }))} className="w-28 rounded border px-2 py-1" /></td>
              <td className="p-3">{person.name}</td><td className="p-3">{person.lastName}</td><td className="p-3"><button onClick={() => update((wr) => ({ ...wr, CraftpersonLabor: (wr.CraftpersonLabor ?? []).filter((line) => line.craftpersonId !== person.craftpersonId) }), `${person.name} ${person.lastName} removed by ${actorName}`)} className="text-red-700">Remove</button></td></tr>)}
            {!workRequest.CraftpersonLabor?.length && <tr><td colSpan={5} className="p-3 text-slate-500">No craftspeople assigned.</td></tr>}</tbody></table></div>
          <button disabled={workRequest.Percentage !== 50 && workRequest.Percentage !== 55} onClick={() => stage(required ? 78 : 94, required ? "Technically Completed" : "All acceptance gates waived", {}, ["TRADE_TM", "TRADE_LONG_JOB", "ESA_IM"])} className="rounded bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Technically Completed ({required ? "78%" : "94%"})</button>
          <p className="text-xs text-slate-500">Acceptance configured: {required ? "Yes" : "No"}; SLA margin dates remain available in the core record.</p>
        </section>}
        {tab === TABS[3] && <section className="space-y-4 rounded border bg-white p-4">
          <h3 className="font-semibold">Acceptances: SAT, Drawing &amp; Inventory</h3>
          <div className="flex flex-wrap gap-4">{([
            ["RequiresSAT", "Requires SAT"], ["RequiresDrawingUpdate", "Requires Drawing/Engineering Update"], ["RequiresInventoryUpdate", "Requires CIFM Inventory Update"],
          ] as const).map(([fieldName, label]) => <label key={fieldName} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(workRequest[fieldName])} onChange={(e) => update((wr) => ({ ...wr, [fieldName]: e.target.checked }), `${label} ${e.target.checked ? "enabled" : "disabled"} by ${actorName}`)} />{label}</label>)}</div>
          {workRequest.RequiresSAT && <article className="rounded border p-4"><h4 className="font-semibold">Pre-SAT [TRADE_TM]</h4><p className="my-2 text-sm">Status: {workRequest.PreSATApproved ? "Approved" : "Pending"}</p><button disabled={Boolean(workRequest.PreSATApproved) || role !== "TRADE_TM" || workRequest.Percentage < 78 || workRequest.Percentage >= 94} onClick={() => stage(Math.max(79, workRequest.Percentage), "Pre-SAT Approved", { PreSATApproved: true }, ["TRADE_TM"])} className="mr-2 rounded bg-green-700 px-3 py-2 text-white disabled:opacity-50">Approve / Give OK</button></article>}
          {([
            ["SAT", "SAT [ESA_TO/ESA_TM]", Boolean(workRequest.RequiresSAT)],
            ["DrawingEngineering", "Drawing/Engineering [ESA_DO Draftsman]", Boolean(workRequest.RequiresDrawingUpdate)],
            ["CIFMInventory", "CIFM Inventory [ESA_IM]", Boolean(workRequest.RequiresInventoryUpdate)],
          ] as const).map(([type, title, enabled]) => <article key={type} className="rounded border p-4"><h4 className="font-semibold">{title}</h4><p className="my-2 text-sm">Status: {enabled ? gateState(type)?.Status ?? "Pending" : "Not required"}</p>
            <div className="flex flex-wrap gap-2"><button disabled={!enabled || workRequest.Percentage < 78 || workRequest.Percentage >= 94 || gateState(type)?.Status === "Approved"} onClick={() => approveGate(type)} className="rounded bg-green-700 px-3 py-2 text-white disabled:opacity-50">Approve / Give OK</button>
              <button disabled={!enabled || workRequest.Percentage < 78 || workRequest.Percentage >= 94 || gateState(type)?.Status === "Approved"} onClick={() => gateAction(type, "ReviewRequested")} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">Request Review</button>
              <button disabled={!enabled || workRequest.Percentage < 78 || workRequest.Percentage >= 94 || gateState(type)?.Status === "Approved"} onClick={() => gateAction(type, "InvitationSent")} className="rounded bg-indigo-700 px-3 py-2 text-white disabled:opacity-50">Send Invitation</button></div>
          </article>)}
        </section>}
        {tab === TABS[4] && <section className="space-y-4 rounded border bg-white p-4">
          <h3 className="font-semibold">Financial Closure &amp; Yellow Page</h3>
          <div className="flex flex-wrap gap-2">{([
            [95, "95% Completed - Cost Info + Customer Feedback by TRADE_TM"],
            [96, "96% Sign Yellow Page by TRADE_CM"],
            [97, "97% Approve Costs by ESA_TO/ESA_TM"],
            [98, "98% Final Approval by ESA_TO"],
            [99, "99% Confirm Invoice Information by ESA_TO/ESA_CCM"],
            [100, "100% Confirm Payment by TRADE_CM/TRADE_TM"],
          ] as const).map(([percent, label]) => <button key={percent} disabled={workRequest.Percentage !== percent - 1} onClick={() => stage(percent, label, {}, percent === 95 ? ["TRADE_TM"] : percent === 96 ? ["TRADE_CM"] : percent === 97 ? ["ESA_TO", "ESA_TM"] : percent === 98 ? ["ESA_TO"] : percent === 99 ? ["ESA_TO", "ESA_CCM"] : ["TRADE_CM", "TRADE_TM"])} className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-40">{label}</button>)}
            <button disabled={workRequest.Percentage !== 100 || Boolean(workRequest.ArchivedAt)} onClick={() => stage(100, "100% archived", { ArchivedAt: new Date().toISOString() })} className="rounded bg-amber-500 px-3 py-2 font-bold disabled:opacity-40">100% archived</button>
          </div>
          <article id="yellow-page" className="rounded border-2 border-amber-300 bg-amber-50 p-6 print:border-black print:bg-white">
            <h4 className="text-center text-xl font-bold">Official Yellow Page Preview</h4><dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {field("WR ID", workRequest.WR_ID)}{field("Description", workRequest.Description)}{field("Process", track)}{field("Trade", workRequest.TradeName ?? workRequest.TradeId)}
              {field("Estimated cost", `${workRequest.EstimatedCostEur ?? 0} EUR`)}{field("Actual cost", `${workRequest.ActualCostEur ?? 0} EUR`)}
              {field("Location", `${workRequest.bl_id ?? ""} / ${workRequest.LevelName ?? ""} / ${workRequest.RoomCode ?? ""}`)}
              {field("Acceptance approvals", gates.filter((gate) => gate.Status === "Approved").map((gate) => `${gate.GateType}: ${gate.ApprovedBy} (${gate.ApprovedAt})`).join("; ") || "None")}
              {roles.map((key) => field(`${ROLE_LABEL[key]} signature`, workRequest.AssignedRoles?.[key] ?? "Pending"))}
              {field("Archived at", workRequest.ArchivedAt ?? "Not archived")}
            </dl>
          </article>
        </section>}
        {tab === TABS[5] && <section className="space-y-4 rounded border bg-white p-4">
          <h3 className="font-semibold">Attached Documents</h3><label className="inline-flex cursor-pointer rounded bg-blue-700 px-4 py-2 text-white">+ New LJ Document<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) attach(file); e.currentTarget.value = ""; }} /></label>
          {(workRequest.Attachments ?? []).map((doc) => <div key={doc.id} className="flex items-center justify-between border-b py-3"><span>{doc.name}</span><div className="flex gap-3"><a href={doc.dataUrl} target="_blank" rel="noreferrer" onClick={() => update((wr) => wr, `LJ document '${doc.name}' opened by ${actorName}`)} className="text-blue-700 underline">Open</a><button onClick={() => update((wr) => ({ ...wr, Attachments: (wr.Attachments ?? []).filter((item) => item.id !== doc.id) }), `LJ document '${doc.name}' deleted by ${actorName}`)} className="text-red-700">Delete</button></div></div>)}
        </section>}
      </main>
      <section className="shrink-0 border-t bg-white">
        <button aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)} className="flex w-full items-center justify-between px-5 py-3 font-semibold">History <span>{historyOpen ? "−" : "+"}</span></button>
        {historyOpen && <div className="max-h-64 space-y-3 overflow-y-auto px-5 pb-4">
          <div className="flex flex-wrap items-center gap-2">{([["all", "All"], ["comment", "Human Comments Only"], ["log", "Automatic Logs Only"]] as const).map(([key, label]) => <button key={key} aria-pressed={historyFilter === key} onClick={() => setHistoryFilter(key)} className={`rounded px-3 py-1 text-sm ${historyFilter === key ? "bg-blue-700 text-white" : "bg-slate-100"}`}>{label}</button>)}
            <label className="ml-auto flex items-center gap-2 text-sm">Message text<input value={message} onChange={(e) => setMessage(e.target.value)} className="rounded border px-2 py-1" /></label><button onClick={post} disabled={!message.trim()} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">Post</button>
          </div>
          {(workRequest.Activity ?? []).filter((entry) => historyFilter === "all" || entry.kind === historyFilter).slice().reverse().map((entry) => <article key={entry.id} className="border-b pb-2 text-sm">
            <div className="text-xs text-slate-500">{entry.actorName} ({entry.actorRole}) · {new Date(entry.createdAt).toLocaleString()} · {entry.kind === "comment" ? "Human comment" : "Automatic log"}</div>
            {editing === entry.id ? <><textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-2 w-full rounded border p-2" /><button onClick={() => saveEdit(entry.id)} className="text-blue-700">Save</button></> : <p>{entry.text}</p>}
            {entry.kind === "comment" && entry.actorId === actorId && editing !== entry.id && <button onClick={() => { setEditing(entry.id); setDraft(entry.text); }} className="text-blue-700">Edit</button>}
            {!!entry.editHistory?.length && <details><summary>Prior versions</summary>{entry.editHistory.map((version, index) => <p key={`${entry.id}-${index}`} className="border-l pl-2 text-slate-600">{new Date(version.timestamp).toLocaleString()} — {version.text}</p>)}</details>}
          </article>)}
        </div>}
      </section>
    </section>
  </div>;
}

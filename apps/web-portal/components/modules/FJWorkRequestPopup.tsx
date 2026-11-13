"use client";
import { FieldUpdateBadges } from "./FieldUpdateBadges";

import React, { useEffect, useState } from "react";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import { getParentPM, getUnfavourableStepCount } from "@/lib/wr-signals";
import { WRChecklistReview } from "./WRChecklistReview";
import { WRDetailsEditor } from "@/components/modules/WRDetailsEditor";
import { WorkRequestLabor } from "@/components/modules/WorkRequestLabor";
import { TechnicianTodoList } from "@/components/modules/TechnicianTodoList";
import { assignPerson } from "@/lib/dispatch";
import { FreezeBadge } from "@/components/modules/FreezeSafetyGate";
import { getWorkRequestFreezes, localNowIso } from "@/lib/location-freezes";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { WR_Statuses } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { QAAuditPanel } from "@/components/modules/QAAuditPanel";
import { hasOpenQARework } from "@/lib/qa-settings";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { ResizableHistory } from "@/components/common/ResizableHistory";
import { newestFirst } from "@/lib/history-order";
import { LocateInBimButton, OpenRoomInBimButton } from "@/components/common/LocateInBim";
import { PhotoCapture } from "@/components/common/PhotoCapture";
import { DissatisfactionPanel, RatingEmailModal } from "@/components/modules/FJSatisfactionPanels";
import { isCompletedFj } from "@/lib/fj-satisfaction";
import { isWrTerminal } from "./scheduler/scheduler-rules";
import { canCloseWorkRequestAt100 } from "@/lib/wr-transition-rules";

type Tab = "Work request details" | "Labor, parts & Completion" | "Technician To-Do & AI Task List" | "Attached Documents" | "AuditLog & QA" | "Checklist - Smart PM";

export function FJWorkRequestPopup({ workRequest, onClose, onNavigate, onEscalateToLJ, initialTab = "Work request details" }: {
  workRequest: BaseWorkRequest;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onEscalateToLJ: (wr: BaseWorkRequest) => void;
  initialTab?: Tab;
}) {
  const { data, setData } = useCafmStore();
  const { permissions, profile } = useActiveUserPermissions();
  const { currentUser, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const terminalReadOnly = isWrTerminal(workRequest);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [ratingMailOpen, setRatingMailOpen] = useState(false);
  const canFollowUp = !!(profile?.isSuperAdmin || profile?.isSiteAdmin || profile?.isHelpdesk || ["SuperAdmin", "SiteAdministrator", "TeamLeader", "ESA_TM", "TRADE_TM", "HELPDESK"].includes(String(currentRole)));
  useEffect(() => { setTab(initialTab); }, [initialTab, workRequest.WR_ID]);
  const parentPM = getParentPM(workRequest, data.workRequests);
  const unfavourableCount = getUnfavourableStepCount(workRequest, data);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<"all" | "comment" | "log">("all");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const actorId = currentUser?.UserId ?? "current-user";
  const actorName = currentUser?.DisplayName ?? "Current user";

  const update = (change: (wr: BaseWorkRequest) => BaseWorkRequest, log?: string) => {
    const now = new Date().toISOString();
    setData((state) => ({ ...state, workRequests: state.workRequests.map((wr) => {
      if (wr.WR_ID !== workRequest.WR_ID || wr.SiteId !== workRequest.SiteId) return wr;
      const changed = change(wr);
      return { ...changed, UpdatedAt: now, ...(log ? { Activity: [...(changed.Activity ?? []), {
        id: crypto.randomUUID(), kind: "log" as const, actorId, actorName, actorRole: currentRole, createdAt: now, text: log,
      }] } : {}) };
    }) }));
  };
  const post = () => {
    if (!message.trim()) return;
    const now = new Date().toISOString();
    update((wr) => ({ ...wr, Activity: [...(wr.Activity ?? []), {
      id: crypto.randomUUID(), kind: "comment", actorId, actorName, actorRole: currentRole,
      createdAt: now, text: message.trim(), editHistory: [],
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
  const transition = (percentage: number, label: string) => {
    if (terminalReadOnly) { window.alert("Closed or cancelled work requests are read-only."); return; }
    if ((percentage === 78 && !permissions?.canCompleteWR78) || (percentage === 100 && !permissions?.canCloseWR100)) { window.alert("You do not have permission for this status transition."); return; }
    if (percentage === 100 && hasOpenQARework(workRequest)) { window.alert("QA rework must be verified before closing."); return; }
    const configured = WR_Statuses.find((status) => status.ESAWorkType === workRequest.ESAWorkType && status.Percentage === percentage);
    if ([50, 78, 100].includes(percentage) && !configured) {
      window.alert(`No WR_Statuses configuration exists for ${percentage}% ${workRequest.ESAWorkType}.`);
      return;
    }
    if (percentage === 100 && !canCloseWorkRequestAt100(workRequest)) {
      window.alert("Complete (100%) is available only after Technically Completed (78%).");
      return;
    }
    update((wr) => ({
      ...wr, Percentage: percentage,
      WorkRequestStatus: percentage === 55 ? "On Hold" : percentage === 27 ? "Cancelled" : configured!.WorkRequestStatus,
      WorkRequestSubstatus: percentage === 55 ? "On Hold" : percentage === 27 ? "Cancelled" : configured!.WorkRequestSubstatus,
      IsFrozen: percentage === 55,
    }), `${label} (${workRequest.Percentage}% to ${percentage}%) by ${actorName}`);
  };
  const attach = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => window.alert(`Could not read ${file.name}.`);
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        window.alert(`Could not read ${file.name}.`);
        return;
      }
      update((wr) => ({ ...wr, Attachments: [...(wr.Attachments ?? []), {
        id: crypto.randomUUID(), name: file.name, type: file.type, dataUrl: reader.result as string,
      }] }), `Document '${file.name}' was added by ${actorName}`);
    };
    reader.readAsDataURL(file);
  };
  const tabs: Tab[] = ["Work request details", "Labor, parts & Completion", "Technician To-Do & AI Task List", "Attached Documents", "AuditLog & QA", "Checklist - Smart PM"];
  const group = (title: string, children: React.ReactNode) => <details open className="rounded border bg-white">
    <summary className="cursor-pointer bg-slate-50 px-4 py-3 font-semibold">{title}</summary>
    <div className="grid gap-3 p-4 sm:grid-cols-2">{children}</div>
  </details>;
  const field = (label: string, value: React.ReactNode) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm">{value || "—"}</dd></div>;
  const craftpeople = data.craftspeople.filter((item) => item.SiteId === workRequest.SiteId);

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
    <section role="dialog" aria-modal="true" aria-label="FJ Details Popup" className="flex h-[95vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden rounded-xl bg-slate-100 shadow-2xl">
      <header className="flex items-center justify-between border-b bg-white px-5 py-3">
        <div><h2 className="text-xl font-bold">FJ Details Popup</h2><p className="text-sm text-slate-600">{workRequest.WR_ID} · {workRequest.Description}</p></div>
        <div className="flex items-center gap-3"><span className="rounded bg-green-100 px-3 py-1 text-sm font-semibold">Fast Job · {workRequest.Percentage}%</span>
          {(() => {
            const bimAsset = data.equipment.find((item) => item.SiteId === workRequest.SiteId && workRequest.EquipmentCodes.includes(item.EquipmentCode));
            return <LocateInBimButton siteId={workRequest.SiteId} buildingId={workRequest.bl_id} bimBuildingId={bimAsset?.bimBuildingId}
              equipmentCode={bimAsset?.EquipmentCode ?? workRequest.EquipmentCodes[0]} hasBimLink={!!bimAsset?.bimGlobalId} />;
          })()}
          <OpenRoomInBimButton siteId={workRequest.SiteId} buildingId={workRequest.bimPin?.buildingId ?? workRequest.bl_id}
            roomCode={workRequest.RoomCode} wrId={workRequest.WR_ID} hasPin={!!workRequest.bimPin} />
          <button aria-label="Close FJ Details Popup" onClick={onClose} className="rounded px-3 py-2 text-xl hover:bg-slate-100">×</button></div>
      </header>
      <FieldUpdateBadges wr={workRequest} />
      <nav className="flex shrink-0 gap-1 border-b bg-white px-3 pt-2" aria-label="Fast Job detail tabs">
        {tabs.map((item) => <button key={item} role="tab" aria-label={item} title={item} aria-selected={tab === item} onClick={() => setTab(item)}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-t-md border px-3 py-2 text-xs font-medium whitespace-nowrap ${tab === item ? "border-blue-600 bg-blue-50 font-semibold text-blue-800" : "border-transparent text-slate-600 hover:bg-slate-50"}`}><span className="min-w-0 truncate">{item}</span>{item === "Checklist - Smart PM" && unfavourableCount > 0 && <span className="shrink-0 rounded-full bg-rose-100 px-1.5 text-rose-900">{unfavourableCount}</span>}</button>)}
      </nav>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {parentPM && <div className="mb-3 rounded-xl border border-indigo-300 bg-indigo-50 p-3 text-indigo-900"><strong>🔗 Follow-up of PM #{parentPM.WR_ID}</strong><p>{parentPM.Description}</p>{workRequest.originatingChecklistStepLabel && <p>Checklist step: {workRequest.originatingChecklistStepLabel}</p>}<button type="button" className="mt-1 font-semibold underline" onClick={() => onNavigate(parentPM.WR_ID)}>Open parent PM →</button></div>}
        {(() => { const frozen = getWorkRequestFreezes(workRequest, data.locationFreezes ?? [], localNowIso()); return frozen.length > 0 ? <div className="mb-3"><FreezeBadge freezes={frozen} /></div> : null; })()}        {tab === "Work request details" && <div className="space-y-4">
          <WRDetailsEditor workRequest={workRequest} />
          {isCompletedFj(workRequest) && <div className="flex items-center gap-2 text-xs">
            <button type="button" onClick={() => setRatingMailOpen(true)} className="rounded border bg-white px-3 py-1">✉ Simulate / Open Requestor Rating Email</button>
            <span className="text-slate-500">{workRequest.Satisfaction ? `Survey ${workRequest.Satisfaction.status === "Answered" ? "answered" : "pending"}` : ""}</span>
          </div>}
          <DissatisfactionPanel wr={workRequest} canEdit={canFollowUp} actorName={actorName} onReopen={() => { update((wr) => ({ ...wr, Percentage: 50, WorkRequestStatus: "Issued", WorkRequestSubstatus: "Issued", Satisfaction: wr.Satisfaction ? { ...wr.Satisfaction, followUpStatus: "In_Progress" } : wr.Satisfaction }), `FJ reopened for rework after dissatisfaction feedback by ${actorName}`); }} />
          {ratingMailOpen && <RatingEmailModal wr={workRequest} onClose={() => setRatingMailOpen(false)} />}
          {group("Fast Job Details", <>
            {field("WR ID", workRequest.WR_ID)}{field("Job ID", workRequest.JobID)}
            {field("Work request status", workRequest.WorkRequestStatus)}{field("Work request substatus", `${workRequest.Percentage}% ${workRequest.WorkRequestSubstatus}`)}
            {field("Urgency", workRequest.Urgency)}{field("Trade name", workRequest.TradeName)}
            {field("SLA target", workRequest.SlaTargetLabel)}{field("SLA start", workRequest.SlaStartAt ? formatDateTimeDDMMYYYY(workRequest.SlaStartAt) : "")}
            {field("SLA due", workRequest.SlaDueAt ? formatDateTimeDDMMYYYY(workRequest.SlaDueAt) : "")}{field("SLA margin", workRequest.SlaMarginAt ? formatDateTimeDDMMYYYY(workRequest.SlaMarginAt) : "")}
            {field("Opened by", workRequest.OpenedByName ? `${workRequest.OpenedByName}${workRequest.OpenedByRole ? ` (${workRequest.OpenedByRole})` : ""}` : "")}{field("Intake channel", workRequest.IntakeChannel)}
            {field("Requestor", workRequest.RequestorName)}{field("Requestor email / phone", [workRequest.RequestorEmail, workRequest.RequestorPhone].filter(Boolean).join(" · "))}{field("Requestor department", workRequest.RequestorDepartment)}
            {field("Estimated Cost (< 750 EUR)", <label className="flex items-center gap-2"><input aria-label="Estimated Cost (< 750 EUR)" type="number" min="0" max="749.99" step="0.01"
              value={workRequest.EstimatedCostEur ?? 0} onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= 0 && value < 750) update((wr) => ({ ...wr, EstimatedCostEur: value }));
              }} onBlur={(e) => {
                if (Number(e.currentTarget.value) >= 750) window.alert("Fast Job estimated cost must be below 750 EUR. Escalate it to a Long Job instead.");
              }} className="w-36 rounded border px-2 py-1" /> EUR</label>)}{field("Actual Cost (EUR)", `${workRequest.ActualCostEur ?? 0} EUR`)}
            {field("Created date", formatDateDDMMYYYY(workRequest.CreatedDate))}{field("Start date", formatDateDDMMYYYY(workRequest.StartDate))}
            {field("Due date", formatDateDDMMYYYY(workRequest.DueDate))}{field("Margin date", formatDateDDMMYYYY(workRequest.MarginDate))}
            {field("Parent PM WR ID", parentPM ? <button className="text-blue-700 underline" onClick={() => onNavigate(parentPM.WR_ID)}>{parentPM.WR_ID}</button> : "—")}
            {workRequest.OriginatingWR_ID && field("Originating QA WR ID", <button className="text-blue-700 underline" onClick={() => onNavigate(workRequest.OriginatingWR_ID!)}>{workRequest.OriginatingWR_ID}</button>)}
          </>)}
          {group("Work Location", <>{field("Room code", workRequest.RoomCode)}{field("Level name", workRequest.LevelName)}{field("bl id", workRequest.bl_id)}{field("Problem location", workRequest.ProblemLocation)}</>)}
          {group("Equipment", <>{field("Equipment code", workRequest.EquipmentCodes.join(", "))}{field("Local equipment code", workRequest.EquipmentCodes.map((code) => data.equipment.find((item) => item.EquipmentCode === code)?.LocalEquipmentCode).filter(Boolean).join(", "))}
            {field("Equipment name", workRequest.EquipmentCodes.map((code) => data.equipment.find((item) => item.EquipmentCode === code)?.EquipmentName).filter(Boolean).join(", "))}
            {field("Hierarchy Level", workRequest.EquipmentCodes.map((code) => data.equipment.find((item) => item.EquipmentCode === code)?.IsInstallation ? "Installation" : "Subequipment / SubSubEquipment").join(", "))}</>)}
        </div>}
        {tab === "Labor, parts & Completion" && <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Assign Craftperson</h3>
            {terminalReadOnly && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Read-only · labor history retained</span>}
            <label className={`rounded bg-blue-700 px-3 py-2 text-sm font-semibold text-white ${terminalReadOnly ? "opacity-40" : ""}`}>Assign Craftperson
              <select aria-label="Assign Craftperson" disabled={terminalReadOnly} className="ml-2 rounded text-slate-900" value="" onChange={(e) => {
                if (terminalReadOnly) { window.alert("Closed or cancelled work requests cannot be assigned."); return; }
                const person = craftpeople.find((item) => item.id === e.target.value);
                if (!person || workRequest.AssignedCraftpersonIds.includes(person.id)) return;
                update((wr) => assignPerson(wr, {
                  craftpersonId: person.id, hourlyRate: person.HourlyRate, workingTimeMinutes: 0,
                  name: person.Name, lastName: person.LastName,
                }), `${currentRole} ${activePerson} assigned craftperson ${person.Name} ${person.LastName} (${person.Trade}).`);
              }}><option value="">Select…</option>{craftpeople.map((person) => <option key={person.id} value={person.id}>{person.Name} {person.LastName} ({person.Trade})</option>)}</select>
            </label>
          </div>
          <WorkRequestLabor wr={workRequest} people={craftpeople} absences={data.craftpersonAbsences} freezes={data.locationFreezes} update={update} onClose={onClose} activePerson={activePerson} actorRole={currentRole} canOverride={!!permissions?.canOverwriteLaborTime} />
          <section className="rounded border bg-white p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Spare parts / materials</h3><button type="button" onClick={() => update((wr) => ({ ...wr, SpareParts: [...(wr.SpareParts ?? []), { id: crypto.randomUUID(), description: "", quantity: 1, unitCostEur: 0 }] }), `Spare part row added by ${actorName}`)} className="rounded border px-3 py-1 text-sm">+ Add Part</button></div>
            <div className="mt-3 space-y-2">{(workRequest.SpareParts ?? []).map((part) => <div key={part.id} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <input aria-label="Spare part description" value={part.description} onChange={(e) => update((wr) => ({ ...wr, SpareParts: (wr.SpareParts ?? []).map((item) => item.id === part.id ? { ...item, description: e.target.value } : item) }))} placeholder="Description" className="rounded border px-2 py-1" />
              <input aria-label="Spare part quantity" type="number" min="0" value={part.quantity} onChange={(e) => update((wr) => ({ ...wr, SpareParts: (wr.SpareParts ?? []).map((item) => item.id === part.id ? { ...item, quantity: Number(e.target.value) } : item) }))} className="rounded border px-2 py-1" />
              <input aria-label="Spare part unit cost" type="number" min="0" step="0.01" value={part.unitCostEur} onChange={(e) => update((wr) => ({ ...wr, SpareParts: (wr.SpareParts ?? []).map((item) => item.id === part.id ? { ...item, unitCostEur: Number(e.target.value) } : item) }))} className="rounded border px-2 py-1" />
              <button type="button" onClick={() => update((wr) => ({ ...wr, SpareParts: (wr.SpareParts ?? []).filter((item) => item.id !== part.id) }), `Spare part '${part.description}' removed by ${actorName}`)} className="text-red-700">Remove</button>
            </div>)}</div>
            <p className="mt-2 text-sm text-slate-600">Materials total: {(workRequest.SpareParts ?? []).reduce((total, item) => total + item.quantity * item.unitCostEur, 0).toFixed(2)} EUR</p>
            <label className="mt-3 block text-sm">Actual Cost (EUR)<input type="number" min="0" value={workRequest.ActualCostEur ?? 0} onChange={(e) => update((wr) => ({ ...wr, ActualCostEur: Number(e.target.value) }))} className="ml-3 w-36 rounded border px-2 py-1" /></label>
          </section>
          <div className="flex flex-wrap gap-2">{[
            ["Cancel WR (27%)", 27], ["On Hold (55%)", 55], ["Technically Completed (78%)", 78], ["Complete (100%)", 100],
          ].map(([label, percent]) => <button key={label} title={percent === 100 && !canCloseWorkRequestAt100(workRequest) ? "Complete (100%) is available only after Technically Completed (78%)." : undefined} disabled={terminalReadOnly || (percent === 78 && !permissions?.canCompleteWR78) || (percent === 100 && (!permissions?.canCloseWR100 || !canCloseWorkRequestAt100(workRequest)))} onClick={() => transition(Number(percent), String(label))} className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{label}</button>)}
            <button disabled={!permissions?.canCreateLJ} onClick={() => {
              if (!permissions?.canCreateLJ) { window.alert("Permission required to create a Long Job."); return; }
              let estimatedCost = workRequest.EstimatedCostEur ?? 0;
              if (estimatedCost < 750) {
                estimatedCost = Number(window.prompt("Enter revised estimated cost in EUR (minimum 750):", "750"));
                if (!Number.isFinite(estimatedCost) || estimatedCost < 750) { window.alert("Long Job escalation requires an estimate of at least 750 EUR."); return; }
                update((wr) => ({ ...wr, EstimatedCostEur: estimatedCost }));
              }
              onEscalateToLJ({ ...workRequest, EstimatedCostEur: estimatedCost });
            }} className="rounded bg-amber-500 px-4 py-2 font-bold text-slate-950">Escalate to Long Job (≥ 750 EUR at 10%)</button>
          </div>
          <label className="block rounded border bg-white p-4 text-sm">Message text<textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-2 block w-full rounded border p-2" rows={3} /></label>
          <button onClick={post} disabled={!message.trim()} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">Post</button>
        </div>}
        {tab === "Attached Documents" && <section className="space-y-4 rounded border bg-white p-4">
          <h3 className="font-semibold">Attached Documents</h3><PhotoCapture className="my-2 max-w-xs" onPhotos={(urls) => update((wr) => ({ ...wr, Attachments: [...(wr.Attachments ?? []), ...urls.map((dataUrl, n) => ({ id: crypto.randomUUID(), name: `photo-${Date.now()}-${n + 1}.jpg`, type: "image/jpeg", dataUrl }))] }), `${urls.length} photo${urls.length === 1 ? "" : "s"} added by ${actorName}`)} /><label className="inline-flex cursor-pointer rounded bg-blue-700 px-4 py-2 text-white">+ New WR Document<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) attach(file); e.currentTarget.value = ""; }} /></label>
          {(workRequest.Attachments ?? []).map((doc) => <div key={doc.id} className="flex items-center justify-between border-b py-3"><span>{doc.name}</span><div className="flex gap-3"><a href={doc.dataUrl} target="_blank" rel="noreferrer" onClick={() => update((wr) => wr, `Document '${doc.name}' opened by ${actorName}`)} className="text-blue-700 underline">Open</a><button onClick={() => update((wr) => ({ ...wr, Attachments: (wr.Attachments ?? []).filter((item) => item.id !== doc.id) }), `Document '${doc.name}' deleted by ${actorName}`)} className="text-red-700">Delete</button></div></div>)}
        </section>}
        {tab === "Technician To-Do & AI Task List" && <TechnicianTodoList wr={workRequest} update={update} />}
        {tab === "AuditLog & QA" && <QAAuditPanel wr={workRequest} />}
        {tab === "Checklist - Smart PM" && <WRChecklistReview wr={workRequest} />}
      </main>
      <ResizableHistory>
        <button aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)} className="flex w-full items-center justify-between px-5 py-3 font-semibold">History <span>{historyOpen ? "−" : "+"}</span></button>
        {historyOpen && <div className="space-y-3 px-5 pb-4">
          <div className="flex flex-wrap gap-2">{([["all", "All"], ["comment", "Human Comments Only"], ["log", "Automatic Logs Only"]] as const).map(([key, label]) => <button key={key} aria-pressed={historyFilter === key} onClick={() => setHistoryFilter(key)} className={`rounded px-3 py-1 text-sm ${historyFilter === key ? "bg-blue-700 text-white" : "bg-slate-100"}`}>{label}</button>)}</div>
          <div className="flex gap-2"><input aria-label="Write a comment" placeholder="Write a comment..." value={message} onChange={(e) => setMessage(e.target.value)} className="min-w-0 flex-1 rounded border p-1" /><button onClick={post} disabled={!message.trim()} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">Post</button></div>
          {newestFirst((workRequest.Activity ?? []).filter((entry) => historyFilter === "all" || entry.kind === historyFilter), (entry) => entry.createdAt).map((entry) => <article key={entry.id} className="border-b pb-2 text-sm">
            <div className="text-xs text-slate-500">{entry.actorName} · {formatDateTimeDDMMYYYY(entry.createdAt)} · {entry.kind === "comment" ? "Human comment" : "Automatic log"}</div>
            {editing === entry.id ? <><textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-2 w-full rounded border p-2" /><button onClick={() => saveEdit(entry.id)} className="text-blue-700">Save</button></> : <p>{entry.text}</p>}
            {entry.kind === "comment" && entry.actorId === actorId && editing !== entry.id && <button onClick={() => { setEditing(entry.id); setDraft(entry.text); }} className="text-blue-700">Edit</button>}
            {!!entry.editHistory?.length && <details><summary>Prior versions</summary>{newestFirst(entry.editHistory, (version) => version.timestamp).map((version, index) => <p key={`${entry.id}-${index}`} className="border-l pl-2 text-slate-600">{formatDateTimeDDMMYYYY(version.timestamp)} — {version.text}</p>)}</details>}
          </article>)}
        </div>}
      </ResizableHistory>
    </section>
  </div>;
}

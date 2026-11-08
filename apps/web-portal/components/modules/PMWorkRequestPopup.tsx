"use client";

import React, { useMemo, useState } from "react";
import {
  BaseWorkRequest,
  PM_ScheduleStep,
  WR_Statuses,
} from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { useCafmStore } from "@/lib/cafm-store";
import { QAAuditPanel } from "@/components/modules/QAAuditPanel";
import { QAChecklistReview } from "@/components/modules/QAChecklistReview";
import { completeChecklistInstances } from "@/lib/checklist-completion";
import { ChecklistExecutor } from "@/components/modules/ChecklistExecutor";
import { WRDetailsEditor } from "@/components/modules/WRDetailsEditor";
import { WorkRequestLabor } from "@/components/modules/WorkRequestLabor";
import { assignPerson } from "@/lib/dispatch";
import { ResizableHistory } from "@/components/common/ResizableHistory";
import { newestFirst } from "@/lib/history-order";

const TABS = [
  "Work request details",
  "Labor, parts & Completion",
  "KPI & Others",
  "Attached Documents",
  "Checklist",
  "PM Follow-up",
  "AuditLog",
  "Checklist - Smart PM",
] as const;

const STATUS_CHOICES = [
  { key: "50", label: "50% Issued", percentage: 50 },
  { key: "55-access", label: "55% On Hold for Access", percentage: 55, reason: "Access" },
  { key: "55-labor", label: "55% On Hold for Labor", percentage: 55, reason: "Labor" },
  { key: "55-parts", label: "55% On Hold for Parts", percentage: 55, reason: "Parts" },
  { key: "78", label: "78% Technically Completed", percentage: 78 },
  { key: "27", label: "27% Cancelled", percentage: 27 },
  { key: "100", label: "100% Completed", percentage: 100 },
] as const;

type StatusChoice = (typeof STATUS_CHOICES)[number];
type ChecklistResult = NonNullable<BaseWorkRequest["ChecklistResults"]>[number];

interface PMWorkRequestPopupProps {
  workRequest: BaseWorkRequest;
  onClose: () => void;
  onNavigate: (workRequestId: string) => void;
  onEscalateToLJ: (workRequest: BaseWorkRequest) => void;
}

export function PMWorkRequestPopup({
  workRequest,
  onClose,
  onNavigate,
  onEscalateToLJ,
}: PMWorkRequestPopupProps) {
  const { data, setData } = useCafmStore();
  const { activeSiteId, currentUser } = useSiteContext();
  const { currentRole } = useApp();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [checklistHistoryOpen, setChecklistHistoryOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [executorOpen, setExecutorOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [craftFilter, setCraftFilter] = useState("");
  const [documentFilter, setDocumentFilter] = useState("");
  const [stepFilter, setStepFilter] = useState("");
  const [stepCompletionFilter, setStepCompletionFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "comment" | "log">("all");
  const [historyFilters, setHistoryFilters] = useState({
    timestamp: "",
    performedBy: "",
    actionType: "",
    stepReference: "",
    details: "",
  });
  const [message, setMessage] = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [fastJobDescription, setFastJobDescription] = useState("");
  const [fastJobUrgency, setFastJobUrgency] = useState("Normal");

  const actorId = currentUser?.UserId ?? "current-user";
  const actorName = currentUser?.DisplayName ?? "Current user";
  const schedule = data.schedules.find((item) =>
    item.ScheduleId === workRequest.ScheduleId && item.SiteId === workRequest.SiteId,
  );
  const checklistStandard = workRequest.ChecklistStandardCode ?? schedule?.ChecklistCode ?? "";
  const blueprint = data.blueprints.find((item) =>
    item.ChecklistCode === checklistStandard &&
    (!item.SiteId || item.SiteId === workRequest.SiteId),
  );
  const checklistSteps: PM_ScheduleStep[] = workRequest.ChecklistSteps ?? blueprint?.Steps ?? [];
  const equipment = workRequest.EquipmentCodes
    .map((code) => data.equipment.find((item) =>
      item.EquipmentCode === code && item.SiteId === workRequest.SiteId,
    ))
    .filter((item) => item !== undefined);
  const linkedFastJobs = data.workRequests.filter((item) =>
    (item.WR_Type === "FJ" || item.WR_Type === "LJ") &&
    item.ParentPM_WR_ID === workRequest.WR_ID &&
    item.SiteId === workRequest.SiteId,
  );
  const currentStatusChoice = STATUS_CHOICES.find((item) =>
    item.percentage === workRequest.Percentage &&
    (item.percentage !== 55 || ("reason" in item && workRequest.WorkRequestSubstatus.includes(item.reason))),
  );
  const auditRows = useMemo(() => newestFirst([
    ...(workRequest.StepAuditLogs ?? []).map((entry) => ({
      id: entry.AuditLogId,
      timestamp: entry.OccurredAt,
      performedBy: entry.ActorId,
      actionType: entry.Action,
      stepReference: entry.StepInstanceId,
      details: entry.Action,
    })),
    ...(workRequest.Activity ?? []).filter((entry) => entry.kind === "log").map((entry) => ({
      id: entry.id,
      timestamp: entry.createdAt,
      performedBy: entry.actorName,
      actionType: "System log",
      stepReference: "",
      details: entry.text,
    })),
  ], (entry) => entry.timestamp), [workRequest.Activity, workRequest.StepAuditLogs]);
  const checklistHistory = useMemo(() => newestFirst([
    ...(workRequest.ChecklistHistory ?? []),
    ...(workRequest.StepAuditLogs ?? []).map((entry) => ({
      id: entry.AuditLogId,
      timestamp: entry.OccurredAt,
      performedBy: entry.ActorId,
      actionType: entry.Action,
      stepReference: entry.StepInstanceId,
      details: entry.Action,
    })),
  ], (entry) => entry.timestamp), [workRequest.ChecklistHistory, workRequest.StepAuditLogs]);

  const updateWorkRequest = (
    change: (current: BaseWorkRequest) => BaseWorkRequest,
    logText?: string,
  ) => {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      workRequests: current.workRequests.map((item) => {
        if (item.WR_ID !== workRequest.WR_ID || item.SiteId !== workRequest.SiteId) return item;
        const updated = change(item);
        return {
          ...updated,
          UpdatedAt: now,
          ...(logText ? {
            Activity: [...(updated.Activity ?? []), {
              id: crypto.randomUUID(),
              kind: "log" as const,
              actorId,
              actorName,
              actorRole: currentRole,
              createdAt: now,
              text: logText,
            }],
          } : {}),
        };
      }),
    }));
  };

  const addChecklistEntry = (
    actionType: string,
    details: string,
    stepReference?: string,
    timestamp = new Date().toISOString(),
  ) => ({
    id: crypto.randomUUID(),
    timestamp,
    performedBy: actorName,
    actionType,
    ...(stepReference ? { stepReference } : {}),
    details,
  });

  const applyStatus = (choice: StatusChoice) => {
    if (choice.percentage === 78 && workRequest.Percentage !== 50 && workRequest.Percentage !== 55) {
      window.alert("Technically Completed is available only from 50% Issued or 55% On Hold.");
      return;
    }
    if (choice.percentage === 100 && workRequest.Percentage !== 78) {
      window.alert("Complete (100%) is available only after Technically Completed (78%).");
      return;
    }
    const configured = WR_Statuses.find((item) =>
      item.Percentage === choice.percentage && item.ESAWorkType === workRequest.ESAWorkType,
    );
    if ([50, 78, 100].includes(choice.percentage) && !configured) {
      window.alert(`No WR_Statuses configuration exists for ${choice.percentage}% ${workRequest.ESAWorkType}.`);
      return;
    }
    const reason = "reason" in choice ? choice.reason : undefined;
    const status = choice.percentage === 55
      ? { WorkRequestStatus: "On Hold", WorkRequestSubstatus: `On Hold for ${reason}` }
      : choice.percentage === 27
        ? { WorkRequestStatus: "Cancelled", WorkRequestSubstatus: "Cancelled" }
        : {
          WorkRequestStatus: configured!.WorkRequestStatus,
          WorkRequestSubstatus: configured!.WorkRequestSubstatus,
        };
    updateWorkRequest((current) => ({
      ...current,
      ...status,
      Percentage: choice.percentage,
      ...(reason ? { IsFrozen: true, FreezeReason: reason } : {}),
      ...(choice.percentage !== 55 ? { IsFrozen: false } : {}),
    }), `WR status changed from ${workRequest.Percentage}% to ${choice.percentage}% (${choice.label}) by ${actorName}`);
  };

  const addComment = () => {
    if (!message.trim()) return;
    const now = new Date().toISOString();
    updateWorkRequest((current) => ({
      ...current,
      Activity: [...(current.Activity ?? []), {
        id: crypto.randomUUID(),
        kind: "comment",
        actorId,
        actorName,
        actorRole: currentRole,
        createdAt: now,
        text: message.trim(),
        editHistory: [],
      }],
    }));
    setMessage("");
  };

  const saveCommentEdit = (commentId: string) => {
    if (!commentDraft.trim()) return;
    const now = new Date().toISOString();
    updateWorkRequest((current) => ({
      ...current,
      Activity: (current.Activity ?? []).map((entry) =>
        entry.id === commentId && entry.kind === "comment" && entry.actorId === actorId
          ? {
            ...entry,
            text: commentDraft.trim(),
            editedAt: now,
            editHistory: [
              ...(entry.editHistory ?? []),
              { text: entry.text, timestamp: entry.editedAt ?? entry.createdAt },
            ],
          }
          : entry,
      ),
    }));
    setEditingComment(null);
  };

  const addDocument = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => window.alert(`Could not read ${file.name}.`);
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        window.alert(`Could not read ${file.name}.`);
        return;
      }
      const attachment = { id: crypto.randomUUID(), name: file.name, type: file.type, dataUrl: reader.result };
      updateWorkRequest((current) => ({
        ...current,
        Attachments: [...(current.Attachments ?? []), attachment],
      }), `Document '${file.name}' was added by ${actorName}`);
    };
    reader.readAsDataURL(file);
  };

  const removeDocument = (documentId: string, documentName: string) => {
    updateWorkRequest((current) => ({
      ...current,
      Attachments: (current.Attachments ?? []).filter((item) => item.id !== documentId),
    }), `Document '${documentName}' was deleted by ${actorName}`);
  };

  const chooseChecklist = (code: string) => {
    const selected = data.blueprints.find((item) =>
      item.ChecklistCode === code && (!item.SiteId || item.SiteId === workRequest.SiteId),
    );
    if (!selected) return;
    updateWorkRequest((current) => ({
      ...current,
      ChecklistStandardCode: selected.ChecklistCode,
      ChecklistSteps: selected.Steps,
    }),
      `Checklist standard ${selected.Title} selected by ${actorName}`);
  };

  const updateChecklistResult = (result: ChecklistResult | null, stepId: string) => {
    const now = new Date().toISOString();
    updateWorkRequest((current) => {
      const previous = current.ChecklistResults?.find((item) => item.stepId === stepId);
      if (result && previous &&
        JSON.stringify(previous) === JSON.stringify(result)) return current;
      const step = checklistSteps.find((item) => item.StepId === stepId);
      const action = result ? "Step answer updated" : "Step answer cleared";
      const detail = result
        ? `${step?.Title ?? stepId} answered (${result.passed ? "favourable" : "unfavourable"})`
        : `${step?.Title ?? stepId} answer cleared`;
      const auditValue = (value: ChecklistResult | undefined) => value && ({
        ...value,
        photoPaths: value.photoPaths?.map(() => "Photo attached"),
      });
      const audit = result ? [{
        AuditLogId: crypto.randomUUID(),
        StepInstanceId: `${current.WR_ID}:${stepId}`,
        WR_ID: current.WR_ID,
        ActorId: actorId,
        Action: "modified" as const,
        ...(previous ? { PreviousValue: auditValue(previous) } : {}),
        NewValue: auditValue(result),
        OccurredAt: now,
      }] : [{
        AuditLogId: crypto.randomUUID(),
        StepInstanceId: `${current.WR_ID}:${stepId}`,
        WR_ID: current.WR_ID,
        ActorId: actorId,
        Action: "reopened" as const,
        ...(previous ? { PreviousValue: auditValue(previous) } : {}),
        OccurredAt: now,
      }];
      return {
        ...current,
        ChecklistCompleted: false,
        ChecklistResults: [
          ...(current.ChecklistResults ?? []).filter((item) => item.stepId !== stepId),
          ...(result ? [result] : []),
        ],
        StepAuditLogs: [...(current.StepAuditLogs ?? []), ...audit],
        ChecklistHistory: [
          ...(current.ChecklistHistory ?? []),
          addChecklistEntry(action, detail, stepId, now),
        ],
        Activity: [...(current.Activity ?? []), {
          id: crypto.randomUUID(),
          kind: "log" as const,
          actorId,
          actorName,
          actorRole: currentRole,
          createdAt: now,
          text: `${detail} by ${actorName}`,
        }],
      };
    });
  };

  const finishChecklist = (results: ChecklistResult[]) => {
    const now = new Date().toISOString();
    let completedInstances = workRequest.ChecklistInstances;
    try {
      if (workRequest.ChecklistInstances) {
        completedInstances = completeChecklistInstances(
          workRequest.ChecklistInstances,
          results,
          actorId,
          now,
        );
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not complete the checklist.");
      return false;
    }
    updateWorkRequest((current) => ({
      ...current,
      ChecklistCompleted: true,
      ChecklistResults: results,
      ChecklistInstances: completedInstances,
      StepAuditLogs: [
        ...(current.StepAuditLogs ?? []),
        ...(completedInstances ?? []).filter((step) => step.IsCompleted).map((step) => ({
          AuditLogId: crypto.randomUUID(),
          StepInstanceId: step.StepInstanceId,
          WR_ID: current.WR_ID,
          ActorId: actorId,
          Action: "completed" as const,
          OccurredAt: now,
        })),
      ],
      ChecklistHistory: [
        ...(current.ChecklistHistory ?? []),
        addChecklistEntry(
          "Checklist completed",
          `${results.length} of ${checklistSteps.length} steps answered`,
          undefined,
          now,
        ),
      ],
    }), `Checklist finished by ${actorName}`);
    return true;
  };

  const addCraftperson = (userId: string) => {
    const craftperson = data.craftspeople.find((item) => item.id === userId && item.SiteId === activeSiteId);
    if (craftperson) {
      if ((workRequest.AssignedCraftpersonIds ?? []).includes(userId)) return;
      const labor = { craftpersonId: userId, hourlyRate: craftperson.HourlyRate, workingTimeMinutes: 0,
        name: craftperson.Name, lastName: craftperson.LastName };
      updateWorkRequest((current) => assignPerson(current, labor), `Craftperson ${craftperson.Name} ${craftperson.LastName} assigned to ${workRequest.WR_ID} by ${actorName}`);
      setAssignModalOpen(false);
      setCraftFilter("");
      return;
    }
    const user = data.users.find((item) => item.UserId === userId);
    if (!user || (workRequest.AssignedCraftpersonIds ?? []).includes(userId)) return;
    const names = user.DisplayName.trim().split(/\s+/);
    const lastName = names.pop() ?? user.DisplayName;
    const labor = {
      craftpersonId: userId,
      hourlyRate: 0,
      workingTimeMinutes: 0,
      name: names.join(" ") || lastName,
      lastName,
    };
    updateWorkRequest((current) => assignPerson(current, labor), `Craftperson ${user.DisplayName} assigned to ${workRequest.WR_ID} by ${actorName}`);
    setAssignModalOpen(false);
    setCraftFilter("");
  };

  const addFollowUp = () => {
    if (!fastJobDescription.trim()) {
      window.alert("Enter a description for the Fast Job.");
      return;
    }
    const issued = WR_Statuses.find((item) =>
      item.Percentage === 50 && item.ESAWorkType === "Corrective Maintenance",
    );
    if (!issued) {
      window.alert("The 50% Corrective Maintenance status is not configured.");
      return;
    }
    const now = new Date().toISOString();
    const jobId = `FJ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const job: BaseWorkRequest = {
      WR_ID: jobId,
      JobID: `JOB-${Date.now()}`,
      WR_Type: "FJ",
      ESAWorkType: "Corrective Maintenance",
      Description: fastJobDescription.trim(),
      ProblemLocation: workRequest.ProblemLocation,
      CreatedDate: now.slice(0, 10),
      WorkRequestStatus: issued.WorkRequestStatus,
      WorkRequestSubstatus: issued.WorkRequestSubstatus,
      Percentage: issued.Percentage,
      SiteId: workRequest.SiteId,
      bl_id: workRequest.bl_id,
      LevelName: workRequest.LevelName,
      RoomCode: workRequest.RoomCode,
      EquipmentCodes: workRequest.EquipmentCodes,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [],
      CreatedBy: actorId,
      IsFrozen: false,
      TotalTimeMinutes: 0,
      StartDateTBD: false,
      RequiresSAT: false,
      RequiresDrawingUpdate: false,
      RequiresInventoryUpdate: false,
      AcceptanceGates: [],
      ParentPM_WR_ID: workRequest.WR_ID,
      EstimatedCostEur: 0,
      Urgency: fastJobUrgency,
      UpdatedAt: now,
      Activity: [{
        id: crypto.randomUUID(),
        kind: "log",
        actorId,
        actorName,
        actorRole: currentRole,
        createdAt: now,
        text: `Follow-up Fast Job created from ${workRequest.WR_ID} by ${actorName}`,
      }],
    };
    setData((current) => ({
      ...current,
      workRequests: [
        ...current.workRequests.map((item) =>
          item.WR_ID === workRequest.WR_ID && item.SiteId === workRequest.SiteId
            ? {
              ...item,
              Activity: [...(item.Activity ?? []), {
                id: crypto.randomUUID(),
                kind: "log" as const,
                actorId,
                actorName,
                actorRole: currentRole,
                createdAt: now,
                text: `Follow-up Fast Job ${job.WR_ID} created by ${actorName}`,
              }],
            }
            : item,
        ),
        job,
      ],
    }));
    setFastJobDescription("");
  };

  const setInstallation = (equipmentCode: string, isInstallation: boolean) => {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      equipment: current.equipment.map((item) =>
        item.EquipmentCode === equipmentCode && item.SiteId === workRequest.SiteId
          ? { ...item, IsInstallation: isInstallation, UpdatedAt: now }
          : item,
      ),
      workRequests: current.workRequests.map((item) =>
        item.WR_ID === workRequest.WR_ID && item.SiteId === workRequest.SiteId
          ? {
            ...item,
            UpdatedAt: now,
            Activity: [...(item.Activity ?? []), {
              id: crypto.randomUUID(),
              kind: "log" as const,
              actorId,
              actorName,
              actorRole: currentRole,
              createdAt: now,
              text: `Equipment ${equipmentCode} installation flag set to ${isInstallation ? "Yes" : "No"} by ${actorName}`,
            }],
          }
          : item,
      ),
    }));
  };

  const renderField = (label: string, value: string | number | boolean | undefined) => (
    <div key={label} className="min-w-0 border-b border-slate-100 py-2">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-900">
        {value === undefined || value === "" ? "—" : typeof value === "boolean" ? value ? "Yes" : "No" : value}
      </dd>
    </div>
  );

  const renderGroup = (title: string, left: React.ReactNode, right: React.ReactNode) => (
    <details open className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer bg-slate-50 px-4 py-3 font-semibold text-slate-800">{title}</summary>
      <div className="grid gap-x-8 px-4 pb-4 md:grid-cols-2">
        <dl>{left}</dl>
        <dl>{right}</dl>
      </div>
    </details>
  );

  const visibleHistory = newestFirst((workRequest.Activity ?? []).filter((entry) =>
    historyFilter === "all" || entry.kind === historyFilter,
  ), (entry) => entry.createdAt);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-2 sm:p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-label="WR Details Popup"
        className="flex h-[96vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden rounded-xl bg-slate-100 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b bg-white px-5 py-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">WR Details Popup</h2>
            <p className="text-sm text-slate-600">{workRequest.WR_ID} · {workRequest.Description}</p>
          </div>
          <button type="button" aria-label="Close WR Details Popup" onClick={onClose}
            className="rounded px-3 py-2 text-xl leading-none text-slate-600 hover:bg-slate-100">×</button>
        </header>

        <nav aria-label="WR detail tabs" className="flex shrink-0 gap-1 border-b bg-white px-3 pt-2">
          {TABS.map((tab) => (
            <button type="button" key={tab} role="tab" aria-label={tab} title={tab} aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`min-w-0 flex-1 truncate rounded-t-md border px-3 py-2 text-xs font-medium whitespace-nowrap ${activeTab === tab
                ? "border-blue-600 bg-blue-50 font-semibold text-blue-800"
                : "border-transparent text-slate-600 hover:bg-slate-50"}`}>
              {tab}
            </button>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <QAAuditPanel wr={workRequest} />
          {activeTab === "Work request details" && <div className="space-y-4">
            <WRDetailsEditor workRequest={workRequest} />
            {renderGroup("Work Request",
              <>
                {renderField("WR ID", workRequest.WR_ID)}
                {renderField("Work request status", workRequest.WorkRequestStatus)}
                {renderField("Start date (Date To Perform)", workRequest.StartDate)}
                {renderField("Start date (TBD)", workRequest.StartDateTBD)}
                {renderField("created date", workRequest.CreatedDate)}
              </>,
              <>
                {renderField("ESA Work Type", workRequest.ESAWorkType)}
                {renderField("Work request substatus", `${workRequest.Percentage}% ${workRequest.WorkRequestSubstatus}`)}
                {renderField("Due date", workRequest.DueDate)}
                {renderField("Margin date", workRequest.MarginDate)}
                {renderField("Trade name", workRequest.TradeName)}
                {renderField("Expected hours", workRequest.ExpectedHours)}
              </>,
            )}
            {renderGroup("Work Location",
              <>
                {renderField("Room code", workRequest.RoomCode)}
                {renderField("Level name", workRequest.LevelName)}
                {renderField("bl id", workRequest.bl_id)}
              </>,
              <>{renderField("Problem location", workRequest.ProblemLocation)}</>,
            )}
            {renderGroup("Equipment",
              <>
                {renderField("Equipment code", equipment.map((item) => item.EquipmentCode).join(", "))}
                {renderField("Local equipment code", equipment.map((item) => item.LocalEquipmentCode).filter(Boolean).join(", "))}
                {renderField("Equipment name", equipment.map((item) => item.EquipmentName).join(", "))}
                {renderField("Equipment Standard Description", equipment.map((item) => item.EquipmentStandardDescription).filter(Boolean).join(", "))}
                {renderField("Equipment standard ID", equipment.map((item) => item.EquipmentStandardId).filter(Boolean).join(", "))}
              </>,
              <div>
                <dt className="text-xs font-medium text-slate-500">Is installation</dt>
                {equipment.map((item) => <label key={item.EquipmentCode} className="mt-2 flex items-center gap-2 text-sm">
                  <span>{item.EquipmentCode}</span>
                  <select aria-label={`Is installation ${item.EquipmentCode}`} value={String(item.IsInstallation)}
                    onChange={(event) => setInstallation(item.EquipmentCode, event.target.value === "true")}
                    className="rounded border px-2 py-1">
                    <option value="true">Yes</option><option value="false">No</option>
                  </select>
                </label>)}
                {!equipment.length && <dd className="mt-1 text-sm">—</dd>}
              </div>,
            )}
            {renderGroup("Preventive Maintenance Procedure Details",
              <>
                {renderField("PMP ID Original", workRequest.PMPIdOriginal)}
                {renderField("PMP ID Smart", workRequest.PMPIdSmart)}
                {renderField("PM Procedure Description", workRequest.PMProcedureDescription ?? blueprint?.MaintenanceReason)}
                {renderField("PM Procedure Description SMART", workRequest.PMProcedureDescriptionSmart ?? blueprint?.Title)}
                {renderField("Responsible company", workRequest.ResponsibleCompany)}
                {renderField("Responsible person", workRequest.ResponsiblePerson)}
              </>,
              <>
                {renderField("PMS ID Original", workRequest.PMSIdOriginal)}
                {renderField("PMS ID Smart", workRequest.PMSIdSmart)}
              </>,
            )}
          </div>}

          {activeTab === "Labor, parts & Completion" && <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">WR ID: {workRequest.WR_ID}</h3>
              <button type="button" onClick={() => setAssignModalOpen(true)}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                Assign Craftperson
              </button>
            </div>
            <WorkRequestLabor wr={workRequest} people={data.craftspeople} absences={data.craftpersonAbsences} freezes={data.locationFreezes} update={updateWorkRequest} onClose={onClose} />
            <div className="grid gap-3 rounded border bg-white p-4 md:grid-cols-[1fr_2fr]">
              <label className="text-sm font-medium">WR Statuses
                <select aria-label="WR Statuses" value={currentStatusChoice?.key ?? ""}
                  onChange={(event) => {
                    const choice = STATUS_CHOICES.find((item) => item.key === event.target.value);
                    if (choice) applyStatus(choice);
                  }}
                  className="mt-1 block w-full rounded border px-3 py-2">
                  <option value="">Select a status</option>
                  {STATUS_CHOICES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button type="button" onClick={() => applyStatus(STATUS_CHOICES.find((item) => item.percentage === 27)!)}
                  className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700">Cancel WR (27%)</button>
                <button type="button" onClick={() => applyStatus(STATUS_CHOICES.find((item) => item.percentage === 78)!)}
                  className="rounded border border-blue-700 bg-white px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50">Technically Completed (78%)</button>
                <button type="button" onClick={() => applyStatus(STATUS_CHOICES.find((item) => item.percentage === 100)!)}
                  className="rounded border border-blue-700 bg-white px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50">Complete (100%)</button>
              </div>
            </div>
            <div className="rounded border bg-white p-4">
              <label className="block text-sm font-medium">Message text
                <textarea value={message} onChange={(event) => setMessage(event.target.value)}
                  className="mt-1 block min-h-24 w-full rounded border p-3" />
              </label>
              <button type="button" disabled={!message.trim()} onClick={addComment}
                className="mt-2 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Post</button>
            </div>
          </div>}

          {activeTab === "KPI & Others" && <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded border bg-white p-4">
              <h3 className="mb-3 font-semibold">SLA &amp; KPI</h3>
              {renderField("SLA status", workRequest.DueDate && new Date(workRequest.DueDate) < new Date()
                ? "Overdue"
                : workRequest.MarginDate && new Date(workRequest.MarginDate) < new Date()
                  ? "Margin"
                  : "On-Time")}
              {renderField("On-Hold 55% reason", workRequest.FreezeReason ?? workRequest.PlannedFreezeText)}
              <label className="mt-3 block text-sm">Downtime (minutes)
                <input type="number" min="0" value={workRequest.DowntimeMinutes ?? 0}
                  onChange={(event) => updateWorkRequest((current) => ({
                    ...current, DowntimeMinutes: Math.max(0, Number(event.target.value)),
                  }), `Downtime KPI updated by ${actorName}`)}
                  className="mt-1 block w-full rounded border px-3 py-2" />
              </label>
              <label className="mt-3 block text-sm">KPI notes
                <textarea value={workRequest.KPINotes ?? ""}
                  onChange={(event) => updateWorkRequest((current) => ({ ...current, KPINotes: event.target.value }))}
                  className="mt-1 block min-h-24 w-full rounded border p-3" />
              </label>
            </section>
            <section className="rounded border bg-white p-4">
              <h3 className="mb-3 font-semibold">Work Request Metrics</h3>
              {renderField("Expected hours", workRequest.ExpectedHours)}
              {renderField("Logged working time (hours)", ((workRequest.CraftpersonLabor ?? []).reduce((sum, item) => sum + item.workingTimeMinutes, 0) / 60).toFixed(2))}
              {renderField("Total work session time (minutes)", workRequest.TotalTimeMinutes)}
              {renderField("Estimated cost (EUR)", workRequest.EstimatedCostEur)}
              {renderField("Actual cost (EUR)", workRequest.ActualCostEur)}
            </section>
          </div>}

          {activeTab === "Attached Documents" && <section className="space-y-4 rounded border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Attached Documents</h3>
              <label className="cursor-pointer rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                + New WR Document
                <input className="sr-only" type="file" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) addDocument(file);
                  event.target.value = "";
                }} />
              </label>
            </div>
            <input aria-label="Filter documents by Name" placeholder="Name" value={documentFilter}
              onChange={(event) => setDocumentFilter(event.target.value)} className="rounded border px-3 py-2" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead className="bg-slate-50"><tr><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">Actions</th></tr></thead>
                <tbody>{(workRequest.Attachments ?? []).filter((item) =>
                  item.name.toLowerCase().includes(documentFilter.toLowerCase()),
                ).map((item) => <tr key={item.id} className="border-t">
                  <td className="p-3">{item.name}</td><td className="p-3">{item.type || "File"}</td>
                  <td className="space-x-3 p-3">
                    <a href={item.dataUrl} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">Open</a>
                    <button type="button" onClick={() => removeDocument(item.id, item.name)} className="font-medium text-red-700">Delete</button>
                  </td>
                </tr>)}
                {!workRequest.Attachments?.length && <tr><td colSpan={3} className="p-5 text-center text-slate-500">No attached documents.</td></tr>}
                {!!workRequest.Attachments?.length && !workRequest.Attachments.some((item) => item.name.toLowerCase().includes(documentFilter.toLowerCase())) &&
                  <tr><td colSpan={3} className="p-5 text-center text-slate-500">No documents match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>}

          {activeTab === "Checklist" && <section className="space-y-3 rounded border bg-white p-4">
            <h3 className="font-semibold">Checklist summary</h3>
            <p className="text-sm text-slate-600">Standard: {blueprint?.Title ?? checklistStandard ?? "Not selected"}</p>
            {checklistSteps.map((step, index) => {
              const answer = workRequest.ChecklistResults?.find((item) => item.stepId === step.StepId);
              return <article key={step.StepId} className="rounded border p-3">
                <p className="font-medium">{index + 1}. {step.Title}</p>
                <p className="text-sm text-slate-600">{answer
                  ? Array.isArray(answer.value)
                    ? answer.value.join(", ")
                    : String(answer.value)
                  : "Not answered"}</p>
                {answer && <span className={`mt-2 inline-block rounded px-2 py-1 text-xs font-semibold ${answer.passed
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"}`}>{answer.passed ? "Favourable" : "Unfavourable"}</span>}
              </article>;
            })}
            {!checklistSteps.length && <p className="text-sm text-slate-500">No checklist standard is linked to this work request.</p>}
          </section>}

          {activeTab === "PM Follow-up" && <section className="space-y-4 rounded border bg-white p-4">
            <h3 className="font-semibold">Create FastJob</h3>
            <p className="text-sm text-slate-600">New Fast Jobs are linked to this PM and inherit its equipment and location. Fast Jobs are limited to costs below 750 EUR.</p>
            <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
              <input aria-label="Fast Job description" value={fastJobDescription}
                onChange={(event) => setFastJobDescription(event.target.value)} placeholder="Description"
                className="rounded border px-3 py-2" />
              <select aria-label="Fast Job urgency" value={fastJobUrgency}
                onChange={(event) => setFastJobUrgency(event.target.value)} className="rounded border px-3 py-2">
                {["Low", "Normal", "High", "Urgent"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <button type="button" onClick={addFollowUp}
                className="rounded bg-blue-700 px-4 py-2 font-semibold text-white">Create FastJob</button>
            </div>
            <input aria-label="Filter follow-up Fast Jobs" placeholder="Filter follow-up Fast Jobs..."
              value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value)}
              className="rounded border px-3 py-2" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-slate-50"><tr>
                  {["Urgency", "Description", "Reported date", "Problem location", "Job ID", "Due date", "Start date", "Actions"].map((title) => <th key={title} className="p-3">{title}</th>)}
                </tr></thead>
                <tbody>{linkedFastJobs.filter((job) =>
                  `${job.WR_ID} ${job.Description} ${job.ProblemLocation ?? ""}`.toLowerCase().includes(followUpFilter.toLowerCase()),
                ).map((job) => <tr key={job.WR_ID} className="border-t">
                  <td className="p-3">{job.Urgency ?? "Normal"}</td><td className="p-3">{job.Description}</td>
                  <td className="p-3">{job.CreatedDate}</td><td className="p-3">{job.ProblemLocation}</td>
                  <td className="p-3">{job.JobID ?? job.WR_ID}</td><td className="p-3">{job.DueDate ?? "—"}</td>
                  <td className="p-3">{job.StartDate ?? "—"}</td>
                  <td className="space-x-2 p-3">
                    <button type="button" onClick={() => onNavigate(job.WR_ID)} className="text-blue-700 underline">Open {job.WR_Type}</button>
                    {job.WR_Type === "FJ" && !job.EscalatedToLJ_WR_ID && <button type="button" onClick={() => onEscalateToLJ(job)} className="text-orange-700 underline">Escalate to LJ</button>}
                    {job.EscalatedToLJ_WR_ID && <button type="button" onClick={() => onNavigate(job.EscalatedToLJ_WR_ID!)} className="text-orange-700 underline">Open LJ</button>}
                  </td>
                </tr>)}
                {!linkedFastJobs.length && <tr><td colSpan={8} className="p-5 text-center text-slate-500">No linked Follow-Up Fast Jobs.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>}

          {activeTab === "AuditLog" && <section className="space-y-4 rounded border bg-white p-4">
            <QAChecklistReview key={workRequest.WR_ID} wr={workRequest} />
            {(!workRequest.QA_AuditStatus || workRequest.QA_AuditStatus === "None") && <>
            <h3 className="font-semibold">QA inspection controls</h3>
            <p className="text-sm">QA status: <strong>{workRequest.QA_InspectionStatus ?? "Pending"}</strong></p>
            <label className="block text-sm">QA_IssueDescription
              <textarea value={workRequest.QA_IssueDescription ?? ""} onChange={(event) =>
                updateWorkRequest((current) => ({ ...current, QA_IssueDescription: event.target.value }))}
                className="mt-1 block w-full rounded border p-2" rows={2} />
            </label>
            <label className="block text-sm">QA_CorrectionComment
              <textarea value={workRequest.QA_CorrectionComment ?? ""} onChange={(event) =>
                updateWorkRequest((current) => ({ ...current, QA_CorrectionComment: event.target.value }))}
                className="mt-1 block w-full rounded border p-2" rows={2} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={workRequest.Percentage !== 78} onClick={() => updateWorkRequest((current) => ({
                ...current, QA_InspectionStatus: "Passed", AuditInspectionStatus: "Passed Inspected",
              }), `Passed inspection marked by ${actorName}`)}
                className="rounded bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Mark Passed Inspection</button>
              <button type="button" disabled={workRequest.Percentage !== 78} onClick={() => {
                const reason = window.prompt("Correction reason (required):", workRequest.QA_IssueDescription ?? "");
                if (!reason?.trim()) { window.alert("A correction reason is required."); return; }
                updateWorkRequest((current) => ({
                  ...current, QA_InspectionStatus: "ToBeCorrected",
                  AuditInspectionStatus: "PM WRs to be corrected", QA_IssueDescription: reason.trim(),
                }), `Sent to PM WRs to be corrected: ${reason.trim()} (${actorName})`);
              }} className="rounded bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Send to &quot;PM WRs to be corrected&quot;</button>
              {workRequest.QA_InspectionStatus === "Passed" && <button type="button"
                onClick={() => applyStatus(STATUS_CHOICES.find((item) => item.percentage === 100)!)}
                className="rounded bg-blue-700 px-4 py-2 font-semibold text-white">Complete (100%)</button>}
            </div>
            <label className="block max-w-md text-sm">Inspection status
              <select aria-label="QA inspection status" value={workRequest.AuditInspectionStatus ?? "To Be Inspected"}
                onChange={(event) => {
                  const value = event.target.value as NonNullable<BaseWorkRequest["AuditInspectionStatus"]>;
                  if (value !== "To Be Inspected" && workRequest.Percentage !== 78) {
                    window.alert("QA inspection is available only after Technically Completed (78%).");
                    return;
                  }
                  updateWorkRequest((current) => ({
                    ...current, AuditInspectionStatus: value,
                    QA_InspectionStatus: value === "Passed Inspected" ? "Passed" : value === "PM WRs to be corrected" ? "ToBeCorrected" : "Pending",
                  }),
                    `QA inspection status changed to ${value} by ${actorName}`);
                }} className="mt-1 block w-full rounded border px-3 py-2">
                {["To Be Inspected", "Passed Inspected", "PM WRs to be corrected"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <div className="flex gap-2 text-xs">
              <span className="rounded bg-amber-100 px-2 py-1">To Be Inspected</span>
              <span className="rounded bg-green-100 px-2 py-1">Passed Inspected</span>
              <span className="rounded bg-red-100 px-2 py-1">PM WRs to be corrected</span>
            </div>
            </>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50"><tr><th className="p-3">Timestamp</th><th className="p-3">Performed by</th><th className="p-3">Action</th><th className="p-3">Step reference</th><th className="p-3">Details</th></tr></thead>
                <tbody>{auditRows.map((entry) => <tr key={entry.id} className="border-t">
                  <td className="p-3">{new Date(entry.timestamp).toLocaleString()}</td><td className="p-3">{entry.performedBy}</td>
                  <td className="p-3">{entry.actionType}</td><td className="p-3">{entry.stepReference || "—"}</td><td className="p-3">{entry.details}</td>
                </tr>)}
                {!auditRows.length && <tr><td colSpan={5} className="p-5 text-center text-slate-500">No audit records.</td></tr>}</tbody>
              </table>
            </div>
          </section>}

          {activeTab === "Checklist - Smart PM" && <section className="space-y-4 rounded border bg-white p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="block text-sm font-medium">Checklist Standard
                <select aria-label="Checklist Standard" value={checklistStandard}
                  onChange={(event) => chooseChecklist(event.target.value)}
                  className="mt-1 block min-w-64 rounded border px-3 py-2">
                  <option value="">Select checklist standard</option>
                  {data.blueprints.filter((item) => !item.SiteId || item.SiteId === workRequest.SiteId)
                    .map((item) => <option key={item.ChecklistCode} value={item.ChecklistCode}>{item.Title}</option>)}
                </select>
              </label>
              <button type="button" disabled={!checklistSteps.length}
                onClick={() => setExecutorOpen(true)}
                className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Modify Checklist..</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Filter checklist steps" value={stepFilter}
                onChange={(event) => setStepFilter(event.target.value)} placeholder="Filter checklist steps..."
                className="rounded border px-3 py-2" />
              <select aria-label="Filter completed checklist steps" value={stepCompletionFilter}
                onChange={(event) => setStepCompletionFilter(event.target.value)} className="rounded border px-3 py-2">
                <option value="all">All completion states</option><option value="yes">Is completed: Yes</option><option value="no">Is completed: No</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-slate-50"><tr>
                  {["Sequence", "Checklist step", "Expected value Unit", "Measured value", "Is completed", "Craftperson comment", "Result"].map((title) => <th key={title} className="p-3">{title}</th>)}
                </tr></thead>
                <tbody>{checklistSteps.filter((step) => {
                  const answer = workRequest.ChecklistResults?.find((item) => item.stepId === step.StepId);
                  const isComplete = !!answer;
                  return `${step.Title} ${step.StepId}`.toLowerCase().includes(stepFilter.toLowerCase()) &&
                    (stepCompletionFilter === "all" || (stepCompletionFilter === "yes") === isComplete);
                }).map((step, index) => {
                  const answer = workRequest.ChecklistResults?.find((item) => item.stepId === step.StepId);
                  const shownValue = answer
                    ? Array.isArray(answer.value) ? answer.value.join(", ") : String(answer.value)
                    : "—";
                  return <tr key={step.StepId} className="border-t">
                    <td className="p-3">{index + 1}</td><td className="p-3">{step.Title}</td>
                    <td className="p-3">{step.Unit ? `${step.MinThreshold ?? "—"}–${step.MaxThreshold ?? "—"} ${step.Unit}` : step.Unit ?? "—"}</td>
                    <td className="p-3">{shownValue}</td><td className="p-3">{answer ? "Yes" : "No"}</td>
                    <td className="p-3">{answer?.comment ?? "—"}</td>
                    <td className="p-3">
                      {answer && <span className={`rounded px-2 py-1 text-xs font-semibold ${answer.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {answer.passed ? "Favourable" : "Unfavourable"}
                      </span>}
                      {answer?.photoPaths?.map((photo) => <img key={photo} src={photo} alt={`Failure evidence for ${step.Title}`} className="mt-2 max-h-20 max-w-32 rounded object-cover" />)}
                    </td>
                  </tr>;
                })}
                {!checklistSteps.length && <tr><td colSpan={7} className="p-5 text-center text-slate-500">No checklist steps are available.</td></tr>}
              </tbody></table>
            </div>
          </section>}
        </main>

        <ResizableHistory>
          <footer className="px-4 py-3">
          <section>
            <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)}
              className="flex w-full items-center justify-between py-2 text-left font-semibold">
              <span>History</span><span>{historyOpen ? "−" : "+"}</span>
            </button>
            {historyOpen && <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "All"],
                  ["comment", "Human Comments Only"],
                  ["log", "Automatic Logs Only"],
                ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={historyFilter === value}
                  onClick={() => setHistoryFilter(value)}
                  className={`rounded px-3 py-1 text-xs ${historyFilter === value ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>)}
              </div>
              <div className="flex gap-2"><input aria-label="Write a comment" placeholder="Write a comment..." value={message} onChange={(event) => setMessage(event.target.value)} className="min-w-0 flex-1 rounded border p-1" /><button type="button" disabled={!message.trim()} onClick={addComment} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">Post</button></div>
              <div className="space-y-2">
                {visibleHistory.map((entry) => <article key={entry.id} className="rounded border p-2 text-xs">
                  <div className="text-slate-500">{entry.actorName} ({entry.actorRole}) · {new Date(entry.createdAt).toLocaleString()} · {entry.kind === "comment" ? "Human comment" : "Automatic log"}</div>
                  {editingComment === entry.id
                    ? <div className="mt-2 space-y-2">
                      <textarea aria-label="Edit history comment" value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)} className="w-full rounded border p-2" />
                      <button type="button" onClick={() => saveCommentEdit(entry.id)} className="text-blue-700">Save</button>
                      <button type="button" onClick={() => setEditingComment(null)} className="ml-3">Cancel</button>
                    </div>
                    : <p className="whitespace-pre-wrap">{entry.text}</p>}
                  {entry.kind === "comment" && entry.actorId === actorId && editingComment !== entry.id &&
                    <button type="button" onClick={() => { setEditingComment(entry.id); setCommentDraft(entry.text); }} className="mt-1 text-blue-700">Edit</button>}
                  {(entry.editHistory?.length ?? 0) > 0 && <details className="mt-1">
                    <summary className="cursor-pointer text-slate-600">(Edited) Previous Versions</summary>
                    {newestFirst(entry.editHistory ?? [], (version) => version.timestamp).map((version, index) => <div key={`${entry.id}-${index}`} className="mt-1 border-t pt-1">
                      <span className="text-slate-500">{new Date(version.timestamp).toLocaleString()}</span>
                      <p className="whitespace-pre-wrap">{version.text}</p>
                    </div>)}
                  </details>}
                </article>)}
              </div>
            </div>}
          </section>
          <section className="border-t pt-3">
            <button type="button" aria-expanded={checklistHistoryOpen} onClick={() => setChecklistHistoryOpen((value) => !value)}
              className="flex w-full items-center justify-between py-2 text-left font-semibold">
              <span>Checklist history</span><span>{checklistHistoryOpen ? "−" : "+"}</span>
            </button>
            {checklistHistoryOpen && <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-5">
                {([
                  ["timestamp", "Timestamp"],
                  ["performedBy", "Performed by"],
                  ["actionType", "Action type"],
                  ["stepReference", "Step reference"],
                  ["details", "Details"],
                ] as const).map(([field, label]) => <input key={field} aria-label={`Filter ${label}`}
                  placeholder={`Filter ${label}`} value={historyFilters[field]}
                  onChange={(event) => setHistoryFilters((current) => ({ ...current, [field]: event.target.value }))}
                  className="min-w-0 rounded border px-2 py-1 text-xs" />)}
              </div>
              <div className="max-h-40 overflow-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="bg-slate-50"><tr>
                    {["Timestamp", "Performed by", "Action type", "Step reference", "Details"].map((title) => <th key={title} className="p-2">{title}</th>)}
                  </tr></thead>
                  <tbody>{checklistHistory.filter((entry) =>
                    entry.timestamp.toLowerCase().includes(historyFilters.timestamp.toLowerCase()) &&
                    entry.performedBy.toLowerCase().includes(historyFilters.performedBy.toLowerCase()) &&
                    entry.actionType.toLowerCase().includes(historyFilters.actionType.toLowerCase()) &&
                    (entry.stepReference ?? "").toLowerCase().includes(historyFilters.stepReference.toLowerCase()) &&
                    entry.details.toLowerCase().includes(historyFilters.details.toLowerCase()),
                  ).map((entry) => <tr key={entry.id} className="border-t">
                    <td className="p-2">{new Date(entry.timestamp).toLocaleString()}</td><td className="p-2">{entry.performedBy}</td>
                    <td className="p-2">{entry.actionType}</td><td className="p-2">{entry.stepReference ?? "—"}</td><td className="p-2">{entry.details}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>}
          </section>
        </footer>
        </ResizableHistory>
      </section>

      {assignModalOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
        <section role="dialog" aria-modal="true" aria-label="Assign Craftperson" className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Assign Craftperson</h3>
            <button type="button" aria-label="Close assignment dialog" onClick={() => setAssignModalOpen(false)} className="px-2 text-xl">×</button>
          </div>
          <input aria-label="Filter craftspeople" value={craftFilter} onChange={(event) => setCraftFilter(event.target.value)}
            placeholder="Filter craftspeople..." className="my-3 w-full rounded border px-3 py-2" />
          <div className="max-h-72 overflow-auto">
            {data.craftspeople.filter((person) =>
              person.SiteId === activeSiteId &&
              (!workRequest.TradeId || person.Trade === workRequest.TradeId) &&
              !workRequest.AssignedCraftpersonIds?.includes(person.id) &&
              `${person.Name} ${person.LastName}`.toLowerCase().includes(craftFilter.toLowerCase()),
            ).map((person) => <div key={person.id} className="flex items-center justify-between border-t py-3">
              <span>{person.Name} {person.LastName} · {person.Trade} · {person.HourlyRate.toFixed(2)} EUR/hour</span>
              <button type="button" onClick={() => addCraftperson(person.id)} className="rounded bg-blue-700 px-3 py-1 text-sm text-white">Assign</button>
            </div>)}
            {data.users.filter((user) =>
              user.AssignedSiteIds.includes(activeSiteId) &&
              (!workRequest.TradeId || user.Trades.includes(workRequest.TradeId)) &&
              !workRequest.AssignedCraftpersonIds?.includes(user.UserId) &&
              user.DisplayName.toLowerCase().includes(craftFilter.toLowerCase()),
            ).map((user) => <div key={user.UserId} className="flex items-center justify-between border-t py-3">
              <span>{user.DisplayName}</span>
              <button type="button" onClick={() => addCraftperson(user.UserId)} className="rounded bg-blue-700 px-3 py-1 text-sm text-white">Assign</button>
            </div>)}
          </div>
          <p className="mt-3 text-xs text-slate-500">Assignments are recorded in the craftperson labor table; enter hourly rate and working time there.</p>
        </section>
      </div>}

      {executorOpen && <ChecklistExecutor isOpen workRequestId={workRequest.WR_ID}
        steps={checklistSteps} initialResults={workRequest.ChecklistResults}
        onClose={() => setExecutorOpen(false)}
        onProgress={(result) => updateChecklistResult(result, result.stepId)}
        onClear={(stepId) => updateChecklistResult(null, stepId)}
        onComplete={finishChecklist} />}
    </div>
  );
}

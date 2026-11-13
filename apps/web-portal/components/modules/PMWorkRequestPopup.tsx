"use client";
import { FrequencyPill, PmScope } from "../common/PmFrequency";
import { FieldUpdateBadges } from "./FieldUpdateBadges";

import React, { useEffect, useMemo, useState } from "react";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import { getChecklistFinding, getChecklistSteps, getFollowUpFJsForPM, getUnfavourableStepCount } from "@/lib/wr-signals";
import {
  BaseWorkRequest,
  PM_ScheduleStep,
  WR_Statuses,
} from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { QAAuditPanel } from "@/components/modules/QAAuditPanel";
import { QAChecklistReview } from "@/components/modules/QAChecklistReview";
import { completeChecklistInstances } from "@/lib/checklist-completion";
import { ChecklistExecutor } from "@/components/modules/ChecklistExecutor";
import { WRDetailsEditor } from "@/components/modules/WRDetailsEditor";
import { WorkRequestLabor, laborRows } from "@/components/modules/WorkRequestLabor";
import { assignPerson } from "@/lib/dispatch";
import { FreezeBadge, FreezeSafetyGate } from "@/components/modules/FreezeSafetyGate";
import { buildFreezeAcknowledgment, getWorkRequestFreezes, localNowIso } from "@/lib/location-freezes";
import { ResizableHistory } from "@/components/common/ResizableHistory";
import { newestFirst } from "@/lib/history-order";
import { hasOpenQARework } from "@/lib/qa-settings";
import { LocateInBimButton } from "@/components/common/LocateInBim";
import { PhotoCapture } from "@/components/common/PhotoCapture";
import { PmCoordinationWorkspace } from "@/components/modules/PmCoordinationWorkspace";
import { buildCoordinationItems } from "@/lib/pm-coordination";
import { PmClosureRequirements } from "@/components/modules/PmClosureRequirements";
import { applyClosureRequirements, emptyClosureDraft, hasClosureSelection, type ClosureDraft } from "@/lib/pm-closure-requirements";
import { canUpdatePmsRequirementsFromWr } from "@/lib/pm-requirements-guard";
import { PMDetailsPanel } from "./pm/PMDetailsPanel";
import { PMHistoryFooter } from "./pm/PMHistoryFooter";
import { PMKpiPanel } from "./pm/PMKpiPanel";
import { PMDocumentsPanel } from "./pm/PMDocumentsPanel";
import { PMChecklistSummaryPanel } from "./pm/PMChecklistSummaryPanel";
import { PMStakeholderAlignmentSection } from "./pm/PMStakeholderAlignmentSection";
import { PMFollowUpPanel } from "./pm/PMFollowUpPanel";
import { PMAuditLogPanel } from "./pm/PMAuditLogPanel";
import { PMSmartChecklistPanel } from "./pm/PMSmartChecklistPanel";
import { allocateWorkRequestId } from "@/lib/wr-id-migration";
import { isWrTerminal } from "./scheduler/scheduler-rules";

const TABS = [
  "Work request details",
  "Labor, parts & Completion",
  "KPI & Others",
  "Attached Documents",
  "Checklist",
  "PM Follow-up",
  "AuditLog",
  "Checklist - Smart PM",
  "Team Alignment & Notices",
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
  initialTab?: (typeof TABS)[number];
}

export function PMWorkRequestPopup({
  workRequest,
  onClose,
  onNavigate,
  onEscalateToLJ,
  initialTab = TABS[0],
}: PMWorkRequestPopupProps) {
  const { data, setData } = useCafmStore();
  const { permissions, profile } = useActiveUserPermissions();
  const { activeSiteId, activePerson, currentUser } = useSiteContext();
  const { currentRole } = useApp();
  const terminalReadOnly = isWrTerminal(workRequest);
  const coordinationItem = useMemo(() => buildCoordinationItems(data, 0).find((entry) => entry.wrId === workRequest.WR_ID), [data, workRequest.WR_ID]);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>(initialTab);
  useEffect(() => { setActiveTab(initialTab); }, [initialTab, workRequest.WR_ID]);
  const [checklistHistoryOpen, setChecklistHistoryOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [executorOpen, setExecutorOpen] = useState(false);
  const [executorUnlocked, setExecutorUnlocked] = useState(false);
  const [pendingFreezeStatus, setPendingFreezeStatus] = useState<StatusChoice | null>(null);
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
  const [fastJobStep, setFastJobStep] = useState("");

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
  const checklistSteps: PM_ScheduleStep[] = getChecklistSteps(workRequest, data);
  const unfavourableCount = getUnfavourableStepCount(workRequest, data);
  const equipment = workRequest.EquipmentCodes
    .map((code) => data.equipment.find((item) =>
      item.EquipmentCode === code && item.SiteId === workRequest.SiteId,
    ))
    .filter((item) => item !== undefined);
  const wrFreezes = getWorkRequestFreezes(workRequest, data.locationFreezes ?? [], localNowIso());
  const stampFreezeAcknowledgment = () => updateWorkRequest((current) => ({
    ...current, freezeAcknowledged: buildFreezeAcknowledgment(wrFreezes, actorName),
  }), `Freeze period safety acknowledgment confirmed by ${actorName}`);
  const linkedFastJobs = getFollowUpFJsForPM(workRequest.WR_ID, data.workRequests);
  const linkedLongJobs = data.workRequests.filter((item) => item.WR_Type === "LJ" && item.SiteId === workRequest.SiteId && item.ParentPM_WR_ID === workRequest.WR_ID);
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

  const canUpdatePms = canUpdatePmsRequirementsFromWr(profile, data.siteRoleAssignments, currentRole, activePerson, workRequest.SiteId);
  const [closureDraft, setClosureDraft] = useState<ClosureDraft>(emptyClosureDraft);
  const [closureMessage, setClosureMessage] = useState("");
  const commitClosureDraft = () => {
    if (!canUpdatePms || !hasClosureSelection(closureDraft)) return false;
    setData((current) => applyClosureRequirements(current, workRequest, closureDraft, actorName, true));
    setClosureDraft(emptyClosureDraft());
    return true;
  };
  const saveClosureDraft = () => {
    if (commitClosureDraft()) setClosureMessage(closureDraft.updateLinkedPms && workRequest.ScheduleId ? `Saved. PMS ${workRequest.ScheduleId} updated.` : "Saved on this work request.");
  };
  const closureBox = workRequest.WR_Type === "PM" && workRequest.Percentage !== 27 ? (
    <PmClosureRequirements workRequest={workRequest} draft={closureDraft} setDraft={setClosureDraft} canEdit={canUpdatePms}
      onSave={saveClosureDraft} message={closureMessage}
      onClose={canUpdatePms && permissions?.canCloseWR100 && workRequest.Percentage === 78 ? () => applyStatus(STATUS_CHOICES.find((item) => item.percentage === 100)!) : undefined} />
  ) : null;

  const applyStatus = (choice: StatusChoice, skipFreezeGate = false) => {
    if (terminalReadOnly) { window.alert("Closed or cancelled work requests are read-only."); return; }
    if ((choice.percentage === 78 && !permissions?.canCompleteWR78) || (choice.percentage === 100 && !permissions?.canCloseWR100)) { window.alert("You do not have permission for this status transition."); return; }
    if (choice.percentage === 78 && !skipFreezeGate && wrFreezes.length > 0 && !workRequest.freezeAcknowledged) {
      setPendingFreezeStatus(choice);
      return;
    }
    if (choice.percentage === 100 && hasOpenQARework(workRequest)) {
      window.alert("QA rework must be verified before closing.");
      return;
    }
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
    if (choice.percentage === 100) commitClosureDraft();
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
    if (!permissions?.canDefineChecklistPM) { window.alert("Only authorized team leaders, engineers or administrators can define a checklist."); return; }
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
    if (terminalReadOnly) { window.alert("Closed or cancelled work requests cannot be assigned."); return; }
    const craftperson = data.craftspeople.find((item) => item.id === userId && item.SiteId === activeSiteId);
    if (craftperson) {
      if ((workRequest.AssignedCraftpersonIds ?? []).includes(userId)) return;
      const labor = { craftpersonId: userId, hourlyRate: craftperson.HourlyRate, workingTimeMinutes: 0,
        name: craftperson.Name, lastName: craftperson.LastName };
      updateWorkRequest((current) => assignPerson(current, labor), `${currentRole} ${activePerson} assigned craftperson ${craftperson.Name} ${craftperson.LastName} (${craftperson.Trade}).`);
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
    updateWorkRequest((current) => assignPerson(current, labor), `${currentRole} ${activePerson} assigned craftperson ${user.DisplayName}.`);
    setAssignModalOpen(false);
    setCraftFilter("");
  };

  const addFollowUp = () => {
    if (!permissions?.canOpenFollowUpFJ) { window.alert("Permission required to create a follow-up FJ."); return; }
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
    const jobId = allocateWorkRequestId(data.workRequests);
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
      ParentWR_ID: workRequest.WR_ID,
      sourcePmWrId: workRequest.WR_ID,
      originatingChecklistStepId: fastJobStep || undefined,
      originatingChecklistStepLabel: checklistSteps.find((step) => step.StepId === fastJobStep)?.Title,
      EstimatedCostEur: 0,
      Urgency: fastJobUrgency,
      UpdatedAt: now,
      updatedAt: now,
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
              FollowUpFJIds: [...new Set([...(item.FollowUpFJIds ?? []), job.WR_ID])],
              UpdatedAt: now,
              updatedAt: now,
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
    setFastJobStep("");
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
          <div className="flex items-center gap-2">
            <LocateInBimButton siteId={workRequest.SiteId} buildingId={workRequest.bl_id}
              bimBuildingId={equipment[0]?.bimBuildingId} equipmentCode={equipment[0]?.EquipmentCode ?? workRequest.EquipmentCodes[0]}
              hasBimLink={!!equipment[0]?.bimGlobalId} />
            <button type="button" aria-label="Close WR Details Popup" onClick={onClose}
              className="rounded px-3 py-2 text-xl leading-none text-slate-600 hover:bg-slate-100">×</button>
          </div>
        </header>
        <FieldUpdateBadges wr={workRequest} />
        <nav aria-label="WR detail tabs" className="flex shrink-0 gap-1 border-b bg-white px-3 pt-2">
          {TABS.map((tab) => (
            <button type="button" key={tab} role="tab" aria-label={tab} title={tab} aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-t-md border px-3 py-2 text-xs font-medium whitespace-nowrap ${activeTab === tab
                ? "border-blue-600 bg-blue-50 font-semibold text-blue-800"
                : "border-transparent text-slate-600 hover:bg-slate-50"}`}>
              <span className="min-w-0 truncate">{tab}</span>
              {tab === "Checklist - Smart PM" && unfavourableCount > 0 && <span className="shrink-0 rounded-full bg-rose-100 px-1.5 text-rose-900">{unfavourableCount}</span>}
              {tab === "Team Alignment & Notices" && coordinationItem && <span className="shrink-0 rounded-full bg-slate-100 px-1.5">{coordinationItem.gate.state === "Cleared" ? "✅" : "⚠️"}</span>}
              {tab === "PM Follow-up" && linkedFastJobs.length > 0 && <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 text-indigo-900">{linkedFastJobs.length}</span>}
            </button>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <PmScope wr={workRequest} />
          {wrFreezes.length > 0 && <div className="mb-3"><FreezeBadge freezes={wrFreezes} /></div>}          {activeTab === "Work request details" && <PMDetailsPanel workRequest={workRequest} renderGroup={renderGroup} renderField={renderField} equipment={equipment} setInstallation={setInstallation} blueprint={blueprint} />}

          {activeTab === "Labor, parts & Completion" && <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">WR ID: {workRequest.WR_ID}</h3>
              {terminalReadOnly && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Read-only · labor history retained</span>}
              <button type="button" disabled={terminalReadOnly} onClick={() => setAssignModalOpen(true)}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">
                Assign Craftperson
              </button>
            </div>
            <WorkRequestLabor wr={workRequest} people={data.craftspeople} absences={data.craftpersonAbsences} freezes={data.locationFreezes} update={updateWorkRequest} onClose={onClose} activePerson={activePerson} actorRole={currentRole} canOverride={!!permissions?.canOverwriteLaborTime} />
            <div className="grid gap-3 rounded border bg-white p-4 md:grid-cols-[1fr_2fr]">
              <label className="text-sm font-medium">WR Statuses
                <select aria-label="WR Statuses" disabled={terminalReadOnly} value={currentStatusChoice?.key ?? ""}
                  onChange={(event) => {
                    const choice = STATUS_CHOICES.find((item) => item.key === event.target.value);
                    if (choice) applyStatus(choice);
                  }}
                  className="mt-1 block w-full rounded border px-3 py-2">
                  <option value="">Select a status</option>
                  {STATUS_CHOICES.map((item) => <option key={item.key} value={item.key} disabled={(item.percentage === 78 && !permissions?.canCompleteWR78) || (item.percentage === 100 && !permissions?.canCloseWR100)}>{item.label}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button type="button" disabled={terminalReadOnly} onClick={() => applyStatus(STATUS_CHOICES.find((item) => item.percentage === 27)!)}
                  className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700">Cancel WR (27%)</button>
                <button type="button" disabled={terminalReadOnly || !permissions?.canCompleteWR78} onClick={() => applyStatus(STATUS_CHOICES.find((item) => item.percentage === 78)!)}
                  className="rounded border border-blue-700 bg-white px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50">Technically Completed (78%)</button>
                <button type="button" disabled={terminalReadOnly || !permissions?.canCloseWR100} onClick={() => applyStatus(STATUS_CHOICES.find((item) => item.percentage === 100)!)}
                  className="rounded border border-blue-700 bg-white px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50">Complete (100%)</button>
              </div>
            </div>
            {closureBox}
            <div className="rounded border bg-white p-4">
              <label className="block text-sm font-medium">Message text
                <textarea value={message} onChange={(event) => setMessage(event.target.value)}
                  className="mt-1 block min-h-24 w-full rounded border p-3" />
              </label>
              <button type="button" disabled={!message.trim()} onClick={addComment}
                className="mt-2 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Post</button>
            </div>
          </div>}

          {activeTab === "KPI & Others" && <PMKpiPanel workRequest={workRequest} renderField={renderField} updateWorkRequest={updateWorkRequest} actorName={actorName} craftspeople={data.craftspeople} />}

          {activeTab === "Attached Documents" && <PMDocumentsPanel workRequest={workRequest} updateWorkRequest={updateWorkRequest} actorName={actorName} addDocument={addDocument} removeDocument={removeDocument} documentFilter={documentFilter} setDocumentFilter={setDocumentFilter} />}

          {activeTab === "Checklist" && <PMChecklistSummaryPanel workRequest={workRequest} blueprint={blueprint} checklistStandard={checklistStandard} checklistSteps={checklistSteps} />}

          {activeTab === "Team Alignment & Notices" && <PMStakeholderAlignmentSection coordinationItem={coordinationItem} closureBox={closureBox} />}
          {activeTab === "PM Follow-up" && <PMFollowUpPanel canOpenFollowUpFJ={permissions?.canOpenFollowUpFJ} fastJobDescription={fastJobDescription} setFastJobDescription={setFastJobDescription} fastJobUrgency={fastJobUrgency} setFastJobUrgency={setFastJobUrgency} addFollowUp={addFollowUp} followUpFilter={followUpFilter} setFollowUpFilter={setFollowUpFilter} fastJobStep={fastJobStep} setFastJobStep={setFastJobStep} checklistSteps={checklistSteps} linkedFastJobs={linkedFastJobs} linkedLongJobs={linkedLongJobs} onNavigate={onNavigate} onEscalateToLJ={onEscalateToLJ} />}

          {activeTab === "AuditLog" && <PMAuditLogPanel workRequest={workRequest} auditRows={auditRows} />}

          {activeTab === "Checklist - Smart PM" && <PMSmartChecklistPanel canDefineChecklistPM={permissions?.canDefineChecklistPM} checklistStandard={checklistStandard} chooseChecklist={chooseChecklist} blueprints={data.blueprints} workRequest={workRequest} blueprint={blueprint} checklistSteps={checklistSteps} setExecutorOpen={setExecutorOpen} stepFilter={stepFilter} setStepFilter={setStepFilter} stepCompletionFilter={stepCompletionFilter} setStepCompletionFilter={setStepCompletionFilter} />}
        </main>

        <PMHistoryFooter historyOpen={historyOpen} setHistoryOpen={setHistoryOpen} historyFilter={historyFilter} setHistoryFilter={setHistoryFilter} message={message} setMessage={setMessage} addComment={addComment} visibleHistory={visibleHistory} editingComment={editingComment} setEditingComment={setEditingComment} commentDraft={commentDraft} setCommentDraft={setCommentDraft} saveCommentEdit={saveCommentEdit} actorId={actorId} checklistHistoryOpen={checklistHistoryOpen} setChecklistHistoryOpen={setChecklistHistoryOpen} historyFilters={historyFilters} setHistoryFilters={setHistoryFilters} checklistHistory={checklistHistory} />
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
              <button type="button" disabled={terminalReadOnly} onClick={() => addCraftperson(person.id)} className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-40">Assign</button>
            </div>)}
            {data.users.filter((user) =>
              user.AssignedSiteIds.includes(activeSiteId) &&
              (!workRequest.TradeId || user.Trades.includes(workRequest.TradeId)) &&
              !workRequest.AssignedCraftpersonIds?.includes(user.UserId) &&
              user.DisplayName.toLowerCase().includes(craftFilter.toLowerCase()),
            ).map((user) => <div key={user.UserId} className="flex items-center justify-between border-t py-3">
              <span>{user.DisplayName}</span>
              <button type="button" disabled={terminalReadOnly} onClick={() => addCraftperson(user.UserId)} className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-40">Assign</button>
            </div>)}
          </div>
          <p className="mt-3 text-xs text-slate-500">Assignments are recorded in the craftperson labor table; enter hourly rate and working time there.</p>
        </section>
      </div>}

      {pendingFreezeStatus && <FreezeSafetyGate freezes={wrFreezes} unlockLabel="Confirm & Set to 78%" backLabel="Cancel"
        onBack={() => setPendingFreezeStatus(null)}
        onUnlock={() => { const choice = pendingFreezeStatus; setPendingFreezeStatus(null); stampFreezeAcknowledgment(); applyStatus(choice, true); }} />}
      {executorOpen && wrFreezes.length > 0 && !executorUnlocked && <FreezeSafetyGate freezes={wrFreezes}
        onBack={() => setExecutorOpen(false)}
        onUnlock={() => { stampFreezeAcknowledgment(); setExecutorUnlocked(true); }} />}
      {executorOpen && (wrFreezes.length === 0 || executorUnlocked) && <ChecklistExecutor isOpen workRequestId={workRequest.WR_ID}
        steps={checklistSteps} initialResults={workRequest.ChecklistResults}
        onClose={() => { setExecutorOpen(false); setExecutorUnlocked(false); }}
        onProgress={(result) => updateChecklistResult(result, result.stepId)}
        onClear={(stepId) => updateChecklistResult(null, stepId)}
        onComplete={finishChecklist} />}
    </div>
  );
}

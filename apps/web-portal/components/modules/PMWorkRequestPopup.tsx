"use client";
import { PmScope } from "../common/PmFrequency";
import { FieldUpdateBadges } from "./FieldUpdateBadges";

import React, { useEffect, useMemo, useState } from "react";
import { getChecklistProgress, getChecklistSteps, getFollowUpFJsForPM, getUnfavourableStepCount } from "@/lib/wr-signals";
import {
  BaseWorkRequest,
  PM_ScheduleStep,
  WR_Statuses,
} from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { completeChecklistInstances } from "@/lib/checklist-completion";
import { ChecklistExecutor } from "@/components/modules/ChecklistExecutor";
import { WorkRequestLabor } from "@/components/modules/WorkRequestLabor";
import { assignPerson } from "@/lib/dispatch";
import { FreezeSafetyGate } from "@/components/modules/FreezeSafetyGate";
import { buildFreezeAcknowledgment, getWorkRequestFreezes, localNowIso } from "@/lib/location-freezes";
import { releaseFutureSlots } from "@/lib/pm-early-start";
import { newestFirst } from "@/lib/history-order";
import { hasOpenQARework } from "@/lib/qa-settings";
import { LocateInBimButton } from "@/components/common/LocateInBim";
import { buildCoordinationItems } from "@/lib/pm-coordination";
import { PmClosureRequirements } from "@/components/modules/PmClosureRequirements";
import { applyClosureRequirements, emptyClosureDraft, hasClosureSelection, type ClosureDraft } from "@/lib/pm-closure-requirements";
import { canUpdatePmsRequirementsFromWr } from "@/lib/pm-requirements-guard";
import { PMDetailsPanel } from "./pm/PMDetailsPanel";
import { PMHistoryFooter } from "./pm/PMHistoryFooter";
import { PMKpiAndSlaPanel } from "./pm/PMKpiAndSlaPanel";
import { PMDocumentsPanel } from "./pm/PMDocumentsPanel";
import { PMIncompleteChecklistModal } from "./pm/PMIncompleteChecklistModal";
import { PMStakeholderAlignmentSection } from "./pm/PMStakeholderAlignmentSection";
import { PMFollowUpPanel } from "./pm/PMFollowUpPanel";
import { PMAuditLogPanel } from "./pm/PMAuditLogPanel";
import { PMSmartChecklistPanel } from "./pm/PMSmartChecklistPanel";
import { PMStatusActionBar, type PmHoldReason } from "./pm/PMStatusActionBar";
import { PMFreezeBanner } from "./pm/PMFreezeBanner";
import { PMAssignCraftpersonModal } from "./pm/PMAssignCraftpersonModal";
import { applyChecklistResult, applyChecklistFinish } from "./pm/pm-checklist-updates";
import { createFollowUpFastJob } from "@/lib/pm-follow-up";
import { isWrTerminal } from "./scheduler/scheduler-rules";
import { actorCanPmAction, resolveGovernanceActor } from "@/lib/governance-actor";
import { appendGovernanceLog } from "@/lib/wr-admin-actions";
import type { GovernanceProof } from "@/lib/wr-governance-types";
import { AdminOverrideControls } from "./pm/AdminOverrideControls";

const TABS = [
  "Work request details",
  "Labor, parts & Completion",
  "SLA, Costs & KPIs",
  "Attached Documents",
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
  const { data, setData, commitSnapshot } = useCafmStore();
  const { permissions, profile } = useActiveUserPermissions();
  const { activeSiteId, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const terminalReadOnly = isWrTerminal(workRequest);
  const statusReadOnly = workRequest.Percentage === 27 || workRequest.Percentage === 100;
  const governanceActor = workRequest.SiteId === activeSiteId ? resolveGovernanceActor(data, activeSiteId, activePerson) : null;
  const canCompletePm = actorCanPmAction(governanceActor, "pmWorkRequests.complete", data.featurePermissionOverrides);
  const canCancelPm = actorCanPmAction(governanceActor, "pmWorkRequests.cancel", data.featurePermissionOverrides);
  const coordinationItem = useMemo(() => buildCoordinationItems(data, 0).find((entry) => entry.wrId === workRequest.WR_ID), [data, workRequest.WR_ID]);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>(initialTab);
  useEffect(() => { setActiveTab(initialTab); }, [initialTab, workRequest.WR_ID]);
  const [checklistHistoryOpen, setChecklistHistoryOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [executorOpen, setExecutorOpen] = useState(false);
  const [executorUnlocked, setExecutorUnlocked] = useState(false);
  const [pendingFreezeStatus, setPendingFreezeStatus] = useState<StatusChoice | null>(null);
  const [checklistWarningOpen, setChecklistWarningOpen] = useState(false);
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

  const actorId = governanceActor?.id ?? activePerson;
  const actorName = governanceActor?.name ?? activePerson;
  const schedule = data.schedules.find((item) =>
    item.ScheduleId === workRequest.ScheduleId && item.SiteId === workRequest.SiteId,
  );
  const checklistStandard = workRequest.ChecklistStandardCode ?? schedule?.ChecklistCode ?? "";
  const blueprint = data.blueprints.find((item) =>
    item.ChecklistCode === checklistStandard &&
    (!item.SiteId || item.SiteId === workRequest.SiteId),
  );
  const checklistSteps: PM_ScheduleStep[] = getChecklistSteps(workRequest, data);
  const checklistProgress = getChecklistProgress(workRequest, data);
  const incompleteChecklistLabels = checklistProgress.incomplete.map((step, index) =>
    "StepId" in step ? `${step.SortOrder + 1}. ${step.Title}` : step.title);
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
    if (statusReadOnly) { window.alert("Closed or cancelled work requests are read-only."); return; }
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

  const canUpdatePms = canUpdatePmsRequirementsFromWr(profile, data.siteRoleAssignments, currentRole, activePerson, workRequest.SiteId);
  const [closureDraft, setClosureDraft] = useState<ClosureDraft>(emptyClosureDraft);
  const [closureMessage, setClosureMessage] = useState("");
  const commitClosureDraft = () => {
    if (statusReadOnly || !canUpdatePms || !hasClosureSelection(closureDraft)) return false;
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
      onClose={canUpdatePms && canCompletePm && workRequest.Percentage === 78 ? () => applyStatus(STATUS_CHOICES.find((item) => item.percentage === 100)!) : undefined} />
  ) : null;

  const applyStatus = (choice: StatusChoice, skipFreezeGate = false, checklistOverride = false, cancelReason?: string) => {
    if (statusReadOnly) { window.alert("Closed or cancelled work requests are read-only."); return; }
    if (workRequest.Percentage === 78 && (choice.percentage === 50 || choice.percentage === 55) && !permissions?.canCompleteWR78) { window.alert("You do not have permission for this status transition."); return; }
    if ((choice.percentage === 78 && !permissions?.canCompleteWR78) || (choice.percentage === 100 && !canCompletePm) || (choice.percentage === 27 && !canCancelPm)) { window.alert("You do not have permission for this status transition."); return; }
    if (choice.percentage === 27 && !cancelReason?.trim()) { window.alert("A cancellation reason is mandatory."); return; }
    if (choice.percentage === 78 && !skipFreezeGate && wrFreezes.length > 0 && !workRequest.freezeAcknowledged) {
      setPendingFreezeStatus(choice);
      return;
    }
    if (choice.percentage === 78 && incompleteChecklistLabels.length > 0 && !checklistOverride) {
      setChecklistWarningOpen(true);
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
    const closedAt = choice.percentage === 100 ? new Date().toISOString() : undefined;
    const checklistOverrideRecord = checklistOverride ? {
      overriddenAt: new Date().toISOString(),
      overriddenBy: actorName,
      incompleteStepIds: checklistProgress.incomplete.map((step) => "StepId" in step ? step.StepId : step.id),
    } : undefined;
    updateWorkRequest((current) => {
      const next = {
      ...current,
      ...status,
      Percentage: choice.percentage,
      ...(closedAt ? { ClosedAt: closedAt } : {}),
      ...(checklistOverrideRecord ? { ChecklistIncompleteOverride: checklistOverrideRecord } : {}),
      ...(checklistOverrideRecord ? { ChecklistCompleted: false } : {}),
      ...(reason ? { IsFrozen: true, FreezeReason: reason } : {}),
      ...(choice.percentage !== 55 ? { IsFrozen: false } : {}),
      };
      // Section 82: reaching 78% early releases any still-scheduled future calendar slots.
      return choice.percentage === 78 ? releaseFutureSlots(next, localNowIso(), actorId, actorName, currentRole) : next;
    }, `WR status changed from ${workRequest.Percentage}% to ${choice.percentage}% (${choice.label}) by ${actorName}${cancelReason ? `. Cancellation reason: ${cancelReason.trim()}` : ""}${checklistOverrideRecord ? ` with incomplete checklist override (${checklistOverrideRecord.incompleteStepIds.length} steps)` : ""}`);
  };

  const applyStatusByPercentage = (percentage: 50 | 55 | 78 | 100, holdReason?: PmHoldReason) => {
    const choice = STATUS_CHOICES.find((item) => item.percentage === percentage &&
      (percentage !== 55 || ("reason" in item && item.reason === holdReason)));
    if (choice) applyStatus(choice);
  };

  const cancelWorkRequest = (cancelReason: string) => {
    applyStatus(STATUS_CHOICES.find((item) => item.percentage === 27)!, false, false, cancelReason);
  };

  const reactivate = async (target: number, proof: GovernanceProof) => {
    if (!governanceActor?.isAdmin || !statusReadOnly || ![50, 55, 78].includes(target)) throw new Error("Reactivation is not permitted.");
    const configured = target === 55 ? undefined : WR_Statuses.find((item) => item.Percentage === target && item.ESAWorkType === workRequest.ESAWorkType);
    if (target !== 55 && !configured) throw new Error(`No WR_Statuses configuration exists for ${target}% ${workRequest.ESAWorkType}.`);
    const now = new Date().toISOString();
    const role = governanceActor.roles.includes("SuperAdmin") ? "SuperAdmin" : "SiteAdministrator";
    const text = `[Admin Reactivation] PM reactivated from ${workRequest.Percentage}% to ${target}% by ${governanceActor.name} (${role}). Reason: ${proof.reason}`;
    const next = appendGovernanceLog({ ...workRequest, Percentage: target,
      WorkRequestStatus: target === 55 ? "On Hold" : configured!.WorkRequestStatus,
      WorkRequestSubstatus: target === 55 ? "On Hold for Access" : configured!.WorkRequestSubstatus,
      ClosedAt: undefined, CompletedAt: target === 78 ? workRequest.CompletedAt : undefined,
      IsFrozen: target === 55, FreezeReason: target === 55 ? "Access" : undefined,
      ActiveFreezeName: undefined, PlannedFreezeText: undefined, FreezeStartedAt: target === 55 ? now : undefined, FreezeEndedAt: undefined,
      ReopenCount: (workRequest.ReopenCount ?? 0) + 1,
      ReopenedHistory: [...(workRequest.ReopenedHistory ?? []), { reopenedAt: now, fromPercentage: workRequest.Percentage, toPercentage: target, reason: proof.reason, actor: governanceActor.name }],
    }, governanceActor, text, now);
    await commitSnapshot(data, { ...data, workRequests: data.workRequests.map((item) =>
      item.WR_ID === workRequest.WR_ID && item.SiteId === workRequest.SiteId ? next : item) }, { governanceProof: proof });
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

  const updateChecklistResult = (result: ChecklistResult | null, stepId: string) => {
    const now = new Date().toISOString();
    updateWorkRequest((current) => applyChecklistResult(current, result, stepId, checklistSteps, { actorId, actorName, actorRole: currentRole }, now));
  };

  const finishChecklist = (results: ChecklistResult[]) => {
    const now = new Date().toISOString();
    let completedInstances = workRequest.ChecklistInstances;
    try {
      if (workRequest.ChecklistInstances) {
        completedInstances = completeChecklistInstances(workRequest.ChecklistInstances, results, actorId, now);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not complete the checklist.");
      return false;
    }
    updateWorkRequest((current) => applyChecklistFinish(current, results, completedInstances, checklistSteps.length, { actorId, actorName, actorRole: currentRole }, now),
      `Checklist finished by ${actorName}`);
    return true;
  };

  const addCraftperson = (userId: string) => {
    if (terminalReadOnly) { window.alert("Closed or cancelled work requests cannot be assigned."); return; }
    if ((workRequest.AssignedCraftpersonIds ?? []).includes(userId)) return;
    const craftperson = data.craftspeople.find((item) => item.id === userId && item.SiteId === activeSiteId);
    if (craftperson) {
      const labor = { craftpersonId: userId, hourlyRate: craftperson.HourlyRate, workingTimeMinutes: 0,
        name: craftperson.Name, lastName: craftperson.LastName };
      updateWorkRequest((current) => assignPerson(current, labor), `${currentRole} ${activePerson} assigned craftperson ${craftperson.Name} ${craftperson.LastName} (${craftperson.Trade}).`);
      setAssignModalOpen(false);
      return;
    }
    const user = data.users.find((item) => item.UserId === userId);
    if (!user) return;
    const names = user.DisplayName.trim().split(/\s+/);
    const lastName = names.pop() ?? user.DisplayName;
    const labor = { craftpersonId: userId, hourlyRate: 0, workingTimeMinutes: 0, name: names.join(" ") || lastName, lastName };
    updateWorkRequest((current) => assignPerson(current, labor), `${currentRole} ${activePerson} assigned craftperson ${user.DisplayName}.`);
    setAssignModalOpen(false);
  };

  const addFollowUp = () => {
    if (statusReadOnly) { window.alert("Closed or cancelled work requests are read-only."); return; }
    if (!permissions?.canOpenFollowUpFJ) { window.alert("Permission required to create a follow-up FJ."); return; }
    const result = createFollowUpFastJob(data, workRequest, {
      description: fastJobDescription, urgency: fastJobUrgency, stepId: fastJobStep,
      checklistSteps, actor: { id: actorId, name: actorName, role: currentRole },
    });
    if ("error" in result) { window.alert(result.error); return; }
    setData(() => result.next);
    setFastJobDescription("");
    setFastJobStep("");
  };

  const setInstallation = (equipmentCode: string, isInstallation: boolean) => {
    if (statusReadOnly) { window.alert("Closed or cancelled work requests are read-only."); return; }
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
          {statusReadOnly && governanceActor?.isAdmin ? <AdminOverrideControls title="Reactivate PM (Admin)" kind="pm-reactivation" wrId={workRequest.WR_ID}
            current={workRequest.Percentage} choices={[[50, "Issued"], [55, "On Hold for Access"], [78, "Technically Completed"]]} onSubmit={reactivate} /> : null}
          <PMFreezeBanner workRequest={workRequest} activeFreezes={wrFreezes} allFreezes={data.locationFreezes ?? []} />
          {activeTab === "Work request details" && <PMDetailsPanel workRequest={workRequest} renderGroup={renderGroup} renderField={renderField} equipment={equipment} setInstallation={setInstallation} blueprint={blueprint} />}

          {activeTab === "Labor, parts & Completion" && <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">WR ID: {workRequest.WR_ID}</h3>
              {terminalReadOnly && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Read-only · labor history retained</span>}
              <button type="button" disabled={terminalReadOnly} onClick={() => setAssignModalOpen(true)}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">
                Assign Craftperson
              </button>
            </div>
            <fieldset disabled={terminalReadOnly}><WorkRequestLabor wr={workRequest} people={data.craftspeople} absences={data.craftpersonAbsences} freezes={data.locationFreezes} update={updateWorkRequest} onClose={onClose} activePerson={activePerson} actorRole={currentRole} canOverride={!!permissions?.canOverwriteLaborTime} /></fieldset>
            <PMStatusActionBar workRequest={workRequest} permissions={permissions} terminalReadOnly={statusReadOnly} canCompletePm={canCompletePm} canCancelPm={canCancelPm}
              onApply={applyStatusByPercentage} onCancel={cancelWorkRequest} />
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

          {activeTab === "SLA, Costs & KPIs" && <PMKpiAndSlaPanel workRequest={workRequest} craftspeople={data.craftspeople} updateWorkRequest={updateWorkRequest} actorName={actorName} checklistTotal={checklistProgress.total} checklistCompleted={checklistProgress.completed} unfavourableCount={unfavourableCount} followUpCount={linkedFastJobs.length} />}

          {activeTab === "Attached Documents" && <PMDocumentsPanel workRequest={workRequest} updateWorkRequest={updateWorkRequest} actorName={actorName} addDocument={addDocument} removeDocument={removeDocument} documentFilter={documentFilter} setDocumentFilter={setDocumentFilter} />}

          {activeTab === "Team Alignment & Notices" && <PMStakeholderAlignmentSection coordinationItem={coordinationItem} closureBox={closureBox} />}
          {activeTab === "PM Follow-up" && <PMFollowUpPanel canOpenFollowUpFJ={permissions?.canOpenFollowUpFJ} fastJobDescription={fastJobDescription} setFastJobDescription={setFastJobDescription} fastJobUrgency={fastJobUrgency} setFastJobUrgency={setFastJobUrgency} addFollowUp={addFollowUp} followUpFilter={followUpFilter} setFollowUpFilter={setFollowUpFilter} fastJobStep={fastJobStep} setFastJobStep={setFastJobStep} checklistSteps={checklistSteps} linkedFastJobs={linkedFastJobs} linkedLongJobs={linkedLongJobs} onNavigate={onNavigate} onEscalateToLJ={onEscalateToLJ} />}

          {activeTab === "AuditLog" && <PMAuditLogPanel workRequest={workRequest} auditRows={auditRows} />}

          {activeTab === "Checklist - Smart PM" && <PMSmartChecklistPanel canChangeIssuedWRChecklist={permissions?.canChangeIssuedWRChecklist} isSiteAdmin={!!profile?.isSiteAdmin || !!profile?.isSuperAdmin} actorName={actorName} checklistStandard={checklistStandard} updateWorkRequest={updateWorkRequest} blueprints={data.blueprints} workRequest={workRequest} blueprint={blueprint} checklistSteps={checklistSteps} setExecutorOpen={setExecutorOpen} stepFilter={stepFilter} setStepFilter={setStepFilter} stepCompletionFilter={stepCompletionFilter} setStepCompletionFilter={setStepCompletionFilter} />}
        </main>

        <PMHistoryFooter historyOpen={historyOpen} setHistoryOpen={setHistoryOpen} historyFilter={historyFilter} setHistoryFilter={setHistoryFilter} message={message} setMessage={setMessage} addComment={addComment} visibleHistory={visibleHistory} editingComment={editingComment} setEditingComment={setEditingComment} commentDraft={commentDraft} setCommentDraft={setCommentDraft} saveCommentEdit={saveCommentEdit} actorId={actorId} checklistHistoryOpen={checklistHistoryOpen} setChecklistHistoryOpen={setChecklistHistoryOpen} historyFilters={historyFilters} setHistoryFilters={setHistoryFilters} checklistHistory={checklistHistory} />
      </section>

      {assignModalOpen && <PMAssignCraftpersonModal workRequest={workRequest} craftspeople={data.craftspeople} users={data.users}
        activeSiteId={activeSiteId} terminalReadOnly={terminalReadOnly} onAssign={addCraftperson} onClose={() => setAssignModalOpen(false)} />}

      {pendingFreezeStatus && <FreezeSafetyGate freezes={wrFreezes} unlockLabel="Confirm & Set to 78%" backLabel="Cancel"
        onBack={() => setPendingFreezeStatus(null)}
        onUnlock={() => { const choice = pendingFreezeStatus; setPendingFreezeStatus(null); stampFreezeAcknowledgment(); applyStatus(choice, true); }} />}
      {checklistWarningOpen && <PMIncompleteChecklistModal labels={incompleteChecklistLabels} onCancel={() => setChecklistWarningOpen(false)}
        onConfirm={() => { setChecklistWarningOpen(false); applyStatus(STATUS_CHOICES.find((item) => item.percentage === 78)!, true, true); }} />}
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

"use client";

import React, { useState } from "react";
import type { LocationFreeze, MissionEvent } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { formatHumanDateTime } from "@/lib/location-freezes";
import {
  MISSION_CONSTRAINTS, MISSION_CRITICALITY_STYLES, missionEventLabel, missionEventToFreeze,
  missionPublicationStatus, missionPublicationStatusLabel, missionZonesLabel,
} from "@/lib/mission-control";
import { MissionEventEditor } from "./MissionEventEditor";

export function MissionControl() {
  const { data, setData } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activeSiteId } = useSiteContext();
  const [editing, setEditing] = useState<MissionEvent | "new" | null>(null);
  const [error, setError] = useState("");
  const events = (data.missionEvents ?? []).filter((item) => item.siteId === activeSiteId);
  const canManage = !!permissions?.canManageMissionEvents;

  const publish = (item: MissionEvent) => {
    if (!canManage) { setError("Permission required: Manage Mission Events."); return; }
    setError("");
    const existingFreeze = item.freezeId ? data.locationFreezes.find((entry) => entry.id === item.freezeId) : undefined;
    const freezeId = existingFreeze?.id ?? crypto.randomUUID();
    setData((state) => {
      const current = (state.missionEvents ?? []).find((entry) => entry.siteId === activeSiteId && entry.id === item.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(item)) { queueMicrotask(() => setError("Mission event changed; reopen and retry.")); return state; }
      const freeze = missionEventToFreeze(current, freezeId);
      const hasFreeze = state.locationFreezes.some((entry) => entry.id === freezeId);
      return {
        ...state,
        missionEvents: (state.missionEvents ?? []).map((entry) => entry === current ? { ...current, freezeId } : entry),
        locationFreezes: hasFreeze ? state.locationFreezes.map((entry) => entry.id === freezeId ? freeze : entry) : [...state.locationFreezes, freeze],
      };
    });
  };

  const unpublish = (item: MissionEvent) => {
    if (!canManage) { setError("Permission required: Manage Mission Events."); return; }
    const status = missionPublicationStatus(item, data.locationFreezes);
    if (status === "published" && !window.confirm(`Remove the facility freeze for "${missionEventLabel(item)}"? The mission event itself is kept as a draft.`)) return;
    setError("");
    setData((state) => {
      const current = (state.missionEvents ?? []).find((entry) => entry.siteId === activeSiteId && entry.id === item.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(item)) { queueMicrotask(() => setError("Mission event changed; reopen and retry.")); return state; }
      return {
        ...state,
        missionEvents: (state.missionEvents ?? []).map((entry) => entry === current ? { ...current, freezeId: undefined } : entry),
        locationFreezes: current.freezeId ? state.locationFreezes.filter((entry) => entry.id !== current.freezeId) : state.locationFreezes,
      };
    });
  };

  const remove = (item: MissionEvent) => {
    if (!canManage) { setError("Permission required: Manage Mission Events."); return; }
    const message = item.freezeId && data.locationFreezes.some((entry) => entry.id === item.freezeId)
      ? `Delete "${missionEventLabel(item)}" and its published facility freeze?`
      : `Delete "${missionEventLabel(item)}"?`;
    if (!window.confirm(message)) return;
    setError("");
    setData((state) => {
      const current = (state.missionEvents ?? []).find((entry) => entry.siteId === activeSiteId && entry.id === item.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(item)) { queueMicrotask(() => setError("Mission event changed; retry.")); return state; }
      return {
        ...state,
        missionEvents: (state.missionEvents ?? []).filter((entry) => entry !== current),
        locationFreezes: current.freezeId ? state.locationFreezes.filter((entry) => entry.id !== current.freezeId) : state.locationFreezes,
      };
    });
  };

  const columns = [
    { id: "mission", label: "Mission", value: (item: MissionEvent) => missionEventLabel(item) },
    { id: "eventType", label: "Event Type", value: (item: MissionEvent) => item.eventType },
    { id: "criticality", label: "Criticality", value: (item: MissionEvent) => item.criticality, render: (item: MissionEvent) => <span className={`rounded px-2 py-0.5 text-xs font-semibold ${MISSION_CRITICALITY_STYLES[item.criticality]}`}>{item.criticality}</span> },
    { id: "window", label: "Ops Window", value: (item: MissionEvent) => `${formatHumanDateTime(item.startDateTime)} to ${formatHumanDateTime(item.endDateTime)}` },
    { id: "zones", label: "Affected Zones", value: (item: MissionEvent) => missionZonesLabel(item) },
    { id: "constraint", label: "Facility Constraint", value: (item: MissionEvent) => MISSION_CONSTRAINTS[item.facilityConstraint].missionLabel },
    { id: "status", label: "Status", value: (item: MissionEvent) => missionPublicationStatusLabel(missionPublicationStatus(item, data.locationFreezes)), render: (item: MissionEvent) => {
      const status = missionPublicationStatus(item, data.locationFreezes);
      const style = status === "published" ? "bg-emerald-100 text-emerald-900" : status === "freeze-removed" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
      return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${style}`}>{missionPublicationStatusLabel(status)}</span>;
    } },
    { id: "action", label: "Actions", value: (item: MissionEvent) => `Edit ${missionPublicationStatus(item, data.locationFreezes) === "published" ? "Unpublish" : "Publish"} Delete`, render: (item: MissionEvent) => {
      const status = missionPublicationStatus(item, data.locationFreezes);
      return <span className="space-x-2">
        <button disabled={!canManage} onClick={() => setEditing(item)} className="text-blue-700 underline disabled:opacity-40">Edit</button>
        <button disabled={!canManage} onClick={() => status === "published" ? unpublish(item) : publish(item)} className="text-blue-700 underline disabled:opacity-40">{status === "published" ? "Unpublish" : "Publish"}</button>
        <button disabled={!canManage} onClick={() => remove(item)} className="text-red-700 underline disabled:opacity-40">Delete</button>
      </span>;
    } },
  ];

  const activeWindows = events.filter((item) => item.startDateTime.slice(0, 10) <= formatToday() && formatToday() <= item.endDateTime.slice(0, 10));
  const missionFreezes = data.locationFreezes.filter((freeze: LocationFreeze) => freeze.title.startsWith("MISSION EVENT:"));

  return <div className="space-y-4 p-6">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold">Mission Control</h1>
        <p className="text-sm text-slate-600">Mission operations windows and their facility constraints, in mission planning language.</p>
      </div>
      <button disabled={!canManage} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-40" onClick={() => setEditing("new")}>+ Plan Mission Event</button>
    </div>
    {!canManage && <p role="status">Read-only: Manage Mission Events permission is required.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
      <p><strong>How this reaches the facility team:</strong> publishing an event creates a Location Freeze automatically. Mission planners never touch PM/FJ/LJ details; the constraint choice above decides them. The facility team keeps working in their own freezes view, dispatch disputes and PM banners exactly as before.</p>
      <p className="mt-1">{activeWindows.length} active window{activeWindows.length === 1 ? "" : "s"} today · {missionFreezes.length} mission freeze{missionFreezes.length === 1 ? "" : "s"} visible to facility teams.</p>
    </div>
    <OverviewTable preferenceKey="mission-events" columns={columns} rows={events} rowKey={(item) => item.id} />
    {editing && <MissionEventEditor key={editing === "new" ? "new" : editing.id} item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
  </div>;
}

function formatToday() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

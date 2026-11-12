"use client";

import { useMemo, useState } from "react";
import { PM_GATE_LABELS, formatDateDDMMYYYY } from "@cafm/shared-schema";
import type { PmGateState } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { buildCoordinationItems, needsAction } from "@/lib/pm-coordination";
import { GatePill, PmCoordinationWorkspace, TeamBadge } from "@/components/modules/PmCoordinationWorkspace";
import { StakeholderCatalogButton } from "@/components/modules/StakeholderCatalog";

const select = "rounded border px-2 py-1 text-sm";
type GateFilter = "all" | "action" | "postpone" | "discussion" | "cleared";
const GATE_FILTERS: Array<{ value: GateFilter; label: string; states: PmGateState[] }> = [
  { value: "all", label: "All gate statuses", states: ["None", "Action", "Discussion", "Postpone", "Cleared"] },
  { value: "action", label: "Action Needed", states: ["Action"] },
  { value: "postpone", label: "Postpone/Freeze Requested", states: ["Postpone"] },
  { value: "discussion", label: "Pending Discussion", states: ["Discussion"] },
  { value: "cleared", label: "Cleared", states: ["Cleared"] },
];

export function useCoordinationActionCount(horizonDays = 90) {
  const { data } = useCafmStore();
  return useMemo(() => buildCoordinationItems(data, horizonDays).filter(needsAction).length, [data, horizonDays]);
}

export function PmAlignmentHub({ onOpenWR, initialTeam = "", initialRequirement = "" }: { onOpenWR?: (wrId: string) => void; initialTeam?: string; initialRequirement?: string }) {
  const { data } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const [horizon, setHorizon] = useState(30);
  const [team, setTeam] = useState(initialTeam);
  const [requirement, setRequirement] = useState(initialRequirement);
  const [gate, setGate] = useState<GateFilter>("all");
  const [building, setBuilding] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const teams = (data.stakeholderTeams ?? []).filter((item) => item.siteId === activeSiteId);
  const requirements = (data.coordinationRequirements ?? []).filter((item) => item.siteId === activeSiteId);
  const items = useMemo(() => buildCoordinationItems(data, horizon), [data, horizon]);
  const rows = items.filter((item) => (!team || item.teamIds.includes(team)) && (!requirement || item.requirementIds.includes(requirement)) &&
    (!building || item.schedule.bl_id === building || item.wr?.bl_id === building || item.location.startsWith(building)) &&
    GATE_FILTERS.find((entry) => entry.value === gate)!.states.includes(item.gate.state));
  const kpi = {
    total: items.length,
    awaiting: items.filter((item) => item.gate.pendingTeams.length > 0 && item.gate.state !== "Cleared").length,
    notices: items.filter((item) => item.gate.pendingRequirements.length > 0 && item.gate.state !== "Cleared").length,
    postpone: items.filter((item) => item.gate.state === "Postpone").length,
    cleared: items.filter((item) => item.gate.state === "Cleared").length,
  };
  const selected = items.find((item) => item.key === selectedKey);
  const buildings = [...new Set(data.buildings.filter((item) => item.SiteId === activeSiteId).map((item) => String(item.bl_id)))];
  const card = (label: string, value: number, tone: string) => <div className={`rounded border p-3 ${tone}`}><div className="text-2xl font-bold">{value}</div><div className="text-xs">{label}</div></div>;

  return <section className="space-y-3" aria-label="Team Alignment and Newsflash Hub">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-bold">Team Alignment &amp; Newsflash Hub</h2>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <label className="text-sm">Horizon <select aria-label="Forecast horizon" className={select} value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>{[14, 30, 60, 90].map((days) => <option key={days} value={days}>{days} days</option>)}</select></label>
        <StakeholderCatalogButton />
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {card("Coordinated PMs in Horizon", kpi.total, "bg-white")}
      {card("Awaiting Team Clearance", kpi.awaiting, "bg-amber-50 text-amber-900")}
      {card("Newsflashes Pending", kpi.notices, "bg-amber-50 text-amber-900")}
      {card("Postpone / Freeze Requested", kpi.postpone, "bg-rose-50 text-rose-900")}
      {card("100% Cleared", kpi.cleared, "bg-emerald-50 text-emerald-900")}
    </div>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Filter by team" className={select} value={team} onChange={(event) => setTeam(event.target.value)}><option value="">All teams</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
      <select aria-label="Filter by requirement" className={select} value={requirement} onChange={(event) => setRequirement(event.target.value)}><option value="">All notices</option>{requirements.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
      <select aria-label="Filter by gate status" className={select} value={gate} onChange={(event) => setGate(event.target.value as GateFilter)}>{GATE_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <select aria-label="Filter by building" className={select} value={building} onChange={(event) => setBuilding(event.target.value)}><option value="">All buildings</option>{buildings.map((item) => <option key={item}>{item}</option>)}</select>
    </div>
    <div className="overflow-auto rounded border bg-white">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-slate-100"><tr><th className="p-2">Target / Due</th><th className="p-2">Source</th><th className="p-2">Equipment / Location</th><th className="p-2">Impact</th><th className="p-2">Team clearance</th><th className="p-2">Notice</th><th className="p-2">Overall gate</th></tr></thead>
        <tbody>
          {rows.map((item) => <tr key={item.key} tabIndex={0} className="cursor-pointer border-t hover:bg-sky-50 focus:bg-sky-50" onClick={() => setSelectedKey(item.key)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedKey(item.key); }}>
            <td className="whitespace-nowrap p-2">{formatDateDDMMYYYY(item.targetDate)} <span className={`rounded px-1 text-xs ${item.daysUntil < 0 ? "bg-rose-100 text-rose-800" : item.daysUntil <= 7 ? "bg-amber-100 text-amber-900" : "bg-slate-100"}`}>T{item.daysUntil >= 0 ? "-" : "+"}{Math.abs(item.daysUntil)}d</span></td>
            <td className="p-2">{item.source === "WR" ? `WR ${item.wrId}` : `Forecast PMS ${item.pmsId}`}</td>
            <td className="p-2"><div className="font-medium">{item.equipment}</div><div className="text-xs text-slate-500">{item.location}</div></td>
            <td className="max-w-64 p-2 text-xs">{item.impact || "—"}</td>
            <td className="p-2"><div className="flex flex-wrap gap-1">{item.teamIds.map((id) => {
              const entry = teams.find((candidate) => candidate.id === id);
              if (!entry) return null;
              const status = item.record?.teamStatuses[id]?.status ?? "Pending";
              const ok = status === "Approved" || status === "Conditional" || !entry.requiresApproval;
              return <span key={id} title={`${entry.name}: ${status.replace(/_/g, " ")}`} className={`rounded-full border px-2 text-xs font-semibold ${status === "Postpone_Requested" ? "border-rose-400 bg-rose-50 text-rose-800" : ok ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-amber-400 bg-amber-50 text-amber-800"}`}>{status === "Postpone_Requested" ? "⛔" : ok ? "✓" : "…"} {entry.code}</span>;
            })}</div></td>
            <td className="p-2"><div className="flex flex-wrap gap-1">{item.requirementIds.map((id) => {
              const entry = requirements.find((candidate) => candidate.id === id);
              if (!entry) return null;
              const status = item.record?.requirementStatuses[id]?.status ?? "Not_Started";
              return <span key={id} className="inline-flex items-center gap-1"><TeamBadge item={entry} small /><span className="text-xs">{status === "Published_Done" ? "Sent" : status === "Drafted" ? "Drafted" : "Not started"}</span></span>;
            })}</div></td>
            <td className="p-2"><GatePill state={item.gate.state} /></td>
          </tr>)}
          {!rows.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No coordinated PMs match the current filters in the next {horizon} days.</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="text-xs text-slate-500">{rows.length} of {items.length} coordinated PMs shown · gate legend: {Object.values(PM_GATE_LABELS).slice(1).join(" · ")}</p>
    {selected && <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={() => setSelectedKey("")}>
      <aside role="dialog" aria-modal="true" aria-label="Coordination and Discussion Drawer" className="h-full w-full max-w-3xl overflow-auto bg-slate-50 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">Coordination &amp; Discussion</h2>
          <span className="flex gap-2">{selected.wrId && onOpenWR && <button type="button" className="rounded border bg-white px-3 py-1" onClick={() => onOpenWR(selected.wrId!)}>Open WR</button>}<button type="button" className="rounded border bg-white px-3 py-1" onClick={() => setSelectedKey("")}>Close</button></span></div>
        <PmCoordinationWorkspace item={selected} onClose={() => setSelectedKey("")} />
      </aside>
    </div>}
  </section>;
}

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Download, Printer } from "lucide-react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { filterWorkRequests, type AnalyticsFilters } from "@/lib/analytics-engine";
import { DrilldownDrawer, downloadCsv, type DrilldownRequest } from "@/components/modules/analytics/analytics-ui";
import { SlaTab } from "@/components/modules/analytics/SlaTab";
import { LongJobsTab } from "@/components/modules/analytics/LongJobsTab";
import { AssetsTab } from "@/components/modules/analytics/AssetsTab";
import { TechniciansTab } from "@/components/modules/analytics/TechniciansTab";
import { AuditsTab } from "@/components/modules/analytics/AuditsTab";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";
import { FJWorkRequestPopup } from "@/components/modules/FJWorkRequestPopup";
import { LJWorkRequestPopup } from "@/components/modules/LJWorkRequestPopup";

const TABS = [
  { id: "sla", label: "SLA, OverDue & OverMargin" },
  { id: "lj", label: "Long Jobs (LJ) & Backlog" },
  { id: "assets", label: "Asset Reliability & Bad Actors" },
  { id: "tech", label: "Technician Productivity & Quality" },
  { id: "audits", label: "Audits, Findings & 5% QA" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AnalyticsPage() {
  const { data } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const { selectedBuilding } = useApp();
  const [tab, setTab] = useState<TabId>("sla");
  const [buildingId, setBuildingId] = useState<string>("");
  const [trade, setTrade] = useState<string>("");
  const [drill, setDrill] = useState<DrilldownRequest | null>(null);
  const [wrPopup, setWrPopup] = useState<BaseWorkRequest | null>(null);
  const exportRef = useRef<(() => { name: string; csv: string }) | null>(null);
  const registerExport = useCallback((build: () => { name: string; csv: string }) => { exportRef.current = build; }, []);
  const now = useMemo(() => new Date(), []);

  // Building filter stays in sync with the header Location Context (in-page override allowed).
  useEffect(() => { setBuildingId(selectedBuilding?.bl_id ?? ""); }, [selectedBuilding?.bl_id]);
  useEffect(() => { setDrill(null); setWrPopup(null); }, [activeSiteId]);

  const filters: AnalyticsFilters = useMemo(() => ({
    buildingId: buildingId || undefined,
    trade: trade || undefined,
  }), [buildingId, trade]);
  const wrs = useMemo(() => filterWorkRequests(data.workRequests, activeSiteId, filters), [data.workRequests, activeSiteId, filters]);
  const buildings = useMemo(() => data.buildings.filter((entry) => entry.SiteId === activeSiteId), [data.buildings, activeSiteId]);
  const trades = useMemo(() => [...new Set(data.workRequests
    .filter((wr) => wr.SiteId === activeSiteId)
    .map((wr) => wr.TradeName ?? wr.TradeId ?? "")
    .filter(Boolean))].sort(), [data.workRequests, activeSiteId]);
  const craftspeople = useMemo(() => data.craftspeople.filter((person) => person.SiteId === activeSiteId), [data.craftspeople, activeSiteId]);
  const equipment = useMemo(() => data.equipment.filter((asset) => asset.SiteId === activeSiteId), [data.equipment, activeSiteId]);
  const findings = data.auditFindings ?? [];

  const exportCurrentTab = () => {
    const build = exportRef.current;
    if (!build) return;
    const { name, csv } = build();
    downloadCsv(name, csv);
  };

  const openWr = (wr: BaseWorkRequest) => setWrPopup(wr);
  const actualPopupWr = wrPopup ? data.workRequests.find((entry) => entry.WR_ID === wrPopup.WR_ID && entry.SiteId === wrPopup.SiteId) ?? wrPopup : null;
  const navigatePopup = (id: string) => {
    const target = data.workRequests.find((entry) => entry.WR_ID === id && entry.SiteId === activeSiteId);
    if (target) setWrPopup(target);
    else alert(`Work request ${id} is not available at this site.`);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-5 print-area">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Global Analytics Header Bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="mr-auto">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><BarChart3 size={22} /> Executive Analytics</h1>
            <p className="text-xs text-gray-600">Live operational BI · {activeSiteId} · all dates DD-MM-YYYY</p>
          </div>
          <label className="text-xs font-medium text-gray-700 no-print">
            Building
            <select value={buildingId} onChange={(event) => setBuildingId(event.target.value)}
              className="ml-1.5 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs">
              <option value="">All Buildings</option>
              {buildings.map((building) => <option key={building.bl_id} value={building.bl_id}>{building.bl_id} · {building.Name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-700 no-print">
            Trade
            <select value={trade} onChange={(event) => setTrade(event.target.value)}
              className="ml-1.5 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs">
              <option value="">All Trades</option>
              {trades.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <button onClick={exportCurrentTab} className="no-print inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100">
            <Download size={14} /> Export Current Tab (.CSV)
          </button>
          <button onClick={() => window.print()} className="no-print inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <Printer size={14} /> Print / PDF Executive Summary
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5 no-print">
          {TABS.map((entry) => (
            <button key={entry.id} onClick={() => setTab(entry.id)} aria-pressed={tab === entry.id}
              className={`rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${tab === entry.id
                ? "bg-blue-600 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>
              {entry.label}
            </button>
          ))}
        </div>

        {tab === "sla" && <SlaTab wrs={wrs} now={now} onDrilldown={setDrill} registerExport={registerExport} />}
        {tab === "lj" && <LongJobsTab wrs={wrs} now={now} onDrilldown={setDrill} onOpenWr={openWr} registerExport={registerExport} />}
        {tab === "assets" && <AssetsTab wrs={wrs} findings={findings} equipment={equipment} siteId={activeSiteId}
          filters={filters} now={now} onDrilldown={setDrill} registerExport={registerExport} />}
        {tab === "tech" && <TechniciansTab wrs={wrs} craftspeople={craftspeople} now={now} onDrilldown={setDrill} registerExport={registerExport} />}
        {tab === "audits" && <AuditsTab findings={findings} siteId={activeSiteId} filters={filters} now={now} registerExport={registerExport} />}
      </div>

      {drill && <DrilldownDrawer request={drill} onClose={() => setDrill(null)} onOpenWr={openWr} />}

      {actualPopupWr && actualPopupWr.WR_Type === "PM" && (
        <PMWorkRequestPopup workRequest={actualPopupWr} onClose={() => setWrPopup(null)} onNavigate={navigatePopup}
          onEscalateToLJ={() => alert("Open the Work Requests page to escalate this PM to a Long Job.")} />
      )}
      {actualPopupWr && actualPopupWr.WR_Type === "FJ" && (
        <FJWorkRequestPopup workRequest={actualPopupWr} onClose={() => setWrPopup(null)} onNavigate={navigatePopup}
          onEscalateToLJ={() => alert("Open the Work Requests page to escalate this Fast Job to a Long Job.")} />
      )}
      {actualPopupWr && actualPopupWr.WR_Type === "LJ" && (
        <LJWorkRequestPopup workRequest={actualPopupWr} onClose={() => setWrPopup(null)} onNavigate={navigatePopup} />
      )}
    </div>
  );
}

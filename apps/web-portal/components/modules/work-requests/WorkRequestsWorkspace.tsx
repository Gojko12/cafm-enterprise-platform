"use client";

import React from "react";
import type { WR_Type } from "@cafm/shared-schema";
import { LongJobDrawer } from "@/components/modules/long-jobs/LongJobDrawer";
import { FastJobModal } from "@/components/modules/FastJobModal";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";
import { PmAlignmentHub, useCoordinationActionCount } from "@/components/modules/PmAlignmentHub";
import { FJWorkRequestPopup } from "@/components/modules/FJWorkRequestPopup";
import { LJWorkRequestPopup } from "@/components/modules/LJWorkRequestPopup";
import { WRDataGrid } from "@/components/modules/WRDataGrid";
import { useWorkRequestsQueue } from "./useWorkRequestsQueue";
import { WorkRequestsFilterBar, WorkRequestSignalFilters } from "./WorkRequestsFilterBar";
import { WorkRequestCards } from "./WorkRequestCards";

/**
 * Shared PM / FJ / LJ queue workspace rendered by the dedicated
 * `/preventive-maintenance`, `/fast-jobs` and `/long-jobs` routes.
 */
export function WorkRequestsWorkspace({ fixedType }: { fixedType: WR_Type }) {
  const queue = useWorkRequestsQueue(fixedType);
  const {
    workRequests, activeSiteId, view, filterVersion, groupLJ, pmView, setPmView, initialTab, setInitialTab,
    drawerOpen, setDrawerOpen, fastJobOpen, setFastJobOpen, drawerMode, setDrawerMode,
    selectedWR, setSelectedWR, pmPopupWR, setPmPopupWR, filteredRequests, setColumnFilterCount,
    handleViewWR, handleEscalateToLJ, handleSubmitWR, handleSubmitFJ,
  } = queue;
  const coordinationActionCount = useCoordinationActionCount(90);

  const signalFilters = <WorkRequestSignalFilters queue={queue} requestType={fixedType} />;
  const pmViewSwitcher = fixedType === "PM" ? <div className="flex flex-wrap gap-2" role="group" aria-label="PM view">
    <button type="button" aria-pressed={pmView === "queue"} onClick={() => setPmView("queue")} className={`rounded px-3 py-2 text-sm ${pmView === "queue" ? "bg-blue-600 text-white" : "border bg-white"}`}>PM Work Requests Queue</button>
    <button type="button" aria-pressed={pmView === "hub"} onClick={() => setPmView("hub")} className={`rounded px-3 py-2 text-sm ${pmView === "hub" ? "bg-blue-600 text-white" : "border bg-white"}`}>Team Alignment &amp; Newsflash Hub ({coordinationActionCount} needing action)</button>
  </div> : null;

  if (fixedType === "PM" && pmView === "hub") return (
    <div className="space-y-6 p-6">
      {pmViewSwitcher}
      <PmAlignmentHub onOpenWR={(id) => {
        const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
        if (!target) return;
        setInitialTab(undefined); setPmView("queue"); setPmPopupWR(target);
      }} />
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      {pmViewSwitcher}
      <WorkRequestsFilterBar queue={queue} requestType={fixedType} />
      {view === "card" && signalFilters}
      {view === "grid"
        ? <WRDataGrid key={`${activeSiteId}-${fixedType}-${filterVersion}`} requestType={fixedType} requests={filteredRequests} onOpen={handleViewWR} grouped={fixedType === "LJ" && groupLJ} onFilterCount={setColumnFilterCount} signalFilters={signalFilters} />
        : <WorkRequestCards queue={queue} requestType={fixedType} />}

      {pmPopupWR && <PMWorkRequestPopup
        initialTab={initialTab}
        key={`${pmPopupWR.SiteId}-${pmPopupWR.WR_ID}`}
        workRequest={workRequests.find((wr) => wr.WR_ID === pmPopupWR.WR_ID && wr.SiteId === pmPopupWR.SiteId) ?? pmPopupWR}
        onClose={() => setPmPopupWR(null)}
        onNavigate={(id) => {
          setInitialTab(undefined);
          const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
          if (!target) { alert(`Work request ${id} is not available at this site.`); return; }
          if (target.WR_Type === "LJ") {
            setPmPopupWR(null);
            setSelectedWR(target);
            setDrawerMode("view");
            setDrawerOpen(false);
          } else if (target.WR_Type === "FJ") {
            setPmPopupWR(null);
            setSelectedWR(target);
            setDrawerMode("view");
          } else {
            setPmPopupWR(target);
          }
        }}
        onEscalateToLJ={(wr) => {
          setPmPopupWR(null);
          handleEscalateToLJ(wr);
        }}
      />}
      {selectedWR && drawerMode === "view" && selectedWR.WR_Type === "FJ" && <FJWorkRequestPopup
        initialTab={initialTab === "Checklist - Smart PM" ? initialTab : undefined}
        key={`${selectedWR.SiteId}-${selectedWR.WR_ID}`}
        workRequest={workRequests.find((wr) => wr.WR_ID === selectedWR.WR_ID && wr.SiteId === selectedWR.SiteId) ?? selectedWR}
        onClose={() => setSelectedWR(null)}
        onNavigate={(id) => {
          setInitialTab(undefined);
          const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
          if (!target) { alert(`Work request ${id} is not available at this site.`); return; }
          if (target.WR_Type === "PM") {
            setSelectedWR(null);
            setPmPopupWR(target);
          } else {
            setSelectedWR(target);
            setDrawerMode("view");
          }
        }}
        onEscalateToLJ={(wr) => {
          setSelectedWR(null);
          handleEscalateToLJ(wr);
        }}
      />}
      {selectedWR && drawerMode === "view" && selectedWR.WR_Type === "LJ" && <LJWorkRequestPopup
        initialTab={initialTab === "Checklist - Smart PM" ? initialTab : undefined}
        key={`${selectedWR.SiteId}-${selectedWR.WR_ID}`}
        workRequest={workRequests.find((wr) => wr.WR_ID === selectedWR.WR_ID && wr.SiteId === selectedWR.SiteId) ?? selectedWR}
        onClose={() => setSelectedWR(null)}
        onNavigate={(id) => {
          setInitialTab(undefined);
          const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
          if (!target) { alert(`Work request ${id} is not available at this site.`); return; }
          if (target.WR_Type === "PM") {
            setSelectedWR(null);
            setPmPopupWR(target);
          } else setSelectedWR(target);
        }}
      />}
      <LongJobDrawer
        key={`${activeSiteId}-${drawerMode}-${selectedWR?.WR_ID || "new"}-${drawerOpen}`}
        isOpen={drawerOpen && drawerMode !== "view"}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmitWR}
        onNavigate={(id) => {
          const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
          if (!target) { alert(`Work request ${id} is not available at this site.`); return; }
          setSelectedWR(target);
          setDrawerMode("view");
        }}
        workRequest={selectedWR ? workRequests.find((wr) => wr.WR_ID === selectedWR.WR_ID && wr.SiteId === selectedWR.SiteId) ?? selectedWR : null}
        mode={drawerMode}
      />
      <FastJobModal
        isOpen={fastJobOpen}
        onClose={() => setFastJobOpen(false)}
        onSubmit={handleSubmitFJ}
      />
    </div>
  );
}

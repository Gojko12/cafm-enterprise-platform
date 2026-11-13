"use client";

import React from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { ResizeHandle, type TableColumn } from "../../common/TableColumns";
import { cannotScheduleMessage } from "./scheduler-rules";
import { tradeColor } from "../../../lib/trade-colors";

export function SchedulerPoolTable({ rows, columns, sort, onSort, width, onResize, isSchedulable, dragStart, dragEnd, cell, actions }: {
  rows: BaseWorkRequest[];
  columns: TableColumn<BaseWorkRequest>[];
  sort: { id: string; direction: "asc" | "desc" } | null;
  onSort: (id: string) => void;
  width: (id: string) => number;
  onResize: (id: string, value: number) => void;
  isSchedulable: (wr: BaseWorkRequest) => boolean;
  dragStart: (event: React.DragEvent, wr: BaseWorkRequest) => void;
  dragEnd: () => void;
  cell: (wr: BaseWorkRequest, id: string) => React.ReactNode;
  actions: (wr: BaseWorkRequest) => React.ReactNode;
}) {
  return <div className="max-h-[65vh] overflow-auto">
    <table className="table-fixed text-left text-xs" style={{ width: columns.reduce((total, column) => total + width(column.id), 120) }}>
      <colgroup>{columns.map((column) => <col key={column.id} style={{ width: width(column.id) }} />)}<col style={{ width: 120 }} /></colgroup>
      <thead className="sticky top-0 z-20 bg-white">
        <tr>{columns.map((column) => <th key={column.id} className="relative border-b p-1" title={column.label}>
          <button type="button" className="w-full truncate text-left" onClick={() => onSort(column.id)}>
            {column.label}{sort?.id === column.id ? sort.direction === "asc" ? " ▲" : " ▼" : ""}
          </button>
          <ResizeHandle label={column.label} width={width(column.id)} onResize={(value) => onResize(column.id, value)} />
        </th>)}<th className="border-b p-1">Actions</th></tr>
      </thead>
      <tbody>{rows.map((wr) => {
        const schedulable = isSchedulable(wr);
        return <tr key={`${wr.SiteId}-${wr.WR_ID}`} draggable={schedulable} onDragStart={(event) => dragStart(event, wr)} onDragEnd={dragEnd}
          title={schedulable ? undefined : cannotScheduleMessage(wr)}
          className={`border-t ${tradeColor(wr.TradeName)} ${schedulable ? "cursor-grab" : "cursor-not-allowed opacity-50"}`}>
          {columns.map((column) => <td key={column.id} className="truncate p-1" title={String(column.value(wr) ?? "")}>{cell(wr, column.id)}</td>)}
          <td className="p-1">{actions(wr)}</td>
        </tr>;
      })}</tbody>
    </table>
    {!rows.length && <p className="p-2">No matching work requests.</p>}
  </div>;
}

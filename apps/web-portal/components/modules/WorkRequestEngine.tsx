"use client";

import React, { useState, useMemo } from "react";
import { AlertCircle, Plus, MoreVertical, ChevronDown } from "lucide-react";
import type { BaseWorkRequest, WR_Type } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import { WR_Statuses } from "@cafm/shared-schema";

interface WorkRequestEngineProps {
  workRequests: BaseWorkRequest[];
  onSelectRequest: (wr: BaseWorkRequest) => void;
  onCreateFastJob: () => void;
}

type SortKey = keyof Pick<BaseWorkRequest, "WR_ID" | "DueDate" | "MarginDate" | "Percentage">;

export function WorkRequestEngine({
  workRequests,
  onSelectRequest,
  onCreateFastJob,
}: WorkRequestEngineProps) {
  const [filterType, setFilterType] = useState<WR_Type | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("WR_ID");
  const [sortAsc, setSortAsc] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    return workRequests
      .filter((wr) => {
        if (filterType !== "ALL" && wr.WR_Type !== filterType) return false;
        const query = searchQuery.toLowerCase();
        return (
          wr.WR_ID.toLowerCase().includes(query) ||
          wr.ESAWorkType.toLowerCase().includes(query) ||
          wr.TradeName?.toLowerCase().includes(query) ||
          wr.Description.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        let aVal: any = a[sortKey];
        let bVal: any = b[sortKey];
        
        // Convert date strings to comparable format
        if (sortKey === "DueDate" || sortKey === "MarginDate") {
          aVal = aVal ? new Date(aVal).getTime() : 0;
          bVal = bVal ? new Date(bVal).getTime() : 0;
        }
        
        const cmp = 
          typeof aVal === "number" && typeof bVal === "number"
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal));
        return sortAsc ? cmp : -cmp;
      });
  }, [workRequests, filterType, sortKey, sortAsc, searchQuery]);

  const getStatusBadgeColor = (percentage: number) => {
    if (percentage < 78) return "bg-yellow-100 text-yellow-800";
    if (percentage < 100) return "bg-blue-100 text-blue-800";
    return "bg-green-100 text-green-800";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Work Requests</h2>
        <button
          onClick={onCreateFastJob}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          <span>Fast Job</span>
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            WR Type
          </label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as WR_Type | "ALL")}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All</option>
            <option value="PM">PM</option>
            <option value="LJ">Long Job</option>
            <option value="FJ">Fast Job</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search
          </label>
          <input
            type="text"
            placeholder="WR ID, Trade, Description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sort By
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="WR_ID">WR ID</option>
            <option value="DueDate">Due Date</option>
            <option value="MarginDate">Margin Date</option>
            <option value="Percentage">Status %</option>
          </select>
        </div>
      </div>

      {/* Data Grid */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                WR ID
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Type
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Work Type
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Trade
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Location
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Equipment
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Due Date
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Margin Date
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Status
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((wr) => (
              <tr
                key={wr.WR_ID}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelectRequest(wr)}
              >
                <td className="px-6 py-4 text-sm font-medium text-blue-600">
                  {wr.WR_ID}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">
                    {wr.WR_Type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">{wr.ESAWorkType}</td>
                <td className="px-6 py-4 text-sm">{wr.TradeName || "—"}</td>
                <td className="px-6 py-4 text-sm">
                  {wr.bl_id} / {wr.LevelName} / {wr.RoomCode}
                </td>
                <td className="px-6 py-4 text-sm">
                  {wr.EquipmentCodes?.join(", ") || "—"}
                </td>
                <td className="px-6 py-4 text-sm">
                  {wr.DueDate ? formatDateDDMMYYYY(wr.DueDate) : "—"}
                </td>
                <td className="px-6 py-4 text-sm">
                  {wr.MarginDate ? formatDateDDMMYYYY(wr.MarginDate) : "—"}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeColor(
                      wr.Percentage
                    )}`}
                  >
                    {wr.Percentage}%
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-gray-500 hover:text-gray-700">
                    <MoreVertical size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="flex items-center justify-center py-12 bg-gray-50 rounded-lg">
          <div className="text-center">
            <AlertCircle size={40} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600">No work requests found</p>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <p className="text-yellow-800 font-semibold">
            {filtered.filter((w) => w.Percentage < 78).length}
          </p>
          <p className="text-yellow-600 text-xs">Issued</p>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-blue-800 font-semibold">
            {filtered.filter((w) => w.Percentage >= 78 && w.Percentage < 100).length}
          </p>
          <p className="text-blue-600 text-xs">Tech. Completed</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <p className="text-green-800 font-semibold">
            {filtered.filter((w) => w.Percentage === 100).length}
          </p>
          <p className="text-green-600 text-xs">Closed/Approved</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <p className="text-purple-800 font-semibold">{filtered.length}</p>
          <p className="text-purple-600 text-xs">Total</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useMemo } from "react";
import { QrCode, Download, BarChart3, Filter, ChevronDown } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import type { Equipment } from "@cafm/shared-schema";

export function EquipmentRegistry() {
  const { data } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const equipment = useMemo(() => data.equipment.filter((item) => item.SiteId === activeSiteId), [data.equipment, activeSiteId]);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState("");
  const [detailsOpen, setDetailsOpen] = useState<string | null>(null);
  const [showQrPreview, setShowQrPreview] = useState(false);

  // Define table columns
  const columns = useMemo<ColumnDef<Equipment>[]>(
    () => [
      {
        accessorKey: "EquipmentCode",
        header: "Equipment Code",
        cell: (info) => (
          <span className="font-mono font-semibold text-blue-600">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "EquipmentName",
        header: "Equipment Name",
        cell: (info) => <span>{info.getValue() as string}</span>,
      },
      {
        accessorKey: "LocalEquipmentCode",
        header: "Local Code",
        cell: (info) => (
          <span className="text-xs text-gray-600">
            {(info.getValue() as string) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "Criticality",
        header: "Criticality",
        cell: (info) => {
          const crit = info.getValue() as string;
          const colors: Record<string, string> = {
            Critical: "bg-red-100 text-red-800",
            High: "bg-orange-100 text-orange-800",
            Medium: "bg-yellow-100 text-yellow-800",
            Low: "bg-gray-100 text-gray-800",
          };
          return (
            <span
              className={`px-2 py-1 rounded text-xs font-semibold ${colors[crit] || ""}`}
            >
              {crit}
            </span>
          );
        },
      },
      {
        accessorKey: "Status",
        header: "Status",
        cell: (info) => (
          <span className="text-xs font-medium">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "RoomCode",
        header: "Room",
        cell: (info) => (
          <span className="text-sm text-gray-600">{info.getValue() as string}</span>
        ),
      },
    ],
    [],
  );

  // Filter data
  const filteredData = useMemo(() => {
    return equipment.filter((eq) =>
      eq.EquipmentCode.toLowerCase().includes(filterText.toLowerCase()) ||
      eq.EquipmentName.toLowerCase().includes(filterText.toLowerCase()) ||
      eq.LocalEquipmentCode
        ?.toLowerCase()
        .includes(filterText.toLowerCase()),
    );
  }, [equipment, filterText]);

  // Create table instance
  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const handleRowSelect = (equipmentCode: string, checked: boolean) => {
    const newSelection = new Set(selectedRows);
    if (checked) {
      newSelection.add(equipmentCode);
    } else {
      newSelection.delete(equipmentCode);
    }
    setSelectedRows(newSelection);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allCodes = new Set(
        table.getRowModel().rows.map((row) => row.original.EquipmentCode),
      );
      setSelectedRows(allCodes);
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleGenerateQrPdf = () => {
    alert(
      `Generating QR PDF with ${selectedRows.size} equipment items...\n\nIn production: Creates multi-label sheet with EquipmentCode, LocalEquipmentCode, RoomCode + QR SVG using jsPDF + QR library.`,
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">
          Equipment Registry & Asset Management
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          High-density filterable equipment table with batch QR code generator
        </p>
      </div>

      {/* Toolbar */}
      <div className="max-w-7xl mx-auto bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <Filter size={18} className="text-gray-600" />
          <input
            type="text"
            placeholder="Search equipment code, name, or local code..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          {selectedRows.size > 0 && (
            <>
              <span className="font-semibold">{selectedRows.size} selected</span>
              <button
                onClick={handleGenerateQrPdf}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <QrCode size={18} />
                Generate QR PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b border-gray-300">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedRows.size === table.getRowModel().rows.length &&
                      table.getRowModel().rows.length > 0
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </th>
                {table.getHeaderGroups().map((headerGroup) =>
                  headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  )),
                )}
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.original.EquipmentCode}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.original.EquipmentCode)}
                      onChange={(e) =>
                        handleRowSelect(
                          row.original.EquipmentCode,
                          e.target.checked,
                        )
                      }
                      className="rounded border-gray-300"
                    />
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-sm">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() =>
                        setDetailsOpen(
                          detailsOpen === row.original.EquipmentCode
                            ? null
                            : row.original.EquipmentCode,
                        )
                      }
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Equipment Details Modal */}
      {detailsOpen && (
        <div className="max-w-7xl mx-auto bg-blue-50 rounded-lg border border-blue-200 p-6">
          {(() => {
            const equipment = data.equipment.find(
              (e) => e.EquipmentCode === detailsOpen,
            );
            return equipment ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-blue-900">
                      {equipment.EquipmentName}
                    </h3>
                    <p className="text-sm text-blue-600 mt-1">
                      Code: {equipment.EquipmentCode}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetailsOpen(null)}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-blue-600 font-medium">
                      Manufacturer
                    </p>
                    <p className="font-semibold text-blue-900">
                      {equipment.Manufacturer}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Model</p>
                    <p className="font-semibold text-blue-900">
                      {equipment.Model}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-medium">
                      Serial Number
                    </p>
                    <p className="font-semibold text-blue-900">
                      {equipment.SerialNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-medium">
                      Criticality
                    </p>
                    <p className="font-semibold text-blue-900">
                      {equipment.Criticality}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-medium">
                      Installation Date
                    </p>
                    <p className="font-semibold text-blue-900">
                      {equipment.InstallationDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-medium">
                      Warranty Expiry
                    </p>
                    <p className="font-semibold text-blue-900">
                      {equipment.WarrantyExpiryDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Location</p>
                    <p className="font-semibold text-blue-900">
                      {equipment.RoomCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-medium">
                      BIM Global ID
                    </p>
                    <p className="font-mono text-xs font-semibold text-blue-900">
                      {equipment.BIM_GlobalId || "—"}
                    </p>
                  </div>
                </div>

                {Object.keys(equipment.TechnicalSpecifications).length > 0 && (
                  <div>
                    <p className="text-xs text-blue-600 font-medium mb-2">
                      Technical Specifications
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(equipment.TechnicalSpecifications).map(
                        ([key, value]) => (
                          <div key={key} className="bg-white p-2 rounded">
                            <p className="text-xs text-blue-600 font-medium">
                              {key}
                            </p>
                            <p className="text-sm font-semibold text-blue-900">
                              {String(value)}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowQrPreview(true);
                    setDetailsOpen(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <QrCode size={18} />
                  Show QR Scan Preview
                </button>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* QR Scan Preview Modal */}
      {showQrPreview && (
        <div className="max-w-7xl mx-auto fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full">
            <div className="text-center">
              <QrCode size={128} className="mx-auto mb-4 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                QR Code Scanner Preview
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                In production: This simulates the mobile ScanEquipmentQR workflow.
                Scanning opens equipment inspection, work requests, and maintenance history.
              </p>
              <button
                onClick={() => setShowQrPreview(false)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

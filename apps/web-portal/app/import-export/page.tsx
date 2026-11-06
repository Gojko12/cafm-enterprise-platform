"use client";

import React, { useState } from "react";
import { Upload, Download, AlertCircle } from "lucide-react";

type ImportEntityType = "locations" | "equipment" | "blueprints" | "schedules" | "trades" | "employees";

interface ValidationError {
  row: number;
  column: string;
  message: string;
  severity: "error" | "warning";
}

interface ImportPreview {
  entityType: ImportEntityType;
  newRecords: number;
  updatedRecords: number;
  errors: ValidationError[];
}

export default function ImportExportPage() {
  const [activeTab, setActiveTab] = useState<"import" | "export">("import");
  const [selectedEntity, setSelectedEntity] = useState<ImportEntityType>("locations");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const entities = [
    { id: "locations", label: "Locations (Buildings, Floors, Rooms)" },
    { id: "equipment", label: "Equipment Registry" },
    { id: "blueprints", label: "PM Checklist Blueprints" },
    { id: "schedules", label: "PM Schedules" },
    { id: "trades", label: "Trades & Skills" },
    { id: "employees", label: "Employees & Craftspeople" },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      // Simulate preview generation
      setPreview({
        entityType: selectedEntity,
        newRecords: 42,
        updatedRecords: 8,
        errors: [
          {
            row: 15,
            column: "EquipmentCode",
            message: "Duplicate equipment code",
            severity: "error",
          },
          {
            row: 23,
            column: "DueDate",
            message: "Invalid date format (expected YYYY-MM-DD)",
            severity: "error",
          },
          {
            row: 31,
            column: "ExpectedHours",
            message: "Value exceeds maximum (8 hours)",
            severity: "warning",
          },
        ],
      });
    }
  };

  const handleDownloadTemplate = () => {
    alert(`Downloaded ${selectedEntity} template as .xlsx`);
  };

  const handleCommitImport = () => {
    alert(
      `Imported ${preview?.newRecords} new records and updated ${preview?.updatedRecords} records`
    );
    setPreview(null);
    setUploadedFile(null);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Bulk Import / Export
        </h1>
        <p className="text-gray-600 mb-6">
          Upload .xlsx or .csv files with dry-run validation preview
        </p>

        {/* Tabs */}
        <div className="bg-white rounded-t-lg border-b border-gray-200 mb-6">
          <div className="px-6 py-4 flex gap-8">
            <button
              onClick={() => setActiveTab("import")}
              className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
                activeTab === "import"
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              Import
            </button>
            <button
              onClick={() => setActiveTab("export")}
              className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
                activeTab === "export"
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              Export
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-b-lg p-6">
          {activeTab === "import" ? (
            // IMPORT TAB
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Entity Type *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {entities.map((entity) => (
                    <label
                      key={entity.id}
                      className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                        selectedEntity === entity.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="entity"
                        value={entity.id}
                        checked={selectedEntity === entity.id}
                        onChange={(e) => setSelectedEntity(e.target.value as ImportEntityType)}
                        className="w-4 h-4"
                      />
                      <span className="font-medium text-gray-900">
                        {entity.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Upload File (.xlsx or .csv)
                </label>
                <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                  <Upload size={32} className="text-gray-400" />
                  <div className="text-center">
                    <p className="font-medium text-gray-900">
                      {uploadedFile?.name || "Click to upload or drag and drop"}
                    </p>
                    <p className="text-sm text-gray-600">
                      .xlsx or .csv files up to 50MB
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Download Template Button */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-blue-900">
                    Need a template?
                  </p>
                  <p className="text-sm text-blue-700">
                    Download the {selectedEntity} template with required columns
                  </p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap"
                >
                  <Download size={18} />
                  Download Template
                </button>
              </div>

              {/* Dry-Run Preview */}
              {preview && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-900">
                    Dry-Run Validation Preview
                  </h3>

                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm text-green-700">New Records</p>
                      <p className="text-3xl font-bold text-green-600">
                        {preview.newRecords}
                      </p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-700">Updated Records</p>
                      <p className="text-3xl font-bold text-blue-600">
                        {preview.updatedRecords}
                      </p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-700">Errors</p>
                      <p className="text-3xl font-bold text-red-600">
                        {preview.errors.filter((e) => e.severity === "error").length}
                      </p>
                    </div>
                  </div>

                  {/* Errors List */}
                  {preview.errors.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <p className="font-semibold text-gray-900 flex items-center gap-2">
                          <AlertCircle size={18} />
                          Validation Issues ({preview.errors.length})
                        </p>
                      </div>
                      <div className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
                        {preview.errors.map((error, i) => (
                          <div key={i} className="px-4 py-3 flex items-start gap-3">
                            <span
                              className={`text-xs font-bold px-2 py-1 rounded ${
                                error.severity === "error"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {error.severity.toUpperCase()}
                            </span>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                Row {error.row}, Column: {error.column}
                              </p>
                              <p className="text-sm text-gray-600">
                                {error.message}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Commit Button */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setPreview(null);
                        setUploadedFile(null);
                      }}
                      className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCommitImport}
                      className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                    >
                      Commit Import to Database
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // EXPORT TAB
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">Export Data</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {entities.map((entity) => (
                  <button
                    key={entity.id}
                    className="flex items-center justify-between gap-4 p-6 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                  >
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">
                        {entity.label}
                      </p>
                      <p className="text-sm text-gray-600">
                        Export as .xlsx file
                      </p>
                    </div>
                    <Download
                      size={24}
                      className="text-gray-400 group-hover:text-blue-600 transition-colors"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

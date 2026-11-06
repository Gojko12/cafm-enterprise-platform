"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle, Camera } from "lucide-react";

interface QAInspection {
  auditId: string;
  wrId: string;
  inspectedBy: string;
  result: "Pass" | "Fail";
  description?: string;
  comment?: string;
  score?: number;
  photos: string[];
  inspectedAt: string;
}

const SAMPLE_AUDITS: QAInspection[] = [
  {
    auditId: "audit-001",
    wrId: "2026000002",
    inspectedBy: "John Supervisor",
    result: "Fail",
    description: "Breaker installation incomplete",
    comment: "Additional screws and wire insulation needed",
    score: 65,
    photos: [],
    inspectedAt: new Date().toISOString(),
  },
];

export default function TechnicalAuditsPage() {
  const [audits, setAudits] = useState<QAInspection[]>(SAMPLE_AUDITS);
  const [filterResult, setFilterResult] = useState<"ALL" | "Pass" | "Fail">("ALL");
  const [selectedAudit, setSelectedAudit] = useState<QAInspection | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const filtered = audits.filter(
    (a) => filterResult === "ALL" || a.result === filterResult
  );

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Technical Audit & QA Inspection
        </h1>
        <p className="text-gray-600 mb-6">
          Audit completed work requests and equipment to ensure quality standards
        </p>

        {/* Filter Bar */}
        <div className="bg-white rounded-lg p-4 mb-6 flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Result
            </label>
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All</option>
              <option value="Pass">Pass</option>
              <option value="Fail">Fail</option>
            </select>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 self-end"
          >
            New Audit
          </button>
        </div>

        {/* Audits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((audit) => (
            <div
              key={audit.auditId}
              onClick={() => setSelectedAudit(audit)}
              className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg ${
                audit.result === "Pass"
                  ? "border-green-300 bg-green-50"
                  : "border-red-300 bg-red-50"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{audit.wrId}</p>
                  <p className="text-sm text-gray-600">{audit.auditId}</p>
                </div>
                {audit.result === "Pass" ? (
                  <CheckCircle2 size={24} className="text-green-600" />
                ) : (
                  <XCircle size={24} className="text-red-600" />
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-gray-600">Inspected by:</p>
                  <p className="font-medium">{audit.inspectedBy}</p>
                </div>
                {audit.score !== undefined && (
                  <div>
                    <p className="text-gray-600">Score:</p>
                    <p className="font-medium">{audit.score}/100</p>
                  </div>
                )}
              </div>

              {audit.result === "Fail" && (
                <button className="mt-4 w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium">
                  Reopen WR
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Detail Panel */}
        {selectedAudit && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Audit Details</h2>
                <button
                  onClick={() => setSelectedAudit(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">WR ID</p>
                    <p className="font-semibold text-lg">{selectedAudit.wrId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Result</p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedAudit.result === "Pass" ? (
                        <>
                          <CheckCircle2 size={20} className="text-green-600" />
                          <span className="font-semibold text-green-600">
                            {selectedAudit.result}
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle size={20} className="text-red-600" />
                          <span className="font-semibold text-red-600">
                            {selectedAudit.result}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Inspected by</p>
                    <p className="font-semibold">{selectedAudit.inspectedBy}</p>
                  </div>
                  {selectedAudit.score !== undefined && (
                    <div>
                      <p className="text-sm text-gray-600">Quality Score</p>
                      <p className="font-semibold text-lg">
                        {selectedAudit.score}
                        <span className="text-gray-600 text-sm">/100</span>
                      </p>
                    </div>
                  )}
                </div>

                {selectedAudit.description && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Issue Description
                    </p>
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {selectedAudit.description}
                    </p>
                  </div>
                )}

                {selectedAudit.comment && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      QA Comment
                    </p>
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {selectedAudit.comment}
                    </p>
                  </div>
                )}

                {selectedAudit.photos.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Evidence Photos ({selectedAudit.photos.length})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedAudit.photos.map((photo, i) => (
                        <div key={i} className="bg-gray-100 rounded-lg h-32 flex items-center justify-center">
                          <Camera size={24} className="text-gray-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedAudit.result === "Fail" && (
                  <button className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold">
                    Reopen Work Request
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

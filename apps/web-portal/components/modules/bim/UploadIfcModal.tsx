"use client";

import React, { useState } from "react";
import { Box, Loader2, Upload, X } from "lucide-react";
import type { Building } from "@cafm/shared-schema";
import { gunzipBytes, gzipBytes, loadBimModel, type BimSpace } from "@/lib/ifc-cafm-bridge";

// ---------------------------------------------------------------------------
// Upload .IFC Model modal
// ---------------------------------------------------------------------------

interface UploadPreview {
  buildingName: string;
  storeys: string[];
  spaces: BimSpace[];
  taggedCount: number;
  untaggedAssignableCount: number;
  elementCount: number;
}

export function UploadIfcModal({ siteId, buildings, onClose, onImported }: {
  siteId: string;
  buildings: Building[];
  onClose: () => void;
  onImported: (buildingId: string, buildingNameFromIfc: string) => Promise<void> | void;
}) {
  const [targetBuildingId, setTargetBuildingId] = useState<string>("__new__");
  const [fileName, setFileName] = useState("");
  const [stepBytes, setStepBytes] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (file: File) => {
    setError("");
    setPreview(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".ifc") && !lower.endsWith(".ifc.gz")) { setError("Choose a .ifc or .ifc.gz file."); return; }
    setParsing(true);
    try {
      let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzipBytes(bytes);
      const header = new TextDecoder().decode(bytes.slice(0, 64)).trimStart();
      if (!header.startsWith("ISO-10303-21")) throw new Error("The file is not a valid IFC STEP (ISO-10303-21) file.");
      setFileName(file.name);
      setStepBytes(bytes);
      const model = await loadBimModel(bytes);
      try {
        setPreview({
          buildingName: model.index.buildingName,
          storeys: model.index.storeys.map((storey) => storey.name),
          spaces: model.index.spaces,
          taggedCount: model.index.elements.filter((element) => element.mark).length,
          untaggedAssignableCount: model.index.elements.filter((element) => element.isAssignable && !element.mark).length,
          elementCount: model.index.elements.length,
        });
      } finally {
        model.dispose();
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Could not parse the .ifc file.");
      setStepBytes(null);
      setFileName("");
    } finally {
      setParsing(false);
    }
  };

  const sanitizeId = (value: string) => value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

  const importModel = async () => {
    if (!stepBytes || !preview) { setError("Choose and parse a .ifc file first."); return; }
    const buildingId = targetBuildingId === "__new__" ? sanitizeId(preview.buildingName) : targetBuildingId;
    if (!buildingId) { setError("The IFCBUILDING has no usable name; choose an existing target building."); return; }
    setImporting(true);
    setError("");
    try {
      // Gzip client-side so a 67MB .ifc uploads as a ~7-15MB .ifc.gz archive.
      const gz = await gzipBytes(stepBytes);
      const payload = gz ?? stepBytes;
      const form = new FormData();
      form.set("siteId", siteId);
      form.set("buildingId", buildingId);
      form.set("file", new Blob([payload as BlobPart], { type: gz ? "application/gzip" : "application/x-step" }), gz ? `${buildingId}.ifc.gz` : `${buildingId}.ifc`);
      const response = await fetch("/api/bim-models", { method: "POST", body: form });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body && typeof body === "object" && "error" in body ? String(body.error) : "The upload failed.");
      }
      await onImported(buildingId, preview.buildingName);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The upload failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Upload IFC model">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <strong className="text-sm">Upload .IFC Model</strong>
          <button aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="space-y-3 p-4 text-xs">
          <label className="block font-medium text-gray-700">
            Target Building
            <select value={targetBuildingId} onChange={(event) => setTargetBuildingId(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 bg-white">
              <option value="__new__">— Create new Building from IFCBUILDING —</option>
              {buildings.map((building) => <option key={building.bl_id} value={building.bl_id}>{building.bl_id} · {building.Name}</option>)}
            </select>
          </label>
          <div
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`rounded border-2 border-dashed p-5 text-center ${dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
          >
            <Box className="mx-auto mb-1 text-gray-400" size={22} />
            <p className="text-gray-600">{fileName || "Drag & drop a .ifc / .ifc.gz file here, or"}</p>
            <label className="mt-1 inline-block cursor-pointer rounded bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700">
              Browse…
              <input type="file" accept=".ifc,.gz" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} />
            </label>
          </div>
          {parsing && <p className="flex items-center gap-1.5 text-gray-600"><Loader2 className="animate-spin" size={13} /> Parsing the IFC model…</p>}
          {preview && (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-2.5 space-y-1 text-emerald-900">
              <p><strong>IFCBUILDING:</strong> {preview.buildingName || "—"}</p>
              <p><strong>Storeys ({preview.storeys.length}):</strong> {preview.storeys.join(", ") || "—"}</p>
              <p><strong>IfcSpace Rooms ({preview.spaces.length}):</strong> {preview.spaces.map((space) => space.code).join(", ") || "—"}</p>
              <p><strong>Elements:</strong> {preview.elementCount} total · {preview.taggedCount} Mark-tagged · {preview.untaggedAssignableCount} untagged assignable</p>
            </div>
          )}
          {error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-red-800">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-100">Cancel</button>
          <button onClick={() => void importModel()} disabled={!preview || importing || parsing}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {importing ? <Loader2 className="animate-spin" size={13} /> : <Upload size={13} />} Import Model
          </button>
        </div>
      </div>
    </div>
  );
}

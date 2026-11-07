"use client";

import React, { useEffect, useRef, useState } from "react";
import { useCafmStore, type DemoData } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { downloadSite, downloadTemplate, dryRun, entities, type Entity, type Preview } from "@/lib/bulk-import";

export default function ImportExportPage() {
  const { data, commitSnapshot } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const [entity, setEntity] = useState<Entity>("buildings");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [baseline, setBaseline] = useState<DemoData | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    generation.current++;
    setBusy(false);
    setFile(null);
    setPreview(null);
    setBaseline(null);
    setMessage("");
  }, [activeSiteId, entity]);

  const runPreview = async (selected: File) => {
    const request = ++generation.current;
    setFile(selected);
    setPreview(null);
    setBaseline(null);
    setMessage("");
    setBusy(true);
    try {
      if (selected.size > 10 * 1024 * 1024) throw new Error("File exceeds the 10 MB limit.");
      const buffer = await selected.arrayBuffer();
      const result = dryRun(buffer, selected.name, entity, data, activeSiteId);
      if (request !== generation.current) return;
      setPreview(result);
      setBaseline(data);
    } catch (error) {
      if (request === generation.current) setMessage(error instanceof Error ? error.message : "Could not read the file.");
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview || !baseline || preview.errors.length || !preview.diffs.length) return;
    setBusy(true);
    setMessage("");
    try {
      await commitSnapshot(baseline, preview.next);
      setMessage(`Saved ${preview.diffs.length} records to disk for ${activeSiteId}.`);
      setPreview(null);
      setBaseline(null);
      setFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const changed = baseline !== null && JSON.stringify(data) !== JSON.stringify(baseline);
  const newCount = preview?.diffs.filter((item) => item.operation === "Insert").length ?? 0;
  const updateCount = preview?.diffs.filter((item) => item.operation === "Update").length ?? 0;
  const button = "rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50";
  const display = (value: unknown) => {
    const text = value === undefined ? "(empty)" : JSON.stringify(value);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  };
  const exportData = (format: "xlsx" | "json" | "csv") => {
    try {
      downloadSite(data, activeSiteId, format, entity);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">Bulk Import / Export</h1>
      <p>Active site: <strong>{activeSiteId}</strong>. Each import updates one entity type; locations are imported as buildings, floors, then rooms.</p>
      <div className="space-y-4 rounded bg-white p-5 shadow">
        <label className="block font-medium" htmlFor="import-entity">Entity type</label>
        <select id="import-entity" value={entity} onChange={(event) => {
          const value = event.target.value;
          if (Object.prototype.hasOwnProperty.call(entities, value)) setEntity(value as Entity);
        }} className="rounded border p-2">
          {(Object.keys(entities) as Entity[]).map((key) => <option key={key} value={key}>{entities[key].label}</option>)}
        </select>
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={() => downloadTemplate(entity, "csv")}>Download CSV template</button>
          <button className={button} onClick={() => downloadTemplate(entity, "xlsx")}>Download Excel template</button>
        </div>
        <p className="text-sm text-gray-600">XLSX files must contain a sheet named <code>{entity}</code>. Nested values such as checklist steps and equipment codes use JSON in a cell. Blank update cells retain their previous value. Maximum 10 MB and 10,000 rows.</p>
        <label className="block font-medium" htmlFor="import-file">Upload CSV or XLSX for dry-run</label>
        <input id="import-file" type="file" accept=".csv,.xlsx" disabled={busy} onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected) void runPreview(selected);
        }} />
        {file && <p>File: {file.name}</p>}
        {message && <p role="status" className="rounded bg-amber-50 p-3">{message}</p>}
        {preview && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Dry-Run Validation &amp; Diff Preview</h2>
            <p>New Records to Insert: <strong>{newCount}</strong> · Existing Records to Update: <strong>{updateCount}</strong> · Errors: <strong>{preview.errors.length}</strong></p>
            {changed && <p role="alert" className="text-red-700">Site data changed since this preview. Upload the file again before committing.</p>}
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead><tr><th>Row</th><th>Operation</th><th>Unique code</th><th>Changed columns</th></tr></thead>
                <tbody>{preview.diffs.map((item) => <tr key={item.row} className="border-t align-top"><td>{item.row}</td><td>{item.operation}</td><td>{item.code}</td><td>{item.changes.length
                  ? item.changes.map((change) => <div key={change.field}><strong>{change.field}</strong>: {display(change.before)} → {display(change.after)}</div>)
                  : "No changes"}</td></tr>)}</tbody>
              </table>
            </div>
            {preview.errors.length > 0 && <div className="max-h-80 overflow-auto"><h3 className="font-semibold text-red-700">Row / Column Validation Errors</h3>
              <table className="w-full text-left text-sm"><thead><tr><th>Row</th><th>Column</th><th>Error</th></tr></thead>
                <tbody>{preview.errors.map((error, index) => <tr className="border-t" key={index}><td>{error.row}</td><td>{error.column}</td><td>{error.message}</td></tr>)}</tbody>
              </table></div>}
            <button className={button} disabled={busy || changed || preview.errors.length > 0 || !preview.diffs.length} onClick={() => void commit()}>Commit Import to Database</button>
          </div>
        )}
      </div>
      <div className="space-y-3 rounded bg-white p-5 shadow">
        <h2 className="text-xl font-semibold">Export Current Site Data</h2>
        <p>Excel includes all supported entity sheets. JSON includes the entire current site snapshot. CSV exports the selected entity.</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={() => exportData("xlsx")}>Export Excel</button>
          <button className={button} onClick={() => exportData("json")}>Export JSON</button>
          <button className={button} onClick={() => exportData("csv")}>Export selected CSV</button>
        </div>
      </div>
    </div>
  );
}

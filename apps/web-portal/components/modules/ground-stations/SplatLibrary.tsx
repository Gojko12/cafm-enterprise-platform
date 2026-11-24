"use client";

import React, { useMemo, useState } from "react";
import { ArrowUpRight, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { formatDateDDMMYYYY, SPLAT_EMBED_HOST_PATTERN, SPLAT_SHOWCASE_CATEGORIES, SPLAT_SHOWCASE_CATEGORY_LABELS, type SplatShowcase, type SplatShowcaseCategory } from "@cafm/shared-schema";

import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { REMOTE_STATIONS } from "@/lib/remote-stations";

let idCounter = 0;

/**
 * Accepts the iframe snippet copied from a superspl.at Embed dialog, a scene
 * link (https://superspl.at/scene/...) or a SHARE link of an annotated viewer
 * state (https://superspl.at/s?id=...): the share links carry the numbered
 * annotation points with their click-to-zoom cameras, which is exactly the
 * technician-training experience. Only superspl.at (and its subdomains) may
 * be framed; anything else is rejected with a message.
 */
export function parsePastedSplat(pasted: string): { embedSrc?: string; sceneUrl?: string; error?: string } {
  const text = pasted.trim();
  if (!text) return {};
  if (text.startsWith("<")) {
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(text)?.[1];
    if (!src) return { error: "No src found in the pasted iframe code." };
    if (!SPLAT_EMBED_HOST_PATTERN.test(src)) return { error: "The iframe must point at superspl.at." };
    return { embedSrc: src, sceneUrl: /https:\/\/superspl\.at\/scene\/[\w-]+/i.exec(src)?.[0] };
  }
  if (/^https:\/\//i.test(text)) {
    if (!SPLAT_EMBED_HOST_PATTERN.test(text)) return { error: "Only superspl.at URLs can be added." };
    return {
      embedSrc: text,
      sceneUrl: /https:\/\/superspl\.at\/scene\/[\w-]+/i.exec(text)?.[0],
    };
  }
  return { error: "Paste a superspl.at share or scene link, or the iframe code from its Embed dialog." };
}

export function SplatLibrary() {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { canAccess } = useApp();
  // V69 (Section 119): editing rights follow the groundStations.manage
  // permission: default Site Admin + Super Admin, configurable per role
  // (Feature Matrix) and per person (+/- in the exceptions tab).
  const canEdit = canAccess("groundStations.manage");

  const [categoryFilter, setCategoryFilter] = useState<SplatShowcaseCategory | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<SplatShowcaseCategory>("showcase");
  const [stationCode, setStationCode] = useState("");
  const [captureRef, setCaptureRef] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");

  const showcases = useMemo(() => (data.splatShowcases ?? []).filter((item) => item.siteId === activeSiteId), [data.splatShowcases, activeSiteId]);
  const visible = categoryFilter === "all" ? showcases : showcases.filter((item) => item.category === categoryFilter);
  const parsed = useMemo(() => parsePastedSplat(pasted), [pasted]);
  const editing = editingId ? showcases.find((item) => item.id === editingId) ?? null : null;

  const resetForm = () => {
    setEditingId(null); setPasted(""); setTitle(""); setStationCode(""); setCaptureRef(""); setDescription(""); setFormError("");
  };

  const startEdit = (entry: SplatShowcase) => {
    setEditingId(entry.id);
    setPasted(entry.embedSrc ?? entry.sceneUrl ?? "");
    setTitle(entry.title); setCategory(entry.category);
    setStationCode(entry.stationCode ?? ""); setCaptureRef(entry.captureRef ?? "");
    setDescription(entry.description ?? "");
    setFormError("");
    setFormOpen(true);
  };

  const saveShowcase = () => {
    setFormError("");
    if (!title.trim()) { setFormError("Give the entry a title."); return; }
    if (!parsed.embedSrc) { setFormError(parsed.error ?? "Paste a scene link or embed code."); return; }
    if (editing) {
      setData((current) => ({
        ...current,
        splatShowcases: (current.splatShowcases ?? []).map((item) => item.id === editing.id ? {
          ...item,
          title: title.trim(),
          category,
          embedSrc: parsed.embedSrc,
          sceneUrl: parsed.sceneUrl,
          stationCode: stationCode || undefined,
          captureRef: captureRef.trim() || undefined,
          description: description.trim() || undefined,
          editedBy: activePerson,
          editedAt: new Date().toISOString(),
        } : item),
      }));
    } else {
      idCounter = (idCounter + 1) % 100000;
      const entry: SplatShowcase = {
        id: `splat-${Date.now()}-${idCounter}`,
        siteId: activeSiteId,
        title: title.trim(),
        category,
        embedSrc: parsed.embedSrc,
        sceneUrl: parsed.sceneUrl,
        stationCode: stationCode || undefined,
        captureRef: captureRef.trim() || undefined,
        description: description.trim() || undefined,
        addedBy: activePerson,
        addedAt: new Date().toISOString(),
      };
      setData((current) => ({ ...current, splatShowcases: [...(current.splatShowcases ?? []), entry] }));
    }
    resetForm();
    setFormOpen(false);
  };

  const removeShowcase = (id: string) => {
    if (!window.confirm("Remove this showcase from the library?")) return;
    setData((current) => ({ ...current, splatShowcases: (current.splatShowcases ?? []).filter((item) => item.id !== id) }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="flex items-start gap-1"><Info size={13} className="mt-0.5 shrink-0" />
          <span><strong>Why splats:</strong> a drone flight or a photo walk with an ordinary camera, processed into a <strong>Gaussian splat</strong>, gives a walkable 3D model that runs in the browser, for a fraction of the cost of BIM modelling. superspl.at (the public SuperSplat scene gallery run by PlayCanvas) hosts and serves them. <strong>For technician training</strong> use the <em>share link</em> of a scene you annotated (it looks like <code className="rounded bg-slate-200 px-1">https://superspl.at/s?id=…</code>): those versions carry the numbered points on the model; clicking a point flies the camera straight to that detail. Paste that link here and the same experience runs in the card, with a full-screen button in the viewer toolbar. Next step after the viewer test: our own station and room captures (ESOC power plant, EAC ISS training rooms).</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setCategoryFilter("all")} aria-pressed={categoryFilter === "all"}
          className={`rounded-full border px-2.5 py-1 text-xs ${categoryFilter === "all" ? "border-slate-600 bg-slate-200 font-semibold" : "bg-white hover:bg-slate-50"}`}>
          All ({showcases.length})
        </button>
        {SPLAT_SHOWCASE_CATEGORIES.map((item) => (
          <button key={item} type="button" onClick={() => setCategoryFilter(item)} aria-pressed={categoryFilter === item}
            className={`rounded-full border px-2.5 py-1 text-xs ${categoryFilter === item ? "border-slate-600 bg-slate-200 font-semibold" : "bg-white hover:bg-slate-50"}`}>
            {SPLAT_SHOWCASE_CATEGORY_LABELS[item]} ({showcases.filter((entry) => entry.category === item).length})
          </button>
        ))}
        {canEdit && (
          <button type="button" onClick={() => { if (formOpen) { resetForm(); setFormOpen(false); } else { resetForm(); setFormOpen(true); } }}
            className="ml-auto rounded border border-blue-700 bg-white px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50">
            <Plus size={12} className="mr-1 inline" />{formOpen ? "Close" : "Add showcase"}
          </button>
        )}
      </div>

      {canEdit && formOpen && (
        <div className="space-y-2 rounded border bg-white p-3">
          <p className="text-xs font-semibold text-slate-700">{editing ? "Edit showcase" : "New showcase"}</p>
          <p className="text-xs text-slate-500">Paste the ANNOTATED share link (https://superspl.at/s?id=…) for training entries, a plain scene link, or the iframe code from a scene&apos;s Embed dialog.</p>
          <textarea value={pasted} onChange={(event) => setPasted(event.target.value)} rows={2}
            placeholder="https://superspl.at/s?id=…  or  https://superspl.at/scene/…  or  <iframe src=…>"
            className="w-full rounded border px-2 py-1.5 font-mono text-xs" />
          {parsed.error && pasted.trim() && <p className="text-xs text-rose-700">{parsed.error}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. MX5 work instructions, antenna field tour" className="mt-0.5 w-full rounded border px-2 py-1 text-sm" /></label>
            <label className="text-xs">Category
              <select value={category} onChange={(event) => setCategory(event.target.value as SplatShowcaseCategory)} className="mt-0.5 w-full rounded border px-2 py-1 text-sm">
                {SPLAT_SHOWCASE_CATEGORIES.map((item) => <option key={item} value={item}>{SPLAT_SHOWCASE_CATEGORY_LABELS[item]}</option>)}
              </select>
            </label>
            <label className="text-xs">Remote station (optional)
              <select value={stationCode} onChange={(event) => setStationCode(event.target.value)} className="mt-0.5 w-full rounded border px-2 py-1 text-sm">
                <option value="">not bound to a station</option>
                {REMOTE_STATIONS.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
              </select>
            </label>
            <label className="text-xs">Room / plant target (optional)<input value={captureRef} onChange={(event) => setCaptureRef(event.target.value)} placeholder="e.g. ESOC Power Plant" className="mt-0.5 w-full rounded border px-2 py-1 text-sm" /></label>
          </div>
          <label className="text-xs">Description (optional)<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-0.5 w-full rounded border px-2 py-1 text-sm" /></label>
          {formError && <p className="text-xs text-rose-700">{formError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={saveShowcase} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800">
              {editing ? "Save changes" : "Add to the library"}
            </button>
            <button type="button" onClick={() => { resetForm(); setFormOpen(false); }} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        {visible.length
          ? "Showing " + visible.length + " of " + showcases.length + " entries on this site."
          : "No entries on this site yet."}
        {!canEdit && " You need the Ground Stations manage permission to add or edit entries."}
      </p>

      {visible.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((entry) => (
            <SplatCard key={entry.id} showcase={entry} canEdit={canEdit}
              onEdit={() => startEdit(entry)} onRemove={() => removeShowcase(entry.id)} />
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed bg-white p-6 text-center text-sm text-slate-500">
          <p>No {categoryFilter === "all" ? "" : SPLAT_SHOWCASE_CATEGORY_LABELS[categoryFilter].toLowerCase()} entries on this site yet.</p>
          <p className="mt-1 text-xs">Add a superspl.at scene or annotated share link with the button above to show management what a splat looks like.</p>
        </div>
      )}
    </div>
  );
}

function SplatCard({ showcase, canEdit, onEdit, onRemove }: { showcase: SplatShowcase; canEdit: boolean; onEdit: () => void; onRemove: () => void }) {
  const station = REMOTE_STATIONS.find((item) => item.code === showcase.stationCode);
  const openHref = showcase.sceneUrl ?? showcase.embedSrc ?? "";
  return (
    <section className="overflow-hidden rounded border bg-white">
      {showcase.embedSrc ? (
        <iframe src={showcase.embedSrc} title={showcase.title} loading="lazy" allow="fullscreen; xr-spatial-tracking"
          className="h-64 w-full border-0 sm:h-80" />
      ) : (
        <a href={openHref} target="_blank" rel="noreferrer" className="flex h-48 items-center justify-center bg-slate-100 text-sm font-semibold text-blue-700">
          Open the scene ↗
        </a>
      )}
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{showcase.title}</h3>
          <span className="flex items-center gap-1">
            <a href={openHref} target="_blank" rel="noreferrer" title="Open full page (annotations, fullscreen)" className="text-slate-500 hover:text-slate-800"><ArrowUpRight size={14} /></a>
            {canEdit && <button type="button" onClick={onEdit} title="Edit" className="text-slate-400 hover:text-blue-700"><Pencil size={14} /></button>}
            {canEdit && <button type="button" onClick={onRemove} title="Remove" className="text-slate-400 hover:text-rose-700"><Trash2 size={14} /></button>}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{SPLAT_SHOWCASE_CATEGORY_LABELS[showcase.category]}</span>
          {station && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">{station.code} · {station.name}</span>}
          {showcase.captureRef && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{showcase.captureRef}</span>}
        </div>
        {showcase.category === "training" && showcase.embedSrc && (
          <p className="text-[11px] font-semibold text-slate-500">Training: click the numbered points in the viewer to fly to each detail; the toolbar has a full-screen button.</p>
        )}
        {showcase.description && <p className="text-xs text-slate-600">{showcase.description}</p>}
        <p className="text-[11px] text-slate-400">
          Added by {showcase.addedBy} · {formatDateDDMMYYYY(new Date(showcase.addedAt))}
          {showcase.editedBy && ` · edited by ${showcase.editedBy} on ${formatDateDDMMYYYY(new Date(showcase.editedAt ?? showcase.addedAt))}`}
        </p>
      </div>
    </section>
  );
}

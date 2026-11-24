"use client";

import React, { useMemo, useState } from "react";
import { ArrowUpRight, Info, Plus, Trash2 } from "lucide-react";
import { formatDateDDMMYYYY, SPLAT_EMBED_HOST_PATTERN, SPLAT_SHOWCASE_CATEGORIES, SPLAT_SHOWCASE_CATEGORY_LABELS, type SplatShowcase, type SplatShowcaseCategory } from "@cafm/shared-schema";

import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { REMOTE_STATIONS } from "@/lib/remote-stations";

let idCounter = 0;

/**
 * Accepts either the iframe snippet copied from a superspl.at scene page's
 * Embed dialog, or a plain superspl.at scene URL. Only superspl.at (and its
 * subdomains) may be framed; anything else is rejected with a message.
 */
function parsePastedSplat(pasted: string): { embedSrc?: string; sceneUrl?: string; error?: string } {
  const text = pasted.trim();
  if (!text) return {};
  if (text.startsWith("<")) {
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(text)?.[1];
    if (!src) return { error: "No src found in the pasted iframe code." };
    if (!SPLAT_EMBED_HOST_PATTERN.test(src)) return { error: "The iframe must point at superspl.at." };
    return { embedSrc: src, sceneUrl: /https:\/\/superspl\.at\/scene\/[\w-]+/i.exec(src)?.[0] };
  }
  if (/^https:\/\//i.test(text)) {
    if (!SPLAT_EMBED_HOST_PATTERN.test(text)) return { error: "Only superspl.at scene URLs can be added." };
    return { embedSrc: text, sceneUrl: /https:\/\/superspl\.at\/scene\/[\w-]+/i.exec(text)?.[0] };
  }
  return { error: "Paste a superspl.at scene link, or the iframe code from its Embed dialog." };
}

export function SplatLibrary() {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const canEdit = currentRole === "SuperAdmin" || currentRole === "SiteAdministrator";

  const [categoryFilter, setCategoryFilter] = useState<SplatShowcaseCategory | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
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

  const addShowcase = () => {
    setFormError("");
    if (!title.trim()) { setFormError("Give the entry a title."); return; }
    if (!parsed.embedSrc) { setFormError(parsed.error ?? "Paste a scene link or embed code."); return; }
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
    setAddOpen(false); setPasted(""); setTitle(""); setStationCode(""); setCaptureRef(""); setDescription("");
  };

  const removeShowcase = (id: string) => {
    if (!window.confirm("Remove this showcase from the library?")) return;
    setData((current) => ({ ...current, splatShowcases: (current.splatShowcases ?? []).filter((item) => item.id !== id) }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="flex items-start gap-1"><Info size={13} className="mt-0.5 shrink-0" />
          <span><strong>Why splats:</strong> a drone flight or a photo walk with an ordinary camera, processed into a <strong>Gaussian splat</strong>, gives a walkable 3D model that runs in the browser, for a fraction of the cost of BIM modelling. superspl.at (the public SuperSplat scene gallery run by PlayCanvas) hosts and serves them like the examples below. Next step after the viewer test: our own station and room captures (ESOC power plant, EAC ISS training rooms), as library entries and on each station card. To add your own: open a scene on superspl.at, press <strong>Embed</strong>, copy the iframe code and paste it here.</span>
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
          <button type="button" onClick={() => setAddOpen((open) => !open)}
            className="ml-auto rounded border border-blue-700 bg-white px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50">
            <Plus size={12} className="mr-1 inline" />{addOpen ? "Close" : "Add showcase"}
          </button>
        )}
      </div>

      {canEdit && addOpen && (
        <div className="space-y-2 rounded border bg-white p-3">
          <p className="text-xs text-slate-500">Paste the superspl.at iframe code from the scene&apos;s Embed dialog, or the scene link (https://superspl.at/scene/…).</p>
          <textarea value={pasted} onChange={(event) => setPasted(event.target.value)} rows={2}
            placeholder={'<iframe src="https://superspl.at/scene/…" …></iframe>  or  https://superspl.at/scene/…'}
            className="w-full rounded border px-2 py-1.5 font-mono text-xs" />
          {parsed.error && pasted.trim() && <p className="text-xs text-rose-700">{parsed.error}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Antenna field, drone capture" className="mt-0.5 w-full rounded border px-2 py-1 text-sm" /></label>
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
          <button type="button" onClick={addShowcase} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800">Add to the library</button>
        </div>
      )}

      {visible.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((entry) => (
            <SplatCard key={entry.id} showcase={entry} canEdit={canEdit} onRemove={() => removeShowcase(entry.id)} />
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed bg-white p-6 text-center text-sm text-slate-500">
          <p>No {categoryFilter === "all" ? "" : SPLAT_SHOWCASE_CATEGORY_LABELS[categoryFilter].toLowerCase()} entries on this site yet.</p>
          <p className="mt-1 text-xs">Add a superspl.at scene with the button above to show management what a splat looks like.</p>
        </div>
      )}
    </div>
  );
}

function SplatCard({ showcase, canEdit, onRemove }: { showcase: SplatShowcase; canEdit: boolean; onRemove: () => void }) {
  const station = REMOTE_STATIONS.find((item) => item.code === showcase.stationCode);
  return (
    <section className="overflow-hidden rounded border bg-white">
      {showcase.embedSrc ? (
        <iframe src={showcase.embedSrc} title={showcase.title} loading="lazy" allowFullScreen
          className="h-64 w-full border-0 sm:h-72" />
      ) : (
        <a href={showcase.sceneUrl} target="_blank" rel="noreferrer" className="flex h-48 items-center justify-center bg-slate-100 text-sm font-semibold text-blue-700">
          Open the scene ↗
        </a>
      )}
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{showcase.title}</h3>
          <span className="flex items-center gap-1">
            {showcase.sceneUrl && <a href={showcase.sceneUrl} target="_blank" rel="noreferrer" title="Open on superspl.at" className="text-slate-500 hover:text-slate-800"><ArrowUpRight size={14} /></a>}
            {canEdit && <button type="button" onClick={onRemove} title="Remove" className="text-slate-400 hover:text-rose-700"><Trash2 size={14} /></button>}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{SPLAT_SHOWCASE_CATEGORY_LABELS[showcase.category]}</span>
          {station && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">{station.code} · {station.name}</span>}
          {showcase.captureRef && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{showcase.captureRef}</span>}
        </div>
        {showcase.description && <p className="text-xs text-slate-600">{showcase.description}</p>}
        <p className="text-[11px] text-slate-400">Added by {showcase.addedBy} · {formatDateDDMMYYYY(new Date(showcase.addedAt))}</p>
      </div>
    </section>
  );
}

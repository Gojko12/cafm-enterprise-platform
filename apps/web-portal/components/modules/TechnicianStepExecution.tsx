"use client";

import React, { useEffect, useRef, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { PhotoCapture, PhotoThumbs } from "../common/PhotoCapture";

type Step = NonNullable<BaseWorkRequest["todoSteps"]>[number];

export function TechnicianStepExecution({ step, actor, actorRole, update }: {
  step: Step;
  actor: string;
  actorRole: string;
  update: (change: (wr: BaseWorkRequest) => BaseWorkRequest, log?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState(step);
  const [completed, setCompleted] = useState(step.completed);
  const [finding, setFinding] = useState(step.isFavourable === undefined ? "" : step.isFavourable ? "yes" : "no");
  const [comment, setComment] = useState(step.technicianComment ?? "");
  const [photos, setPhotos] = useState<string[]>(step.photoUrls ?? []);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const begin = () => {
    setBaseline(step); setCompleted(step.completed);
    setFinding(step.isFavourable === undefined ? "" : step.isFavourable ? "yes" : "no");
    setComment(step.technicianComment ?? ""); setPhotos(step.photoUrls ?? []); setError(""); setEditing(true);
  };
  const save = () => {
    if (JSON.stringify(step) !== JSON.stringify(baseline)) { setError("This step changed while being edited. Cancel and reopen it."); return; }
    if (reading) { setError("Wait for the photo to finish loading."); return; }
    const now = new Date().toISOString();
    update((wr) => {
      const current = wr.todoSteps?.find((item) => item.id === baseline.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(baseline)) {
        queueMicrotask(() => { if (mounted.current) setError("The step changed while being saved. Cancel and reopen it before retrying."); });
        return wr;
      }
      queueMicrotask(() => { if (mounted.current) setEditing(false); });
      return { ...wr, Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: actor, actorName: actor, actorRole, createdAt: now, text: `Updated execution for technician step: ${baseline.title}.` }], todoSteps: wr.todoSteps?.map((item) => item.id !== baseline.id ? item : {
        ...item, completed, completedBy: completed ? item.completedBy ?? actor : undefined,
        completedAt: completed ? item.completedAt ?? now : undefined,
        isFavourable: finding === "" ? undefined : finding === "yes",
        technicianComment: comment.trim() || undefined, photoUrls: photos,
      }) };
    });
  };
  if (!editing) return <button className="rounded border px-2 py-1 text-blue-700" onClick={begin}>Record execution</button>;
  return <div className="space-y-2 rounded bg-slate-50 p-3">
    <label className="block"><input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} /> Completed</label>
    <label className="block">Finding <select value={finding} onChange={(event) => setFinding(event.target.value)} className="rounded border p-1"><option value="">Not specified</option><option value="yes">Favourable</option><option value="no">Unfavourable</option></select></label>
    <label className="block">Technician Step Comment<textarea className="block w-full rounded border p-2" value={comment} onChange={(event) => setComment(event.target.value)} /></label>
    <PhotoCapture className="max-w-sm" disabled={reading} onPhotos={(urls) => { setError(""); setPhotos((items) => [...items, ...urls]); }} />
    <PhotoThumbs photos={photos} alt="Step photo" onRemove={(n) => setPhotos((items) => items.filter((_, k) => k !== n))} />
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <div className="flex gap-2"><button disabled={reading} className="rounded bg-blue-700 px-2 py-1 text-white" onClick={save}>Save execution</button><button disabled={reading} onClick={() => setEditing(false)}>Cancel</button></div>
  </div>;
}

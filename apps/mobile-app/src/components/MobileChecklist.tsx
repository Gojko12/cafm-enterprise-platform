import React, { useEffect, useRef, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import type { PM_StepDefinition } from "./ChecklistExecutor";

type Result = NonNullable<BaseWorkRequest["ChecklistResults"]>[number];

export function MobileChecklist({ wr, steps, save, exit, followUp }: {
  wr: BaseWorkRequest;
  steps: PM_StepDefinition[];
  save: (results: Result[], baseline: Result[]) => Promise<void>;
  exit: () => void;
  followUp: () => void;
}) {
  const [values, setValues] = useState<Result[]>(wr.ChecklistResults ?? []);
  const [index, setIndex] = useState(0);
  const [all, setAll] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const readingRef = useRef(false);
  const latest = useRef(values);
  const saved = useRef(JSON.stringify(values));
  const baseline = useRef(values);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const flush = async () => {
    const snapshot = latest.current;
    const serialized = JSON.stringify(snapshot);
    setSaving(true);
    const pending = queue.current.catch(() => undefined).then(async () => {
      if (serialized !== saved.current) {
        await save(snapshot, baseline.current);
        saved.current = serialized;
        baseline.current = snapshot;
      }
    });
    queue.current = pending;
    try { await pending; setError(""); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save checklist progress."); throw problem; }
    finally { setSaving(false); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { void flush().catch(() => undefined); }, 600);
    return () => window.clearTimeout(timer);
  }, [values]);
  const change = (step: PM_StepDefinition, patch: Partial<Result>) => {
    const previous = latest.current.find((item) => item.stepId === step.StepId);
    const next: Result = { stepId: step.StepId, value: "", passed: true, ...previous, ...patch, completedAt: patch.value !== undefined && JSON.stringify(patch.value) !== JSON.stringify(previous?.value) ? new Date().toISOString() : previous?.completedAt ?? new Date().toISOString() };
    const updated = [...latest.current.filter((item) => item.stepId !== step.StepId), next];
    latest.current = updated; setValues(updated);
  };
  const leaveSafely = (destination: () => void) => {
    if (readingRef.current) { setError("Wait for the photo to finish loading before leaving."); return; }
    setLeaving(true);
    void flush().then(destination).catch(() => setLeaving(false));
  };
  const renderStep = (step: PM_StepDefinition) => {
    const result = values.find((item) => item.stepId === step.StepId);
    const val = result?.value;
    return <article key={step.StepId} className="space-y-3 rounded border bg-white p-4">
      <h3 className="font-semibold">{step.StepNumber}. {step.StepTitle}</h3>
      {step.Instruction && <p className="text-sm text-slate-600">{step.Instruction}</p>}
      {step.InputType === "Boolean" && <div className="flex gap-2">{([true, false] as const).map((value) => <button key={String(value)} aria-pressed={val === String(value)} className={`rounded border px-3 py-2 ${val === String(value) ? "bg-blue-600 text-white" : ""}`} onClick={() => change(step, { value: String(value), passed: value === (step.favourableBoolean ?? true) })}>{value ? "Yes" : "No"}</button>)}</div>}
      {step.InputType === "Numeric" && <label>Measurement {step.Unit}<input type="number" className="block rounded border p-2" value={typeof val === "number" ? val : ""} onChange={(e) => { if (!e.target.value) { change(step, { value: "", passed: true }); return; } const number = Number(e.target.value); if (Number.isFinite(number)) change(step, { value: number, passed: (step.MinThreshold === undefined || number >= step.MinThreshold) && (step.MaxThreshold === undefined || number <= step.MaxThreshold) }); }} /></label>}
      {step.InputType === "FreeText" && <textarea aria-label="Observations" className="w-full rounded border p-2" value={typeof val === "string" ? val : ""} onChange={(e) => change(step, { value: e.target.value, passed: true })} />}
      {step.InputType === "SingleSelect" && <select aria-label="Answer" className="w-full rounded border p-2" value={typeof val === "string" ? val : ""} onChange={(e) => change(step, { value: e.target.value, passed: !step.Options?.find((option) => option.OptionValue === e.target.value)?.TriggersFailure })}><option value="">Select</option>{step.Options?.map((option) => <option key={option.OptionId} value={option.OptionValue}>{option.OptionValue}</option>)}</select>}
      {step.InputType === "MultiSelect" && step.Options?.map((option) => <label key={option.OptionId} className="block"><input type="checkbox" checked={Array.isArray(val) && val.includes(option.OptionValue)} onChange={(e) => { const selected = Array.isArray(val) ? val : []; const next = e.target.checked ? [...selected, option.OptionValue] : selected.filter((item) => item !== option.OptionValue); change(step, { value: next, passed: !step.Options?.some((item) => next.includes(item.OptionValue) && item.TriggersFailure) }); }} /> {option.OptionValue}</label>)}
      {result && <div className="space-y-2 rounded bg-slate-50 p-3">{!result.passed && <p className="text-rose-700">Unfavourable · {step.RequiresCommentOnFailure !== false ? "comment required" : "comment optional"} · {step.RequiresPhotoOnFailure !== false ? "photo required" : "photo optional"}</p>}<textarea aria-label="Technician comment" className="w-full rounded border p-2" value={result.comment ?? ""} onChange={(e) => change(step, { comment: e.target.value })} /><label className="block cursor-pointer text-blue-700">📷 Add photo<input type="file" className="hidden" accept="image/*" disabled={reading} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { setError("Choose an image no larger than 2 MB."); return; } readingRef.current = true; setReading(true); const reader = new FileReader(); reader.onerror = () => setError("Could not read photo."); reader.onload = () => { if (typeof reader.result === "string") change(step, { photoPaths: [...(latest.current.find((item) => item.stepId === step.StepId)?.photoPaths ?? []), reader.result] }); else setError("Could not read photo."); }; reader.onloadend = () => { readingRef.current = false; setReading(false); }; reader.readAsDataURL(file); }} /></label>{result.photoPaths?.map((url, i) => <a key={i} href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">Photo {i + 1}</a>)}{!result.passed && <button className="block rounded bg-emerald-700 px-3 py-2 text-white" onClick={() => leaveSafely(followUp)}>+ Follow-Up FJ</button>}</div>}
    </article>;
  };
  return <div className="space-y-3 p-4 pt-48 pb-24"><div className="sticky top-36 z-30 space-y-2 rounded border bg-white p-3"><button disabled={leaving} className="text-blue-700" onClick={() => leaveSafely(exit)}>← Exit to WR Overview (Progress Auto-Saved)</button><div className="flex gap-2"><button aria-pressed={!all} onClick={() => setAll(false)}>Step-by-Step Mode</button><button aria-pressed={all} onClick={() => setAll(true)}>All Steps List Mode</button></div><div className="flex flex-wrap gap-1">{steps.map((step, i) => <button key={step.StepId} className={`rounded-full border px-2 py-1 text-xs ${!all && i === index ? "bg-blue-600 text-white" : "bg-white"}`} onClick={() => { setIndex(i); setAll(false); }}>Step {i + 1}{values.some((item) => item.stepId === step.StepId && item.value !== "") ? " ✓" : ""}</button>)}</div><p className="text-xs">{reading ? "Loading photo…" : saving ? "Saving…" : error ? "Progress not saved" : JSON.stringify(values) !== saved.current ? "Changes pending…" : "Progress saved locally"}</p></div>
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}
    <fieldset disabled={leaving} className="space-y-3">
    {all ? steps.map(renderStep) : steps[index] ? renderStep(steps[index]) : <p>No checklist steps available.</p>}
    {!all && <div className="flex gap-2"><button disabled={index === 0} onClick={() => setIndex(index - 1)}>← Previous</button><button disabled={index >= steps.length - 1} onClick={() => setIndex(index + 1)}>Next →</button></div>}
    </fieldset>
  </div>;
}

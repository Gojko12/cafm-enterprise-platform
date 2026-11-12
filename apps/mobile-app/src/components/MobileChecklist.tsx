import React, { useEffect, useRef, useState } from "react";
import { FrequencyPill, PmScope } from "../../../web-portal/components/common/PmFrequency";
import { PhotoCapture, PhotoThumbs } from "../../../web-portal/components/common/PhotoCapture";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import type { PM_StepDefinition } from "./ChecklistExecutor";

type Result = NonNullable<BaseWorkRequest["ChecklistResults"]>[number];

export function MobileChecklist({ wr, steps, save, exit, followUp, complete, todoMode = false, timerLabel, timerRunning, navigationRef, startStep = 0, canAmend = false }: {
  wr: BaseWorkRequest;
  steps: PM_StepDefinition[];
  startStep?: number;
  save: (results: Result[], baseline: Result[]) => Promise<void>;
  exit: () => void;
  followUp?: (step: { id: string; label: string }) => void;
  canAmend?: boolean;
  complete?: () => void;
  todoMode?: boolean;
  timerLabel: string;
  timerRunning: boolean;
  navigationRef: React.MutableRefObject<((destination: () => void) => void) | null>;
}) {
  const [values, setValues] = useState<Result[]>(wr.ChecklistResults ?? []);
  const [index, setIndex] = useState(Math.max(0, Math.min(startStep, Math.max(0, steps.length - 1))));
  const [all, setAll] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const review = wr.Percentage >= 78;
  const readOnly = review && !(wr.Percentage === 78 && canAmend && unlocked);
  const editable = !readOnly && (review || timerRunning);
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
    if (!editable) { setError("Unlock the completed checklist or start timing before changing answers."); return; }
    const previous = latest.current.find((item) => item.stepId === step.StepId);
    const next: Result = { stepId: step.StepId, value: "", passed: true, ...previous, ...patch, completedAt: patch.value !== undefined && JSON.stringify(patch.value) !== JSON.stringify(previous?.value) ? new Date().toISOString() : previous?.completedAt ?? new Date().toISOString() };
    const updated = [...latest.current.filter((item) => item.stepId !== step.StepId), next];
    latest.current = updated; setValues(updated);
  };
  const leaveSafely = (destination: () => void, stays = false) => {
    if (readingRef.current) { setError("Wait for the photo to finish loading before leaving."); return; }
    setLeaving(true);
    void flush().then(() => { destination(); if (stays) setLeaving(false); }).catch(() => setLeaving(false));
  };
  useEffect(() => {
    navigationRef.current = (destination) => { if (!leaving) leaveSafely(destination); };
    return () => { navigationRef.current = null; };
  });
  const renderStep = (step: PM_StepDefinition) => {
    const result = values.find((item) => item.stepId === step.StepId);
    const val = result?.value;
    const correction = result ?? wr.ChecklistSteps?.find((item) => item.StepId === step.StepId);
    const correctedBy = result?.lastCorrectedBy ?? wr.ChecklistSteps?.find((item) => item.StepId === step.StepId)?.lastCorrectedBy ?? wr.todoSteps?.find((item) => item.id === step.StepId)?.lastCorrectedBy;
    const optionClass = (selected: boolean) => `flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left ${selected ? "border-2 border-blue-700 bg-blue-600 font-semibold text-white shadow-sm" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`;
    return <article key={step.StepId} className="space-y-3 rounded border bg-white p-4"><fieldset disabled={leaving || !editable} className="space-y-3">
      <FrequencyPill code={step.originFrequency} inherited={step.isInherited} />
      <h3 className="font-semibold">{step.StepNumber}. {step.StepTitle}</h3>
      {correctedBy && <p className="text-xs text-amber-800" title={correction?.lastCorrectedAt}>✎ Corrected by {correctedBy}</p>}
      {step.replacesStepLabel && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">{step.replacesStepLabel}</p>}
      {step.Instruction && <p className="whitespace-pre-wrap text-sm text-slate-600">{step.Instruction}</p>}
      {step.InputType === "Boolean" && (todoMode ? <button type="button" aria-pressed={val !== undefined && val !== ""} className={optionClass(val !== undefined && val !== "")} onClick={() => change(step, { value: val !== undefined && val !== "" ? "" : "true", passed: result?.passed ?? true })}><span>☑ Completed</span><span>{val !== undefined && val !== "" ? "✓ Selected" : "○"}</span></button> : <div className="grid gap-2">{([true, false] as const).map((value) => <button type="button" key={String(value)} aria-pressed={val === String(value)} className={optionClass(val === String(value))} onClick={() => change(step, { value: String(value), passed: value === (step.favourableBoolean ?? true) })}><span>{value ? "Yes" : "No"}</span><span>{val === String(value) ? "● Selected" : "○"}</span></button>)}</div>)}
      {step.InputType === "Numeric" && <label>Measurement {step.Unit} <span className="text-xs text-slate-500">(min: {step.MinThreshold ?? "—"}, max: {step.MaxThreshold ?? "—"})</span><input type="number" className="block rounded border p-2" value={typeof val === "number" ? val : ""} onChange={(e) => { if (!e.target.value) { change(step, { value: "", passed: true }); return; } const number = Number(e.target.value); if (Number.isFinite(number)) change(step, { value: number, passed: (step.MinThreshold === undefined || number >= step.MinThreshold) && (step.MaxThreshold === undefined || number <= step.MaxThreshold) }); }} /></label>}
      {step.InputType === "FreeText" && <textarea aria-label="Observations" className="w-full rounded border p-2" value={typeof val === "string" ? val : ""} onChange={(e) => change(step, { value: e.target.value, passed: true })} />}
      {step.InputType === "SingleSelect" && <div role="group" aria-label="Answer" className="grid gap-2">{step.Options?.map((option) => <button type="button" key={option.OptionId} aria-pressed={val === option.OptionValue} className={optionClass(val === option.OptionValue)} onClick={() => change(step, { value: option.OptionValue, passed: !option.TriggersFailure })}><span>{option.OptionValue}</span><span>{val === option.OptionValue ? "● Selected" : "○"}</span></button>)}</div>}
      {step.InputType === "MultiSelect" && <div role="group" aria-label="Answers" className="grid gap-2">{step.Options?.map((option) => { const selected = Array.isArray(val) ? val : []; const checked = selected.includes(option.OptionValue); return <button type="button" key={option.OptionId} aria-pressed={checked} className={optionClass(checked)} onClick={() => { const next = checked ? selected.filter((item) => item !== option.OptionValue) : [...selected, option.OptionValue]; change(step, { value: next, passed: !step.Options?.some((item) => next.includes(item.OptionValue) && item.TriggersFailure) }); }}><span>{option.OptionValue}</span><span>{checked ? "✓ Selected" : "□"}</span></button>; })}</div>}
      {todoMode && <div className="grid gap-2">{([true, false] as const).map((value) => <button type="button" key={String(value)} aria-pressed={!!result && result.passed === value} className={optionClass(!!result && result.passed === value)} onClick={() => change(step, { passed: value })}><span>{value ? "Favourable" : "Unfavourable"}</span><span>{result && result.passed === value ? "● Selected" : "○"}</span></button>)}</div>}
      {result && (typeof val === "number" || (typeof val === "string" && !!val.trim()) || (Array.isArray(val) && val.length > 0)) && <p className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${result.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{result.passed ? "✓ Favourable" : "⚠ Unfavourable — Action / Comment Recommended"}</p>}
      <div className="space-y-2 rounded bg-slate-50 p-3">{result && !result.passed && !todoMode && <p className="text-rose-700">{step.RequiresCommentOnFailure !== false ? "Comment required" : "Comment optional"} · {step.RequiresPhotoOnFailure !== false ? "Photo required" : "Photo optional"}</p>}<label className="block text-sm">Technician Step Comment<textarea aria-label="Technician comment" className="block w-full rounded border p-2" value={result?.comment ?? ""} onChange={(e) => change(step, { comment: e.target.value })} /></label>{todoMode && <p className="text-xs text-slate-600">Add before and after photos as needed.</p>}<div className="flex flex-wrap items-center gap-2"><PhotoCapture className="w-full max-w-sm" disabled={reading} onPhotos={(urls) => change(step, { photoPaths: [...(latest.current.find((item) => item.stepId === step.StepId)?.photoPaths ?? []), ...urls] })} />{followUp && <button type="button" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50" onClick={() => leaveSafely(() => followUp({ id: step.StepId, label: step.StepTitle }), true)}>+ Follow-up FJ</button>}</div><PhotoThumbs photos={result?.photoPaths ?? []} alt="Step photo" onRemove={(i) => change(step, { photoPaths: (latest.current.find((item) => item.stepId === step.StepId)?.photoPaths ?? []).filter((_, n) => n !== i) })} /></div>
    </fieldset></article>;
  };
  return <div className="space-y-3 p-4 pb-24"><div className="sticky top-0 z-30 space-y-2 rounded border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><button disabled={leaving} className="text-blue-700" onClick={() => leaveSafely(exit)}>← Exit to WR Overview (Progress Auto-Saved)</button><button disabled={leaving} className="rounded-full bg-emerald-100 px-2 py-1 text-sm text-emerald-800" onClick={() => leaveSafely(exit)}>⏱ {timerLabel}</button></div><div className="flex gap-2"><button aria-pressed={!all} onClick={() => setAll(false)}>Step-by-Step Mode</button><button aria-pressed={all} onClick={() => setAll(true)}>All Steps List Mode</button></div><div className="flex flex-wrap gap-1">{steps.map((step, i) => <button key={step.StepId} className={`rounded-full border px-2 py-1 text-xs ${!all && i === index ? "bg-blue-600 text-white" : "bg-white"}`} onClick={() => { setIndex(i); setAll(false); }}>Step {i + 1}{values.some((item) => item.stepId === step.StepId && item.value !== "") ? " ✓" : ""}</button>)}</div><p className="text-xs">{reading ? "Loading photo…" : saving ? "Saving…" : error ? "Progress not saved" : JSON.stringify(values) !== saved.current ? "Changes pending…" : "Progress saved locally"}</p></div>
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}
    {review && <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><span>{readOnly ? "Completed checklist · read-only review" : "Amending completed answers · changes are audited"}</span>{wr.Percentage === 78 && canAmend && readOnly && <button type="button" className="text-xs underline" onClick={() => setUnlocked(true)}>Unlock to amend answers</button>}</div>}
    {!timerRunning && !review && <p role="alert" className="rounded bg-amber-50 p-2 text-amber-900">Your timer is no longer running. Return to the work request and start timing to continue.</p>}
    {!steps.length && todoMode && <div className="rounded border bg-white p-4"><p>No checklist steps have been defined by the Team Leader for this Work Request.</p><button disabled={leaving} className="mt-2 text-blue-700 underline" onClick={() => leaveSafely(exit)}>← Exit to WR Overview</button></div>}
    <fieldset disabled={leaving} className="space-y-3">
      <PmScope wr={wr} />
      {all ? [...new Set(steps.map((step) => step.originFrequency))].map((code) => {
        const group = steps.filter((step) => step.originFrequency === code);
        return <section key={code ?? "other"} className="space-y-2">{code && <h2 className="rounded bg-slate-100 p-2 font-semibold"><FrequencyPill code={code} /> {group[0].isInherited ? "Included routine checks (inherited)" : "Additional maintenance checks"} · {group.length} steps</h2>}{group.map(renderStep)}</section>;
      }) : steps[index] ? renderStep(steps[index]) : !todoMode && <p>No checklist steps available.</p>}
      {!all && steps.length > 0 && <div className="flex gap-2"><button disabled={index === 0} onClick={() => setIndex(index - 1)}>← Previous</button><button disabled={index >= steps.length - 1} onClick={() => setIndex(index + 1)}>Next →</button></div>}
      {complete && !review && timerRunning && steps.length > 0 && (all || index === steps.length - 1) && <button className="rounded bg-blue-800 px-3 py-2 text-white" onClick={() => leaveSafely(complete)}>✓ Set Technically Completed (78%)</button>}
    </fieldset>
  </div>;
}

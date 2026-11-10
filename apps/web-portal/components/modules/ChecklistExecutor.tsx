"use client";

import React, { useEffect, useRef, useState } from "react";
import type { BaseWorkRequest, PM_ScheduleStep } from "@cafm/shared-schema";

type StepResult = NonNullable<BaseWorkRequest["ChecklistResults"]>[number];

interface ChecklistExecutorProps {
  isOpen: boolean;
  workRequestId: string;
  steps: PM_ScheduleStep[];
  initialResults?: StepResult[];
  onClose: () => void;
  onProgress?: (result: StepResult) => void;
  onClear?: (stepId: string) => void;
  onComplete?: (results: StepResult[]) => boolean | void;
}

export function ChecklistExecutor({ isOpen, workRequestId, steps, initialResults = [], onClose, onProgress, onClear, onComplete }: ChecklistExecutorProps) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState(initialResults);
  const resultsRef = useRef(initialResults);
  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  useEffect(() => {
    if (!isOpen || !timerRunning) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, timerRunning]);
  if (!isOpen) return null;
  if (steps.length === 0) return <div role="dialog" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
    <div className="bg-white p-6 rounded"><p>This checklist has no steps.</p><button type="button" onClick={onClose}>Close</button></div>
  </div>;
  const step = steps[index];
  const result = results.find((item) => item.stepId === step.StepId);

  const save = (next: StepResult) => {
    resultsRef.current = [...resultsRef.current.filter((item) => item.stepId !== next.stepId), next];
    setResults(resultsRef.current);
    onProgress?.(next);
  };
  const clear = () => {
    resultsRef.current = resultsRef.current.filter((item) => item.stepId !== step.StepId);
    setResults(resultsRef.current);
    onClear?.(step.StepId);
  };
  const answer = (value: StepResult["value"], passed: boolean) => save({
    stepId: step.StepId, value, passed, completedAt: new Date().toISOString(),
    ...(result?.photoPaths ? { photoPaths: result.photoPaths } : {}),
    ...(result?.comment ? { comment: result.comment } : {}),
  });
  const finish = () => {
    const invalid = steps.filter((item) => {
      const answer = results.find((entry) => entry.stepId === item.StepId);
      if (!answer || (typeof answer.value === "string" && !answer.value.trim()) ||
          (Array.isArray(answer.value) && answer.value.length === 0)) return item.IsRequired;
      return !answer.passed &&
        ((item.RequiresPhotoOnFailure && !answer.photoPaths?.length) ||
         (item.RequiresCommentOnFailure && !answer.comment?.trim()));
    });
    if (invalid.length) {
      alert(`Complete the required answers and failure evidence for: ${invalid.map((item) => item.Title).join(", ")}`);
      return;
    }
    if (onComplete?.(results) === false) return;
    onClose();
  };

  return <div role="dialog" aria-modal="true" aria-label="Execute checklist" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg w-full max-w-2xl max-h-screen overflow-auto p-6 space-y-4">
      <div className="flex justify-between"><h2 className="text-xl font-bold">Execute Checklist — {workRequestId}</h2><button type="button" onClick={onClose}>Close</button></div>
      <p>Step {index + 1} of {steps.length}</p>
      <div>Work Session: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}{" "}
        <button type="button" className="border rounded px-2 py-1" onClick={() => setTimerRunning((value) => !value)}>{timerRunning ? "Pause" : "Start"}</button>
      </div>
      <h3 className="font-semibold">{step.Title}</h3>
      {(result?.lastCorrectedBy || step.lastCorrectedBy) && <p className="text-xs text-amber-800" title={result?.lastCorrectedAt ?? step.lastCorrectedAt}>✎ Corrected by {result?.lastCorrectedBy ?? step.lastCorrectedBy}</p>}
      {step.Instructions && <p>{step.Instructions}</p>}
      {step.InputType === "Boolean" && <div className="flex gap-2">
        {[true, false].map((value) => <button key={String(value)} type="button" aria-pressed={result?.value === String(value)}
          onClick={() => answer(String(value), value === (step.favourableBoolean ?? true))}
          className="px-4 py-2 border rounded aria-pressed:bg-blue-100">{value ? "Yes" : "No"}</button>)}
      </div>}
      {step.InputType === "Numeric" && <label className="block">Value {step.Unit && `(${step.Unit})`}
        <input type="number" value={typeof result?.value === "number" ? result.value : ""} onChange={(event) => {
          if (event.target.value === "") {
            clear();
            return;
          }
          const value = Number(event.target.value);
          if (Number.isFinite(value)) answer(value, (step.MinThreshold === undefined || value >= step.MinThreshold) && (step.MaxThreshold === undefined || value <= step.MaxThreshold));
        }} className="block border rounded p-2" />
        <span className="text-sm">Favourable range: {step.MinThreshold ?? "unbounded"} to {step.MaxThreshold ?? "unbounded"}</span>
      </label>}
      {(step.InputType === "SingleSelect" || step.InputType === "MultiSelect") && <div className="space-y-2">
        {step.Options.map((option) => {
          const selected = step.InputType === "SingleSelect" ? result?.value === option.Value : Array.isArray(result?.value) && result.value.includes(option.Value);
          return <label key={option.OptionId} className="flex items-center gap-2">
            <input type={step.InputType === "SingleSelect" ? "radio" : "checkbox"} checked={!!selected} name={step.StepId} onChange={(event) => {
              if (step.InputType === "SingleSelect") answer(option.Value, !option.TriggersFailure);
              else {
                const values = Array.isArray(result?.value) ? result.value : [];
                const next = event.target.checked ? [...values, option.Value] : values.filter((value) => value !== option.Value);
                if (next.length === 0) clear();
                else answer(next, next.every((value) => !step.Options.find((item) => item.Value === value)?.TriggersFailure));
              }
            }} />{option.Label}
            <span className={option.TriggersFailure ? "text-red-700" : "text-green-700"}>{option.TriggersFailure ? "Unfavourable" : "Favourable"}</span>
          </label>;
        })}
      </div>}
      {step.InputType === "FreeText" && <textarea aria-label="Observation" value={typeof result?.value === "string" ? result.value : ""} onChange={(event) => answer(event.target.value, true)} className="w-full border rounded p-2" />}
      {result && step.InputType !== "FreeText" && <span className={`inline-block px-3 py-1 rounded font-semibold ${result.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{result.passed ? "FAVOURABLE" : "UNFAVOURABLE"}</span>}
      {result && !result.passed && <>
        {step.RequiresPhotoOnFailure && <label className="block">Failure photo required
          <input type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onerror = () => alert("Could not read the failure photo.");
            const stepId = step.StepId;
            reader.onload = () => {
              const latest = resultsRef.current.find((entry) => entry.stepId === stepId);
              if (!latest || typeof reader.result !== "string") {
                alert("Could not attach the failure photo to this step.");
                return;
              }
              save({ ...latest, photoPaths: [reader.result] });
            };
            reader.readAsDataURL(file);
          }} />
          {result.photoPaths?.map((photo) => <img key={photo} src={photo} alt="Failure evidence" className="max-h-32" />)}
        </label>}
        {step.RequiresCommentOnFailure && <label className="block">Failure comment required
          <textarea value={result.comment ?? ""} onChange={(event) => save({ ...result, comment: event.target.value })} className="block w-full border rounded p-2" />
        </label>}
      </>}
      <div className="flex justify-between">
        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} className="px-3 py-2 border rounded disabled:opacity-40">Back</button>
        {index < steps.length - 1
          ? <button type="button" onClick={() => setIndex(index + 1)} className="px-3 py-2 bg-blue-600 text-white rounded">Next</button>
          : <button type="button" onClick={finish} className="px-3 py-2 bg-green-700 text-white rounded">Finish Checklist</button>}
      </div>
    </div>
  </div>;
}

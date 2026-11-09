import React, { useState } from "react";
import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";
import { composeTechnicianPrompt, generateTechnicianSteps } from "../../lib/technician-steps";
import type { SuggestedStep } from "../../lib/technician-steps";

export function TechnicianPromptBuilder({ wr, equipment, scope, onGenerate, close, canGenerate = true }: {
  wr: BaseWorkRequest; equipment: Equipment[]; scope: string;
  onGenerate: (steps: SuggestedStep[], scope: string, baseline: BaseWorkRequest) => Promise<void>;
  close: () => void;
  canGenerate?: boolean;
}) {
  const [count, setCount] = useState(wr.WR_Type === "LJ" ? 7 : 5);
  const [baseline] = useState(wr);
  const [prompt, setPrompt] = useState(() => composeTechnicianPrompt(wr, equipment, scope, wr.WR_Type === "LJ" ? 7 : 5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const replaceCount = (next: number) => {
    setCount(next);
    setPrompt((value) => value.replace(/(Instruction:\s*Generate\s+)\d+(\s+clear, sequential field technician steps)/i, `$1${next}$2`));
  };
  const generate = async () => {
    setError("");
    try {
      if (!canGenerate) throw new Error("Start timing before replacing the checklist.");
      const suggestions = generateTechnicianSteps(prompt, count);
      if ((baseline.todoSteps?.length ?? 0) > 0 && !window.confirm("Replace all existing steps, including their completion details, comments and photos? This cannot be undone.")) return;
      setBusy(true);
      await onGenerate(suggestions, scope, baseline);
      close();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not generate steps."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded border border-blue-300 bg-blue-50 p-3" aria-label="AI Prompt Builder & Configuration">
    <h4 className="font-bold">AI Prompt Builder &amp; Configuration</h4>
    <p className="text-xs">Local rule-based suggestions, not an AI service. Edits to the labelled equipment, location, trade and scope fields inform the suggestions; the full edited brief is attached to the first step for review. Review all steps and safety requirements before work.</p>
    <label className="block">How many steps to generate? <input type="number" min="2" max="12" step="1" value={count} onChange={(event) => replaceCount(Number(event.target.value))} className="w-20 rounded border p-1" /></label>
    <label className="block">Editable prompt<textarea aria-label="Editable technician prompt" className="block min-h-48 w-full rounded border p-2" value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
    {!!baseline.todoSteps?.length && <p className="font-semibold text-amber-900">Generating will replace the existing {baseline.todoSteps.length} checklist steps with a new {count}-step checklist, including any completion details and evidence.</p>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {!canGenerate && <p role="status" className="text-amber-900">The timer stopped. Cancel and restart timing before generating.</p>}
    <div className="flex gap-2"><button disabled={busy || !canGenerate} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" onClick={() => void generate()}>✨ Generate {count} Steps with AI</button><button disabled={busy} className="rounded border bg-white px-3 py-2" onClick={close}>Cancel</button></div>
  </section>;
}

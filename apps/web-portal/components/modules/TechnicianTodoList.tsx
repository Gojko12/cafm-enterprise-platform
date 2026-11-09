"use client";

import React, { useEffect, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { generateTechnicianSteps } from "@/lib/technician-steps";
import { useActiveUserPermissions } from "@/lib/cafm-store";

type Step = NonNullable<BaseWorkRequest["todoSteps"]>[number];

export function TechnicianTodoList({ wr, update }: {
  wr: BaseWorkRequest;
  update: (change: (wr: BaseWorkRequest) => BaseWorkRequest, log?: string) => void;
}) {
  const { permissions } = useActiveUserPermissions();
  const allowed = wr.WR_Type === "FJ" ? !!permissions?.canDefineChecklistFJ : wr.WR_Type === "LJ" && !!permissions?.canDefineChecklistLJ;
  const [scope, setScope] = useState(wr.roughScopeNotes ?? "");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editInstruction, setEditInstruction] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setScope(wr.roughScopeNotes ?? ""); setEditId(null); setError(""); }, [wr.WR_ID]);
  const steps = [...(wr.todoSteps ?? [])].sort((a, b) => a.order - b.order);
  const append = (titles: string[], notes?: string) => {
    update((current) => {
      const currentSteps = current.todoSteps ?? [];
      const start = Math.max(0, ...currentSteps.map((step) => step.order));
      return { ...current, ...(notes !== undefined ? { roughScopeNotes: notes } : {}), todoSteps: [...currentSteps, ...titles.map((item, index) => ({ id: crypto.randomUUID(), order: start + index + 1, title: item, completed: false }))] };
    }, `Added ${titles.length} technician to-do step(s).`);
  };
  const generate = () => {
    const text = scope.trim();
    if (!text) { setError("Enter a rough scope before generating steps."); return; }
    try { append(generateTechnicianSteps(text), text); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not generate steps."); return; }
    setError("");
  };
  const reorder = (id: string, delta: number) => update((current) => {
    const ordered = [...(current.todoSteps ?? [])].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((step) => step.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return current;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    return { ...current, todoSteps: ordered.map((step, i) => ({ ...step, order: i + 1 })) };
  }, "Reordered technician to-do steps.");
  const saveEdit = () => {
    if (!editTitle.trim() || !editId) { setError("A step title is required."); return; }
    update((current) => ({ ...current, todoSteps: (current.todoSteps ?? []).map((step) => step.id === editId ? { ...step, title: editTitle.trim(), instruction: editInstruction.trim() || undefined } : step) }), "Updated technician to-do step.");
    setEditId(null); setError("");
  };
  const renderStep = (step: Step, index: number) => <li key={step.id} className="space-y-2 rounded border border-slate-200 p-3">
    {editId === step.id ? <div className="space-y-2"><input aria-label="Step title" className="w-full rounded border p-2" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /><textarea aria-label="Step instruction" className="w-full rounded border p-2" value={editInstruction} onChange={(e) => setEditInstruction(e.target.value)} /><button className="rounded bg-blue-700 px-3 py-1 text-white" onClick={saveEdit}>Save</button>{" "}<button onClick={() => setEditId(null)}>Cancel</button></div> : <><div className="flex flex-wrap justify-between gap-2"><strong>{index + 1}. {step.title}</strong><span className={step.completed ? "text-emerald-700" : "text-slate-500"}>{step.completed ? "✓ Completed" : "Pending"}</span></div>{step.instruction && <p>{step.instruction}</p>}</>}
    {step.completedBy && <p className="text-xs text-slate-500">Completed by {step.completedBy}{step.completedAt ? ` · ${new Date(step.completedAt).toLocaleString()}` : ""}{step.isFavourable !== undefined ? ` · ${step.isFavourable ? "Favourable" : "Unfavourable"}` : ""}</p>}
    {step.technicianComment && <p>Technician: {step.technicianComment}</p>}
    {!!step.photoUrls?.length && <div className="flex flex-wrap gap-2">{step.photoUrls.map((url, i) => <a key={`${i}-${url}`} href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">Photo {i + 1}</a>)}</div>}
    {allowed && editId !== step.id && <div className="flex gap-3 text-xs text-blue-700"><button onClick={() => { setEditId(step.id); setEditTitle(step.title); setEditInstruction(step.instruction ?? ""); }}>Edit</button><button disabled={index === 0} onClick={() => reorder(step.id, -1)}>↑ Move up</button><button disabled={index === steps.length - 1} onClick={() => reorder(step.id, 1)}>↓ Move down</button><button className="text-rose-700" onClick={() => { if (window.confirm("Delete this step and its recorded completion details?")) update((current) => ({ ...current, todoSteps: (current.todoSteps ?? []).filter((item) => item.id !== step.id) }), `Deleted technician step: ${step.title}`); }}>Delete</button></div>}
  </li>;
  return <section className="space-y-4 rounded border bg-white p-4 text-sm">
    <h3 className="text-lg font-semibold">Technician To-Do &amp; AI Task List</h3>
    <p className="text-slate-600">Generated suggestions use a local text parser, not an AI service. Review all steps and site safety requirements before work.</p>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <label className="block font-medium">Rough scope<textarea disabled={!allowed} className="mt-1 block w-full rounded border p-2 disabled:bg-slate-50" value={scope} onChange={(e) => setScope(e.target.value)} onBlur={() => { if (allowed && scope !== (wr.roughScopeNotes ?? "")) update((current) => ({ ...current, roughScopeNotes: scope }), "Updated technician work scope."); }} /></label>
    {allowed && <button className="rounded bg-blue-700 px-3 py-2 font-semibold text-white" onClick={generate}>✨ AI Generate Technician Steps</button>}
    {steps.length ? <ol className="space-y-2">{steps.map(renderStep)}</ol> : <p>No technician steps yet.</p>}
    {allowed && <div className="space-y-2 rounded bg-slate-50 p-3"><h4 className="font-semibold">Add step</h4><input className="w-full rounded border p-2" placeholder="Step title" value={title} onChange={(e) => setTitle(e.target.value)} /><textarea className="w-full rounded border p-2" placeholder="Instruction (optional)" value={instruction} onChange={(e) => setInstruction(e.target.value)} /><button disabled={!title.trim()} className="rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-50" onClick={() => { const name = title.trim(), details = instruction.trim(); update((current) => ({ ...current, todoSteps: [...(current.todoSteps ?? []), { id: crypto.randomUUID(), order: Math.max(0, ...(current.todoSteps ?? []).map((item) => item.order)) + 1, title: name, instruction: details || undefined, completed: false }] }), `Added technician step: ${name}`); setTitle(""); setInstruction(""); }}>+ Add step</button></div>}
  </section>;
}

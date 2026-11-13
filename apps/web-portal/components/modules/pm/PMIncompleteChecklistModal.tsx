"use client";

import React from "react";

export function PMIncompleteChecklistModal({ labels, onCancel, onConfirm }: {
  labels: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="pm-checklist-override-title"
      className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
      <header className="border-b p-4">
        <h2 id="pm-checklist-override-title" className="font-semibold text-amber-900">Checklist is incomplete</h2>
        <p className="mt-1 text-sm text-slate-700">{labels.length} required checklist step{labels.length === 1 ? "" : "s"} remain incomplete. You may complete the checklist first, or explicitly continue to 78% with this override recorded in the work request audit.</p>
      </header>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4 text-sm">
        {labels.map((label) => <li key={label} className="rounded bg-amber-50 px-2 py-1">{label}</li>)}
      </ul>
      <footer className="flex justify-end gap-2 border-t p-3">
        <button type="button" className="rounded border px-3 py-2" onClick={onCancel}>Complete checklist first</button>
        <button type="button" className="rounded bg-amber-700 px-3 py-2 font-semibold text-white" onClick={onConfirm}>Override and continue to 78%</button>
      </footer>
    </section>
  </div>;
}

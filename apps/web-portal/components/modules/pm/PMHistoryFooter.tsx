import type React from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import { ResizableHistory } from "@/components/common/ResizableHistory";
import { newestFirst } from "@/lib/history-order";

export interface PMHistoryFilters { timestamp: string; performedBy: string; actionType: string; stepReference: string; details: string }
export interface PMChecklistHistoryRow { id: string; timestamp: string; performedBy: string; actionType: string; stepReference?: string; details: string }

interface Props {
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historyFilter: "all" | "comment" | "log";
  setHistoryFilter: (value: "all" | "comment" | "log") => void;
  message: string;
  setMessage: (value: string) => void;
  addComment: () => void;
  visibleHistory: NonNullable<BaseWorkRequest["Activity"]>;
  editingComment: string | null;
  setEditingComment: (value: string | null) => void;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  saveCommentEdit: (commentId: string) => void;
  actorId: string;
  checklistHistoryOpen: boolean;
  setChecklistHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historyFilters: PMHistoryFilters;
  setHistoryFilters: React.Dispatch<React.SetStateAction<PMHistoryFilters>>;
  checklistHistory: PMChecklistHistoryRow[];
}

export function PMHistoryFooter({ historyOpen, setHistoryOpen, historyFilter, setHistoryFilter, message, setMessage, addComment, visibleHistory, editingComment, setEditingComment, commentDraft, setCommentDraft, saveCommentEdit, actorId, checklistHistoryOpen, setChecklistHistoryOpen, historyFilters, setHistoryFilters, checklistHistory }: Props) {
  return (
        <ResizableHistory>
          <footer className="px-4 py-3">
          <section>
            <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)}
              className="flex w-full items-center justify-between py-2 text-left font-semibold">
              <span>History</span><span>{historyOpen ? "−" : "+"}</span>
            </button>
            {historyOpen && <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "All"],
                  ["comment", "Human Comments Only"],
                  ["log", "Automatic Logs Only"],
                ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={historyFilter === value}
                  onClick={() => setHistoryFilter(value)}
                  className={`rounded px-3 py-1 text-xs ${historyFilter === value ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>)}
              </div>
              <div className="flex gap-2"><input aria-label="Write a comment" placeholder="Write a comment..." value={message} onChange={(event) => setMessage(event.target.value)} className="min-w-0 flex-1 rounded border p-1" /><button type="button" disabled={!message.trim()} onClick={addComment} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">Post</button></div>
              <div className="space-y-2">
                {visibleHistory.map((entry) => <article key={entry.id} className="rounded border p-2 text-xs">
                  <div className="text-slate-500">{entry.actorName} ({entry.actorRole}) · {formatDateTimeDDMMYYYY(entry.createdAt)} · {entry.kind === "comment" ? "Human comment" : "Automatic log"}</div>
                  {editingComment === entry.id
                    ? <div className="mt-2 space-y-2">
                      <textarea aria-label="Edit history comment" value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)} className="w-full rounded border p-2" />
                      <button type="button" onClick={() => saveCommentEdit(entry.id)} className="text-blue-700">Save</button>
                      <button type="button" onClick={() => setEditingComment(null)} className="ml-3">Cancel</button>
                    </div>
                    : <p className="whitespace-pre-wrap">{entry.text}</p>}
                  {entry.kind === "comment" && entry.actorId === actorId && editingComment !== entry.id &&
                    <button type="button" onClick={() => { setEditingComment(entry.id); setCommentDraft(entry.text); }} className="mt-1 text-blue-700">Edit</button>}
                  {(entry.editHistory?.length ?? 0) > 0 && <details className="mt-1">
                    <summary className="cursor-pointer text-slate-600">(Edited) Previous Versions</summary>
                    {newestFirst(entry.editHistory ?? [], (version) => version.timestamp).map((version, index) => <div key={`${entry.id}-${index}`} className="mt-1 border-t pt-1">
                      <span className="text-slate-500">{formatDateTimeDDMMYYYY(version.timestamp)}</span>
                      <p className="whitespace-pre-wrap">{version.text}</p>
                    </div>)}
                  </details>}
                </article>)}
              </div>
            </div>}
          </section>
          <section className="border-t pt-3">
            <button type="button" aria-expanded={checklistHistoryOpen} onClick={() => setChecklistHistoryOpen((value) => !value)}
              className="flex w-full items-center justify-between py-2 text-left font-semibold">
              <span>Checklist history</span><span>{checklistHistoryOpen ? "−" : "+"}</span>
            </button>
            {checklistHistoryOpen && <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-5">
                {([
                  ["timestamp", "Timestamp"],
                  ["performedBy", "Performed by"],
                  ["actionType", "Action type"],
                  ["stepReference", "Step reference"],
                  ["details", "Details"],
                ] as const).map(([field, label]) => <input key={field} aria-label={`Filter ${label}`}
                  placeholder={`Filter ${label}`} value={historyFilters[field]}
                  onChange={(event) => setHistoryFilters((current) => ({ ...current, [field]: event.target.value }))}
                  className="min-w-0 rounded border px-2 py-1 text-xs" />)}
              </div>
              <div className="max-h-40 overflow-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="bg-slate-50"><tr>
                    {["Timestamp", "Performed by", "Action type", "Step reference", "Details"].map((title) => <th key={title} className="p-2">{title}</th>)}
                  </tr></thead>
                  <tbody>{checklistHistory.filter((entry) =>
                    entry.timestamp.toLowerCase().includes(historyFilters.timestamp.toLowerCase()) &&
                    entry.performedBy.toLowerCase().includes(historyFilters.performedBy.toLowerCase()) &&
                    entry.actionType.toLowerCase().includes(historyFilters.actionType.toLowerCase()) &&
                    (entry.stepReference ?? "").toLowerCase().includes(historyFilters.stepReference.toLowerCase()) &&
                    entry.details.toLowerCase().includes(historyFilters.details.toLowerCase()),
                  ).map((entry) => <tr key={entry.id} className="border-t">
                    <td className="p-2">{formatDateTimeDDMMYYYY(entry.timestamp)}</td><td className="p-2">{entry.performedBy}</td>
                    <td className="p-2">{entry.actionType}</td><td className="p-2">{entry.stepReference ?? "—"}</td><td className="p-2">{entry.details}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>}
          </section>
        </footer>
        </ResizableHistory>
  );
}

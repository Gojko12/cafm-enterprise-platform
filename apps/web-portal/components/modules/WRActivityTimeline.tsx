"use client";

import React, { useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { newestFirst } from "@/lib/history-order";

export function WRActivityTimeline({ workRequest, actingRole }: { workRequest: BaseWorkRequest; actingRole?: string }) {
  const { setData } = useCafmStore();
  const { currentUser, activeLJRole } = useSiteContext();
  const { currentRole } = useApp();
  const actorId = currentUser?.UserId ?? "current-user";
  const actorName = currentUser?.DisplayName ?? "Current user";
  const actorRole = workRequest.WR_Type === "LJ" ? actingRole ?? activeLJRole ?? currentRole : currentRole;
  const [filter, setFilter] = useState<"all" | "comment" | "log">("all");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const update = (change: (wr: BaseWorkRequest) => BaseWorkRequest) =>
    setData((current) => ({
      ...current,
      workRequests: current.workRequests.map((wr) =>
        wr.WR_ID === workRequest.WR_ID && wr.SiteId === workRequest.SiteId ? change(wr) : wr),
    }));

  const addComment = () => {
    if (!text.trim()) return;
    const entry = { id: crypto.randomUUID(), kind: "comment" as const, actorId, actorName,
      actorRole, createdAt: new Date().toISOString(), text: text.trim(), editHistory: [] };
    update((wr) => ({ ...wr, Activity: [...(wr.Activity ?? []), entry] }));
    setText("");
  };

  const saveEdit = (id: string) => {
    if (!draft.trim()) return;
    const now = new Date().toISOString();
    update((wr) => ({ ...wr, Activity: (wr.Activity ?? []).map((entry) =>
      entry.id === id && entry.kind === "comment" && entry.actorId === actorId
        ? { ...entry, text: draft.trim(), editedAt: now,
            editHistory: [...(entry.editHistory ?? []), { text: entry.text, timestamp: entry.editedAt ?? entry.createdAt }] }
        : entry) }));
    setEditing(null);
  };

  const addFile = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => alert(`Could not read ${file.name}.`);
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        alert(`Could not read ${file.name}.`);
        return;
      }
      const attachment = { id: crypto.randomUUID(), name: file.name, type: file.type, dataUrl: reader.result };
      const entry = { id: crypto.randomUUID(), kind: "log" as const, actorId, actorName, actorRole,
        createdAt: new Date().toISOString(),
        text: `${file.type.startsWith("image/") ? "Image" : "File"} '${file.name}' was added by ${actorName}` };
      update((wr) => ({ ...wr, Attachments: [...(wr.Attachments ?? []), attachment], Activity: [...(wr.Activity ?? []), entry] }));
    };
    reader.readAsDataURL(file);
  };

  const removeFile = (attachment: NonNullable<BaseWorkRequest["Attachments"]>[number]) => {
    const entry = { id: crypto.randomUUID(), kind: "log" as const, actorId, actorName, actorRole,
      createdAt: new Date().toISOString(),
      text: `${attachment.type.startsWith("image/") ? "Image" : "File"} '${attachment.name}' was removed by ${actorName}` };
    update((wr) => ({ ...wr, Attachments: (wr.Attachments ?? []).filter((item) => item.id !== attachment.id),
      Activity: [...(wr.Activity ?? []), entry] }));
  };

  return <section className="border-t pt-4 space-y-4">
    <h3 className="font-semibold">Files &amp; Images</h3>
    <input aria-label="Add files or images" type="file" multiple onChange={(event) => {
      Array.from(event.target.files ?? []).forEach(addFile);
      event.target.value = "";
    }} />
    {(workRequest.Attachments ?? []).map((item) => <div key={item.id} className="flex items-center gap-3 text-sm">
      <a href={item.dataUrl} download={item.name} className="text-blue-700 underline">{item.name}</a>
      <button type="button" onClick={() => removeFile(item)} className="text-red-700">Remove</button>
    </div>)}
    <h3 className="font-semibold">Activity &amp; Comments</h3>
    <div className="flex flex-wrap gap-2">
      {([["all", "All (Comments & Logs)"], ["comment", "Human Comments Only"], ["log", "Automatic Logs Only"]] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
          className={`px-3 py-2 rounded text-sm ${filter === value ? "bg-blue-600 text-white" : "bg-gray-100"}`}>{label}</button>)}
    </div>
    <label className="block text-sm">Add comment
      <textarea placeholder="Write a comment..." value={text} onChange={(event) => setText(event.target.value)} className="block w-full border rounded p-2" />
    </label>
    <button type="button" disabled={!text.trim()} onClick={addComment} className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-50">Post Comment</button>
    <div className="space-y-3">
      {newestFirst((workRequest.Activity ?? []).filter((entry) => filter === "all" || entry.kind === filter), (entry) => entry.createdAt).map((entry) =>
        <article key={entry.id} className="border rounded p-3 text-sm">
          <div className="text-gray-600">{entry.actorName} ({entry.actorRole}) · {new Date(entry.createdAt).toLocaleString()} · {entry.kind === "log" ? "Automatic log" : "Comment"}</div>
          {editing === entry.id ? <div className="space-y-2">
            <textarea aria-label="Edit comment" value={draft} onChange={(event) => setDraft(event.target.value)} className="w-full border rounded p-2" />
            <button type="button" onClick={() => saveEdit(entry.id)} className="text-blue-700">Save</button>{" "}
            <button type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div> : <p className="whitespace-pre-wrap">{entry.text}</p>}
          {entry.kind === "comment" && entry.actorId === actorId && editing !== entry.id &&
            <button type="button" onClick={() => { setEditing(entry.id); setDraft(entry.text); }} className="text-blue-700">Edit</button>}
          {(entry.editHistory?.length ?? 0) > 0 && <details>
            <summary>(Edited - View History)</summary>
            {newestFirst(entry.editHistory ?? [], (version) => version.timestamp).map((version, index) => <div key={index} className="border-t mt-2 pt-2">
              <span className="text-gray-500">{new Date(version.timestamp).toLocaleString()}</span>
              <p className="whitespace-pre-wrap">{version.text}</p>
            </div>)}
          </details>}
        </article>)}
    </div>
  </section>;
}

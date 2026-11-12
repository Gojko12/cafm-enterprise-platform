import type { BaseWorkRequest } from "@cafm/shared-schema";
import { PhotoCapture } from "@/components/common/PhotoCapture";

interface Props {
  workRequest: BaseWorkRequest;
  updateWorkRequest: (change: (current: BaseWorkRequest) => BaseWorkRequest, logText?: string) => void;
  actorName: string;
  addDocument: (file: File) => void;
  removeDocument: (documentId: string, documentName: string) => void;
  documentFilter: string;
  setDocumentFilter: (value: string) => void;
}

export function PMDocumentsPanel({ workRequest, updateWorkRequest, actorName, addDocument, removeDocument, documentFilter, setDocumentFilter }: Props) {
  return (
<section className="space-y-4 rounded border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Attached Documents</h3>
              <PhotoCapture className="w-full max-w-xs" onPhotos={(urls) => updateWorkRequest((current) => ({
                ...current,
                Attachments: [...(current.Attachments ?? []), ...urls.map((dataUrl, n) => ({ id: crypto.randomUUID(), name: `photo-${Date.now()}-${n + 1}.jpg`, type: "image/jpeg", dataUrl }))],
              }), `${urls.length} photo${urls.length === 1 ? "" : "s"} added by ${actorName}`)} />
                            <label className="cursor-pointer rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                              + New WR Document
                <input className="sr-only" type="file" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) addDocument(file);
                  event.target.value = "";
                }} />
              </label>
            </div>
            <input aria-label="Filter documents by Name" placeholder="Name" value={documentFilter}
              onChange={(event) => setDocumentFilter(event.target.value)} className="rounded border px-3 py-2" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead className="bg-slate-50"><tr><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">Actions</th></tr></thead>
                <tbody>{(workRequest.Attachments ?? []).filter((item) =>
                  item.name.toLowerCase().includes(documentFilter.toLowerCase()),
                ).map((item) => <tr key={item.id} className="border-t">
                  <td className="p-3">{item.name}</td><td className="p-3">{item.type || "File"}</td>
                  <td className="space-x-3 p-3">
                    <a href={item.dataUrl} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">Open</a>
                    <button type="button" onClick={() => removeDocument(item.id, item.name)} className="font-medium text-red-700">Delete</button>
                  </td>
                </tr>)}
                {!workRequest.Attachments?.length && <tr><td colSpan={3} className="p-5 text-center text-slate-500">No attached documents.</td></tr>}
                {!!workRequest.Attachments?.length && !workRequest.Attachments.some((item) => item.name.toLowerCase().includes(documentFilter.toLowerCase())) &&
                  <tr><td colSpan={3} className="p-5 text-center text-slate-500">No documents match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
  );
}

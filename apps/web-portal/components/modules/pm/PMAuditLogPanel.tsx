import type { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import { QAAuditPanel } from "@/components/modules/QAAuditPanel";
import { QAChecklistReview } from "@/components/modules/QAChecklistReview";

export interface PMAuditRow { id: string; timestamp: string; performedBy: string; actionType: string; stepReference: string; details: string }

interface Props {
  workRequest: BaseWorkRequest;
  auditRows: PMAuditRow[];
}

export function PMAuditLogPanel({ workRequest, auditRows }: Props) {
  return (
<section className="space-y-4 rounded border bg-white p-4">
            <QAAuditPanel wr={workRequest} />
            <QAChecklistReview key={workRequest.WR_ID} wr={workRequest} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50"><tr><th className="p-3">Timestamp</th><th className="p-3">Performed by</th><th className="p-3">Action</th><th className="p-3">Step reference</th><th className="p-3">Details</th></tr></thead>
                <tbody>{auditRows.map((entry) => <tr key={entry.id} className="border-t">
                  <td className="p-3">{formatDateTimeDDMMYYYY(entry.timestamp)}</td><td className="p-3">{entry.performedBy}</td>
                  <td className="p-3">{entry.actionType}</td><td className="p-3">{entry.stepReference || "—"}</td><td className="p-3">{entry.details}</td>
                </tr>)}
                {!auditRows.length && <tr><td colSpan={5} className="p-5 text-center text-slate-500">No audit records.</td></tr>}</tbody>
              </table>
            </div>
          </section>
  );
}

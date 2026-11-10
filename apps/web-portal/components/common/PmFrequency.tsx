import type { BaseWorkRequest, PMFrequencyCode } from "@cafm/shared-schema";
import { FREQUENCY_LABELS } from "../../lib/pm-suppression";

const colors: Record<string, [string, string]> = {
  "01D": ["#f1f5f9", "#334155"], "01W": ["#e0f2fe", "#0369a1"], "02W": ["#cffafe", "#155e75"],
  "01M": ["#dbeafe", "#1d4ed8"], "03M": ["#dbeafe", "#1e40af"], "06M": ["#ede9fe", "#6d28d9"],
  "01Y": ["#fef3c7", "#92400e"], "02Y": ["#ffedd5", "#9a3412"], "05Y": ["#ffe4e6", "#9f1239"],
  "10Y": ["#fce7f3", "#831843"],
};
export function FrequencyPill({ code, inherited = false }: { code?: string; inherited?: boolean }) {
  if (!code) return null;
  const [background, color] = colors[code] ?? colors["01D"];
  return <span style={{ display: "inline-flex", whiteSpace: "nowrap", borderRadius: 999, padding: "2px 7px", fontSize: 11, fontWeight: 700, background, color }}>{code} {FREQUENCY_LABELS[code as PMFrequencyCode] ?? ""}{inherited ? " · Inherited" : ""}</span>;
}
export function PmScope({ wr }: { wr: BaseWorkRequest }) {
  if (wr.WR_Type !== "PM" || !wr.pmFrequency) return null;
  return <div className="rounded-lg border bg-slate-50 p-2 text-sm"><FrequencyPill code={wr.pmFrequency} /> Maintenance{wr.pmsId ? ` · PMS #${wr.pmsId}` : ""}{wr.absorbedFrequencies?.length ? ` · Absorbed: ${wr.absorbedFrequencies.join(" + ")}` : ""} · {wr.ChecklistSteps?.length ?? wr.ChecklistInstances?.length ?? 0} steps total{wr.suppressionGroupName && <p className="text-xs text-slate-600">{wr.suppressionGroupName}</p>}{wr.suppressedByWrId && <p>Suppressed — covered by WR #{wr.suppressedByWrId}</p>}</div>;
}

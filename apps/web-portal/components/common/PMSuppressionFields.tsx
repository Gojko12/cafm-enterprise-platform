import { PM_FREQUENCY_RANKS } from "@cafm/shared-schema";
import type { PM_Schedule } from "@cafm/shared-schema";

export type SuppressionConfig = Pick<PM_Schedule, "frequencyCode" | "suppressionMode" | "suppressionGroupKey" | "suppressionGroupName" | "sharedAnchorDate" | "collisionWindowDays">;
export function suppressionConfig(value?: SuppressionConfig): SuppressionConfig {
  return { frequencyCode: value?.frequencyCode, suppressionMode: value?.suppressionMode, suppressionGroupKey: value?.suppressionGroupKey, suppressionGroupName: value?.suppressionGroupName, sharedAnchorDate: value?.sharedAnchorDate, collisionWindowDays: value?.collisionWindowDays };
}
export function PMSuppressionFields({ value, onChange, disabled = false }: { value: SuppressionConfig; onChange: (changes: SuppressionConfig) => void; disabled?: boolean }) {
  const field = "block max-w-full rounded border bg-white p-2 text-sm";
  return <fieldset disabled={disabled} className="flex flex-wrap gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs"><legend className="px-1 font-semibold">Nested PM suppression</legend>
    <label>Mode<select className={field} value={value.suppressionMode ?? "suppress_and_inherit"} onChange={(e) => onChange({ ...value, suppressionMode: e.target.value as PM_Schedule["suppressionMode"] })}><option value="suppress_and_inherit">Cancelling Ladder (Higher Cancels Lower &amp; Inherits Steps)</option><option value="independent">Independent Track (Never Cancels)</option></select></label>
    <label>Frequency code<select className={field} value={value.frequencyCode ?? ""} onChange={(e) => onChange({ ...value, frequencyCode: e.target.value ? e.target.value as PM_Schedule["frequencyCode"] : undefined })}><option value="">Use legacy schedule frequency</option>{Object.keys(PM_FREQUENCY_RANKS).map((code) => <option key={code}>{code}</option>)}</select></label>
    <label>Suppression group key<input className={field} value={value.suppressionGroupKey ?? ""} onChange={(e) => onChange({ ...value, suppressionGroupKey: e.target.value || undefined })} /></label>
    <label>Suppression group name<input className={field} value={value.suppressionGroupName ?? ""} onChange={(e) => onChange({ ...value, suppressionGroupName: e.target.value || undefined })} /></label>
    <label>Shared anchor date<input type="date" className={field} value={value.sharedAnchorDate ?? ""} onChange={(e) => onChange({ ...value, sharedAnchorDate: e.target.value || undefined })} /></label>
    <label>Collision window ± days<input type="number" min={0} max={366} placeholder="Auto: monthly+ 14; weekly 2" className={field} value={value.collisionWindowDays ?? ""} onChange={(e) => onChange({ ...value, collisionWindowDays: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
  </fieldset>;
}

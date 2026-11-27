import { useState } from "react";
import type { Equipment } from "@cafm/shared-schema";
import type { EquipmentAssociation } from "@/lib/cafm-data";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";

// V76 (Section 126): equipment associations. Some assets physically serve
// several installations at once (one pump feeding two chillers, a generator
// backing up a switchboard). The strict parent-child hierarchy cannot
// express that, so these side-links live in their own many-to-many
// collection (blob kind "equipmentAssociations"). Managed from the
// Hierarchy tab of the equipment details; surfaced as badges in the FJ/PM/LJ
// work request popups and as a "Serves" column in the flat table. Rollback:
// scripts/supabase-v76-1-associations-rollback.sql removes the blocks.

export const EQUIPMENT_ASSOCIATION_KINDS = ["serves", "feeds", "cools", "backsup"] as const;
export type EquipmentAssociationKind = typeof EQUIPMENT_ASSOCIATION_KINDS[number];

const KIND_LABEL: Record<EquipmentAssociationKind, string> = {
  serves: "serves", feeds: "feeds", cools: "cools", backsup: "backs up",
};

/** Read-only badges for work request popups: shows the shared links that
 *  involve any of the request's equipment codes. Renders nothing when the
 *  site has no matching associations. */
export function EquipmentAssociationBadges({ siteId, codes }: { siteId: string; codes: string[] }) {
  const { data } = useCafmStore();
  const links = (data.equipmentAssociations ?? []).filter((entry) =>
    entry.siteId === siteId && (codes.includes(entry.fromCode) || codes.includes(entry.toCode)));
  if (links.length === 0) return null;
  const name = (code: string) =>
    data.equipment.find((eq) => eq.SiteId === siteId && eq.EquipmentCode === code)?.EquipmentName ?? code;
  return (
    <div className="mt-1 flex flex-wrap gap-1" aria-label="Shared equipment links">
      {links.map((entry) => {
        const outgoing = codes.includes(entry.fromCode);
        const text = outgoing ? `${KIND_LABEL[entry.kind]} ${name(entry.toCode)}` : `${name(entry.fromCode)} ${KIND_LABEL[entry.kind]} this`;
        return <span key={entry.id} title={entry.note} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">{text}</span>;
      })}
    </div>
  );
}

/** Editable card for the equipment details panel (Hierarchy tab): lists and
 *  manages the side-links of one equipment item. */
export function EquipmentAssociationsPanel({ item, equipment, canEdit }: { item: Equipment; equipment: Equipment[]; canEdit: boolean }) {
  const { data, setData } = useCafmStore();
  const { activePerson } = useSiteContext();
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<EquipmentAssociationKind>("serves");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const links = (data.equipmentAssociations ?? []).filter((entry) =>
    entry.siteId === item.SiteId && (entry.fromCode === item.EquipmentCode || entry.toCode === item.EquipmentCode));
  const outgoing = links.filter((entry) => entry.fromCode === item.EquipmentCode);
  const incoming = links.filter((entry) => entry.toCode === item.EquipmentCode);
  const name = (code: string) => equipment.find((eq) => eq.EquipmentCode === code)?.EquipmentName ?? code;
  const add = () => {
    if (!canEdit) { setError("Permission required: Manage Equipment."); return; }
    if (!target) { setError("Pick the equipment this asset serves."); return; }
    if (target === item.EquipmentCode) { setError("An asset cannot link to itself."); return; }
    if (outgoing.some((entry) => entry.toCode === target && entry.kind === kind)) { setError("That link already exists."); return; }
    const entry: EquipmentAssociation = {
      id: crypto.randomUUID(), siteId: item.SiteId, fromCode: item.EquipmentCode, toCode: target, kind,
      ...(note.trim() ? { note: note.trim() } : {}), createdBy: activePerson, createdAt: new Date().toISOString(),
    };
    setData((state) => ({ ...state, equipmentAssociations: [...(state.equipmentAssociations ?? []), entry] }));
    setTarget(""); setNote(""); setError("");
  };
  const remove = (id: string) => {
    if (!canEdit) return;
    setData((state) => ({ ...state, equipmentAssociations: (state.equipmentAssociations ?? []).filter((entry) => entry.id !== id) }));
  };
  return (
    <section className="rounded-lg border bg-white p-3 text-sm" aria-label="Equipment shared links">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Shared links (multiple installations)</h4>
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500">This equipment:</p>
        {outgoing.length === 0 && <p className="text-xs text-slate-400">serves no other equipment yet.</p>}
        {outgoing.map((entry) => (
          <div key={entry.id} className="flex items-center gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800" title={entry.note}>
              {KIND_LABEL[entry.kind]} <strong>{name(entry.toCode)}</strong>{entry.note ? ` · ${entry.note}` : ""}</span>
            {canEdit && <button aria-label={`Remove link to ${name(entry.toCode)}`} onClick={() => remove(entry.id)} className="text-xs text-red-700">✕ remove</button>}
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-1">
        <p className="text-xs font-medium text-slate-500">Other equipment linking here:</p>
        {incoming.length === 0 && <p className="text-xs text-slate-400">no other equipment links to this item yet.</p>}
        {incoming.map((entry) => (
          <div key={entry.id} className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700" title={entry.note}>
              <strong>{name(entry.fromCode)}</strong> {KIND_LABEL[entry.kind]} this{entry.note ? ` · ${entry.note}` : ""}</span>
            {canEdit && <button aria-label={`Remove link from ${name(entry.fromCode)}`} onClick={() => remove(entry.id)} className="text-xs text-red-700">✕ remove</button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">Serves
            <select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1 block max-w-[16rem] rounded border bg-white p-1">
              <option value="">Select equipment</option>
              {equipment.filter((eq) => eq.EquipmentCode !== item.EquipmentCode).map((eq) =>
                <option key={eq.EquipmentCode} value={eq.EquipmentCode}>{eq.EquipmentCode} · {eq.EquipmentName}</option>)}
            </select>
          </label>
          <label className="text-xs">Link
            <select value={kind} onChange={(event) => setKind(event.target.value as EquipmentAssociationKind)} className="mt-1 block rounded border bg-white p-1">
              {EQUIPMENT_ASSOCIATION_KINDS.map((value) => <option key={value} value={value}>{KIND_LABEL[value]}</option>)}
            </select>
          </label>
          <label className="text-xs">Note
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="optional" className="mt-1 block w-40 rounded border p-1" />
          </label>
          <button onClick={add} className="rounded bg-blue-700 px-2 py-1 text-xs text-white">Add link</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  );
}

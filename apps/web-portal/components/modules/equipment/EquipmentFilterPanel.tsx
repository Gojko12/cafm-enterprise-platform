"use client";

import React, { useCallback, useMemo, useState } from "react";
import { EQUIPMENT_STATUSES } from "@cafm/shared-schema";
import type { Equipment } from "@cafm/shared-schema";
import { EQUIPMENT_FILTER_FIELDS, buildEquipmentMatcher, findEquipmentFilterField, operatorsForField } from "@/lib/equipment-filters";
import type { FieldFilterRow, FilterCondition } from "@/lib/equipment-filters";

// V70 Section 120: the Equipment Registry filter bar and advanced filter.
// The hook owns every piece of filter state (quick search, status
// checkboxes, per-field rows, advanced AND/OR conditions) so the registry
// itself only consumes { toolbar, panel, matches, filtering, signature }.

const INPUT_CLASS = "min-w-0 flex-1 rounded border p-1 text-xs";
const SELECT_CLASS = "rounded border bg-white p-1 text-xs";
const VALUELESS_OPERATORS: string[] = ["isEmpty", "isNotEmpty"];

function newFieldFilter(): FieldFilterRow {
  return { id: crypto.randomUUID(), fieldId: "LocalEquipmentCode", value: "" };
}

function newCondition(): FilterCondition {
  return { id: crypto.randomUUID(), fieldId: "EquipmentName", operator: "contains", value: "", connector: "and" };
}

export function useEquipmentFilters(equipment: Equipment[]) {
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [fieldFilters, setFieldFilters] = useState<FieldFilterRow[]>([]);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [open, setOpen] = useState(false);

  const query = search.trim().toLowerCase();
  // One string that changes whenever any filter changes: stable useMemo dep.
  const signature = useMemo(() => JSON.stringify({ query, statuses, fieldFilters, conditions }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, statuses, fieldFilters, conditions]);
  const matches = useMemo(() => buildEquipmentMatcher({ query, statuses, fieldFilters, conditions }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature]);
  const activeCount = (query ? 1 : 0) + (statuses.length ? 1 : 0)
    + fieldFilters.filter((row) => row.value.trim()).length + conditions.length;
  const filtering = activeCount > 0;
  const matchCount = useMemo(() => equipment.filter(matches).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [equipment, signature]);

  const applyFocusSearch = useCallback((code: string) => {
    setSearch(code); setStatuses([]); setFieldFilters([]); setConditions([]);
  }, []);

  const updateFieldFilter = (id: string, next: Partial<FieldFilterRow>) =>
    setFieldFilters((rows) => rows.map((row) => row.id === id ? { ...row, ...next } : row));
  const updateCondition = (id: string, next: Partial<FilterCondition>) =>
    setConditions((rows) => rows.map((row) => row.id === id ? { ...row, ...next } : row));

  const toolbar = <>
    <input value={search} onChange={(event) => setSearch(event.target.value)}
      placeholder="Search code, local code, name, trade, room…" aria-label="Search equipment"
      className="min-w-[14rem] flex-1 rounded-lg border px-3 py-1.5 text-sm" />
    <details className="relative text-left text-xs">
      <summary aria-label="Equipment status filter" className="cursor-pointer truncate rounded-lg border bg-white px-3 py-1.5">
        Status: {statuses.length ? statuses.join(", ") : "All Statuses"}</summary>
      <div className="absolute z-20 w-48 rounded border bg-white p-2 shadow">
        <button onClick={() => setStatuses([])} className="block underline">All Statuses</button>
        {EQUIPMENT_STATUSES.map((status) => <label key={status} className="block py-1">
          <input type="checkbox" checked={statuses.includes(status)}
            onChange={(event) => setStatuses((current) => event.target.checked ? [...current, status] : current.filter((entry) => entry !== status))} /> {status}</label>)}
      </div>
    </details>
    <button aria-expanded={open} aria-pressed={open} onClick={() => setOpen((current) => !current)}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${open || activeCount ? "border-blue-600 bg-blue-50 text-blue-700" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
      ⚙ Filters{activeCount ? ` (${activeCount})` : ""}</button>
  </>;

  const panel = <div className="basis-full rounded-lg border bg-slate-50 p-3 space-y-3">
    <section aria-label="Field filters" className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-xs uppercase tracking-wide text-slate-500">Field filters</strong>
        <span className="text-[11px] text-slate-500">Every active row must match (AND), combined with the search and status filters.</span>
      </div>
      {fieldFilters.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-1">
        <select aria-label="Filter field" value={row.fieldId} className={SELECT_CLASS}
          onChange={(event) => updateFieldFilter(row.id, { fieldId: event.target.value })}>
          {EQUIPMENT_FILTER_FIELDS.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
        </select>
        <span className="text-[11px] text-slate-500">contains</span>
        <input aria-label="Field filter value" value={row.value} placeholder="contains…"
          onChange={(event) => updateFieldFilter(row.id, { value: event.target.value })} className={INPUT_CLASS} />
        <button aria-label="Remove field filter" onClick={() => setFieldFilters((rows) => rows.filter((entry) => entry.id !== row.id))}
          className="rounded border bg-white px-2 py-0.5 text-xs text-slate-500">×</button>
      </div>)}
      <button onClick={() => setFieldFilters((rows) => [...rows, newFieldFilter()])}
        className="rounded border bg-white px-2 py-1 text-xs text-blue-700">+ Add field filter</button>
    </section>
    <section aria-label="Advanced filter" className="space-y-1 border-t pt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-xs uppercase tracking-wide text-slate-500">Advanced filter (AND / OR)</strong>
        <span className="text-[11px] text-slate-500">Rows combine top to bottom using the connector in front of each row, e.g. A or B and C means (A or B) and C.</span>
      </div>
      {conditions.map((condition, index) => {
        const field = findEquipmentFilterField(condition.fieldId);
        const operators = operatorsForField(field);
        const needsValue = !VALUELESS_OPERATORS.includes(condition.operator);
        return <div key={condition.id} className="flex flex-wrap items-center gap-1">
          {index === 0 ? <span aria-hidden="true" className="w-11 text-center text-[11px] text-slate-400">where</span>
            : <select aria-label="Combine with previous conditions" value={condition.connector} className={SELECT_CLASS}
              onChange={(event) => updateCondition(condition.id, { connector: event.target.value === "or" ? "or" : "and" })}>
              <option value="and">and</option><option value="or">or</option></select>}
          <select aria-label="Condition field" value={condition.fieldId} className={SELECT_CLASS}
            onChange={(event) => {
              const nextFieldId = event.target.value;
              const nextField = findEquipmentFilterField(nextFieldId);
              const stillValid = operatorsForField(nextField).some((operator) => operator.id === condition.operator);
              updateCondition(condition.id, { fieldId: nextFieldId, operator: stillValid ? condition.operator : operatorsForField(nextField)[0].id });
            }}>
            {EQUIPMENT_FILTER_FIELDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
          <select aria-label="Condition operator" value={condition.operator} className={SELECT_CLASS}
            onChange={(event) => updateCondition(condition.id, { operator: event.target.value as FilterCondition["operator"], value: VALUELESS_OPERATORS.includes(event.target.value) ? "" : condition.value })}>
            {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.label}</option>)}
          </select>
          {needsValue
            ? <input aria-label="Condition value" value={condition.value} placeholder="value…"
                onChange={(event) => updateCondition(condition.id, { value: event.target.value })} className={INPUT_CLASS} />
            : <span className="text-[11px] text-slate-400">no value needed</span>}
          <button aria-label="Remove condition" onClick={() => setConditions((rows) => rows.filter((entry) => entry.id !== condition.id))}
            className="rounded border bg-white px-2 py-0.5 text-xs text-slate-500">×</button>
        </div>;
      })}
      <button onClick={() => setConditions((rows) => [...rows, newCondition()])}
        className="rounded border bg-white px-2 py-1 text-xs text-blue-700">+ Add condition</button>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[11px] text-slate-500">
      <span aria-live="polite">{matchCount} of {equipment.length} equipment match the active filters.</span>
      <button onClick={() => { setFieldFilters([]); setConditions([]); setStatuses([]); setOpen(true); }}
        className="rounded border bg-white px-2 py-1 text-xs text-slate-600">Clear field and advanced filters</button>
    </div>
  </div>;

  return { matches, filtering, signature, activeCount, toolbar, panel, applyFocusSearch };
}

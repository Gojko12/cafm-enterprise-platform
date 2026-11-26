"use client";

import React, { useCallback, useMemo, useState } from "react";
import { EQUIPMENT_STATUSES } from "@cafm/shared-schema";
import type { Equipment } from "@cafm/shared-schema";
import { EQUIPMENT_FILTER_FIELDS, buildEquipmentMatcher, findEquipmentFilterField, operatorsForField } from "@/lib/equipment-filters";
import type { FieldFilterRow, FilterCondition } from "@/lib/equipment-filters";

// V70 Section 120: the Equipment Registry filter bar and advanced filter.
// The hook owns every piece of filter state (quick search, status
// checkboxes, per-field rows, advanced AND/OR conditions) so the registry
// itself only consumes { toolbar, matches, filtering, signature }.
// V71 Section 121 made the UI discreet: the filter rows now live in a
// compact dropdown popover anchored to the Filters button (a details
// element, the same pattern as the status dropdown) instead of a
// full-width band that pushes the registry content down; the explanation
// sentences became hover tooltips and the match counter only renders
// while a filter is active.
// V72 Section 122: two follow-ups from live use. (1) The popover rows can
// never collapse again: every select got a fixed width (shrink-0), the
// value inputs keep a minimum width and the popover widened to 34rem, so
// the field, the "contains" label, the input and the remove button are
// always visible. (2) Active filters are now LOUD: while any filter is
// on, the Filters button turns solid blue with a flag and the count, and
// an amber strip under the toolbar shows the flag, the active filter
// count, the live match count and a Clear-all button, so nobody forgets
// that a filter is hiding equipment.

const INPUT_CLASS = "min-w-[5rem] flex-1 rounded border p-1 text-xs";
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
    <details className="relative text-left text-xs">
      <summary aria-label="Equipment filters"
        className={`cursor-pointer truncate rounded-lg border px-3 py-1.5 font-medium ${activeCount ? "border-blue-700 bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
        {activeCount ? `⚑ Filters (${activeCount})` : "⚙ Filters"}</summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-[min(34rem,calc(100vw-3rem))] rounded-lg border bg-white p-2.5 shadow-lg">
        <section aria-label="Field filters" className="space-y-1">
          <span title="Every active row must match (AND), combined with the search and status filters."
            className="block text-[11px] font-medium text-slate-500">Field filters</span>
          {fieldFilters.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-1">
            <select aria-label="Filter field" value={row.fieldId} className={`${SELECT_CLASS} w-44 shrink-0`}
              onChange={(event) => updateFieldFilter(row.id, { fieldId: event.target.value })}>
              {EQUIPMENT_FILTER_FIELDS.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
            </select>
            <span className="shrink-0 text-[11px] text-slate-500">contains</span>
            <input aria-label="Field filter value" value={row.value} placeholder="contains…"
              onChange={(event) => updateFieldFilter(row.id, { value: event.target.value })} className={INPUT_CLASS} />
            <button aria-label="Remove field filter" onClick={() => setFieldFilters((rows) => rows.filter((entry) => entry.id !== row.id))}
              className="shrink-0 rounded border bg-white px-2 py-0.5 text-xs text-slate-500">×</button>
          </div>)}
          <button onClick={() => setFieldFilters((rows) => [...rows, newFieldFilter()])}
            className="text-xs text-blue-700 hover:underline">+ Add field filter</button>
        </section>
        <section aria-label="Advanced filter" className="mt-2 space-y-1 border-t pt-2">
          <span title="Rows combine top to bottom using the connector in front of each row, e.g. A or B and C means (A or B) and C."
            className="block text-[11px] font-medium text-slate-500">Advanced filter (and / or)</span>
          {conditions.map((condition, index) => {
            const field = findEquipmentFilterField(condition.fieldId);
            const operators = operatorsForField(field);
            const needsValue = !VALUELESS_OPERATORS.includes(condition.operator);
            return <div key={condition.id} className="flex flex-wrap items-center gap-1">
              {index === 0 ? <span aria-hidden="true" className="w-11 text-center text-[11px] text-slate-400">where</span>
                : <select aria-label="Combine with previous conditions" value={condition.connector} className={`${SELECT_CLASS} w-14 shrink-0`}
                  onChange={(event) => updateCondition(condition.id, { connector: event.target.value === "or" ? "or" : "and" })}>
                  <option value="and">and</option><option value="or">or</option></select>}
              <select aria-label="Condition field" value={condition.fieldId} className={`${SELECT_CLASS} w-40 shrink-0`}
                onChange={(event) => {
                  const nextFieldId = event.target.value;
                  const nextField = findEquipmentFilterField(nextFieldId);
                  const stillValid = operatorsForField(nextField).some((operator) => operator.id === condition.operator);
                  updateCondition(condition.id, { fieldId: nextFieldId, operator: stillValid ? condition.operator : operatorsForField(nextField)[0].id });
                }}>
                {EQUIPMENT_FILTER_FIELDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
              <select aria-label="Condition operator" value={condition.operator} className={`${SELECT_CLASS} w-32 shrink-0`}
                onChange={(event) => updateCondition(condition.id, { operator: event.target.value as FilterCondition["operator"], value: VALUELESS_OPERATORS.includes(event.target.value) ? "" : condition.value })}>
                {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.label}</option>)}
              </select>
              {needsValue
                ? <input aria-label="Condition value" value={condition.value} placeholder="value…"
                    onChange={(event) => updateCondition(condition.id, { value: event.target.value })} className={INPUT_CLASS} />
                : <span className="text-[11px] text-slate-400">no value needed</span>}
              <button aria-label="Remove condition" onClick={() => setConditions((rows) => rows.filter((entry) => entry.id !== condition.id))}
                className="shrink-0 rounded border bg-white px-2 py-0.5 text-xs text-slate-500">×</button>
            </div>;
          })}
          <button onClick={() => setConditions((rows) => [...rows, newCondition()])}
            className="text-xs text-blue-700 hover:underline">+ Add condition</button>
        </section>
        {filtering && <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-slate-500">
          <span aria-live="polite">{matchCount} of {equipment.length} match</span>
          <button onClick={() => { setFieldFilters([]); setConditions([]); setStatuses([]); }}
            title="Keeps the search box; clears the status, field and advanced filters."
            className="text-slate-600 hover:underline">Clear filters</button>
        </div>}
      </div>
    </details>
    {filtering && <div className="basis-full flex flex-wrap items-center gap-2 rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900">
      <span aria-live="polite">⚑ {activeCount} filter{activeCount === 1 ? "" : "s"} active: showing {matchCount} of {equipment.length} equipment</span>
      <button onClick={() => { setSearch(""); setStatuses([]); setFieldFilters([]); setConditions([]); }}
        className="rounded border border-amber-600 bg-white px-2 py-0.5 text-amber-900 hover:bg-amber-50">Clear all filters</button>
    </div>}
  </>;

  return { matches, filtering, signature, activeCount, toolbar, applyFocusSearch };
}

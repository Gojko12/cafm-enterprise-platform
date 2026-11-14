"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * `<SmartDataGrid/>` — the platform-wide standard data table (Section 81).
 * Reusable table with column drag-resize persisted in `localStorage` by `tableId`,
 * click-to-sort headers, inline per-column filter inputs and a left-anchored
 * `Columns ⚙️` show/hide picker.
 */
export interface SmartGridColumn<Row> {
  id: string;
  label: string;
  /** Plain-text value used for filtering, sorting and the cell tooltip. */
  value: (row: Row) => string;
  /** Optional sort override (e.g. ISO dates or numbers behind a formatted value). */
  sortValue?: (row: Row) => string | number;
  /** Optional rich cell renderer; falls back to the plain value. */
  render?: (row: Row) => React.ReactNode;
  defaultWidth?: number;
  defaultHidden?: boolean;
}

interface SmartGridPrefs {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
  sort: { id: string; desc: boolean } | null;
}

const MIN_WIDTH = 60;
const storageKey = (tableId: string) => `cafm-smart-grid:${tableId}`;

function loadPrefs(tableId: string, ids: string[], defaultHidden: string[]): SmartGridPrefs {
  const fallback: SmartGridPrefs = { order: [...ids], hidden: [...defaultHidden], widths: {}, sort: null };
  try {
    const raw = localStorage.getItem(storageKey(tableId));
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("order" in value) || !Array.isArray((value as SmartGridPrefs).order)) return fallback;
    const saved = value as Partial<SmartGridPrefs>;
    const valid = (id: unknown): id is string => typeof id === "string" && ids.includes(id);
    const sort = saved.sort && typeof saved.sort === "object" && valid(saved.sort.id) && typeof saved.sort.desc === "boolean"
      ? { id: saved.sort.id, desc: saved.sort.desc } : null;
    return {
      order: [...new Set([...(saved.order ?? []).filter(valid), ...ids])],
      hidden: (saved.hidden ?? []).filter(valid),
      widths: Object.fromEntries(Object.entries(saved.widths ?? {}).filter(([id, width]) => valid(id) && typeof width === "number" && width >= MIN_WIDTH)),
      sort,
    };
  } catch {
    return fallback;
  }
}

export function SmartDataGrid<Row>({ tableId, columns, rows, rowKey, onRowClick, emptyText = "No rows match the current filters.", leading, trailing, maxHeightClass = "max-h-[70vh]", countLabel }: {
  tableId: string;
  columns: Array<SmartGridColumn<Row>>;
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  emptyText?: string;
  /** Optional fixed leading column (e.g. selection checkboxes). */
  leading?: { header: React.ReactNode; cell: (row: Row) => React.ReactNode; width?: number };
  /** Optional fixed trailing column (e.g. row actions). */
  trailing?: { header: React.ReactNode; cell: (row: Row) => React.ReactNode; width?: number };
  maxHeightClass?: string;
  countLabel?: string;
}) {
  const ids = useMemo(() => columns.map((column) => column.id), [columns]);
  const defaultHidden = useMemo(() => columns.filter((column) => column.defaultHidden).map((column) => column.id), [columns]);
  const [prefs, setPrefs] = useState<SmartGridPrefs>({ order: [...ids], hidden: [...defaultHidden], widths: {}, sort: null });
  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const resizing = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // Column identity key keeps the effect stable even though callers recreate the columns array per render.
  const idsKey = ids.join("|");
  useEffect(() => {
    const current = columnsRef.current;
    setPrefs(loadPrefs(tableId, current.map((column) => column.id), current.filter((column) => column.defaultHidden).map((column) => column.id)));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, idsKey]);

  const savePrefs = (next: SmartGridPrefs) => {
    setPrefs(next);
    try { localStorage.setItem(storageKey(tableId), JSON.stringify(next)); } catch { /* quota exceeded: keep in-memory prefs */ }
  };

  const byId = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const width = (id: string) => prefs.widths[id] ?? byId.get(id)?.defaultWidth ?? 150;
  const visible = prefs.order.filter((id) => !prefs.hidden.includes(id) && byId.has(id));

  const startResize = (id: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    resizing.current = { id, startX: event.clientX, startWidth: width(id) };
    const onMove = (move: MouseEvent) => {
      const current = resizing.current;
      if (!current) return;
      const next = Math.max(MIN_WIDTH, current.startWidth + move.clientX - current.startX);
      setPrefs((previous) => ({ ...previous, widths: { ...previous.widths, [current.id]: next } }));
    };
    const onUp = () => {
      resizing.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try { localStorage.setItem(storageKey(tableId), JSON.stringify(prefsRef.current)); } catch { /* quota exceeded */ }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleSort = (id: string) => savePrefs({ ...prefs, sort: prefs.sort?.id === id ? (prefs.sort.desc ? null : { id, desc: true }) : { id, desc: false } });

  const move = (id: string, destination: number) => {
    if (destination < 0 || destination >= prefs.order.length) return;
    const order = prefs.order.filter((item) => item !== id);
    order.splice(destination, 0, id);
    savePrefs({ ...prefs, order });
  };

  const filtered = useMemo(() => rows.filter((row) => visible.every((id) => {
    const query = (filters[id] ?? "").trim().toLowerCase();
    return !query || byId.get(id)!.value(row).toLowerCase().includes(query);
  })), [rows, visible, filters, byId]);

  const sorted = useMemo(() => {
    const sort = prefs.sort;
    if (!sort || !byId.has(sort.id)) return filtered;
    const column = byId.get(sort.id)!;
    const sortValue = (row: Row) => column.sortValue ? column.sortValue(row) : column.value(row);
    return [...filtered].sort((a, b) => {
      const left = sortValue(a), right = sortValue(b);
      const compared = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
      return (sort.desc ? -1 : 1) * compared || rowKey(a).localeCompare(rowKey(b));
    });
  }, [filtered, prefs.sort, byId, rowKey]);

  const activeFilterCount = Object.values(filters).filter((value) => value.trim()).length;
  if (!ready) return <div className="rounded border bg-white p-4 text-sm text-slate-500">Loading table…</div>;

  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <details className="relative">
        <summary className="cursor-pointer rounded border bg-white px-2 py-1 font-semibold select-none">Columns ⚙️</summary>
        <div className="absolute left-0 z-30 mt-1 max-h-96 w-72 space-y-1 overflow-auto rounded border bg-white p-3 shadow-xl">
          <p className="text-xs text-slate-500">Show / hide, reorder (drag or arrows).</p>
          {prefs.order.filter((id) => byId.has(id)).map((id, index) => <div key={id} draggable
            onDragStart={() => setDrag(id)} onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); if (drag) move(drag, index); setDrag(null); }}
            className="flex items-center gap-2 rounded border p-1">
            <label className="flex-1 truncate text-xs"><input type="checkbox" checked={!prefs.hidden.includes(id)}
              onChange={(event) => savePrefs({ ...prefs, hidden: event.target.checked ? prefs.hidden.filter((item) => item !== id) : [...prefs.hidden, id] })} /> {byId.get(id)!.label}</label>
            <button type="button" aria-label={`Move ${byId.get(id)!.label} up`} className="rounded border px-1 disabled:opacity-30" disabled={index === 0} onClick={() => move(id, index - 1)}>↑</button>
            <button type="button" aria-label={`Move ${byId.get(id)!.label} down`} className="rounded border px-1 disabled:opacity-30" disabled={index === prefs.order.length - 1} onClick={() => move(id, index + 1)}>↓</button>
          </div>)}
          <button type="button" className="rounded border px-2 py-1" onClick={() => savePrefs({ order: [...ids], hidden: [...defaultHidden], widths: {}, sort: null })}>Reset Columns</button>
        </div>
      </details>
      <strong>{sorted.length} / {rows.length} {countLabel ?? "rows"}</strong>
      {activeFilterCount > 0 && <button type="button" className="rounded border bg-white px-2 py-1" onClick={() => setFilters({})}>Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}</button>}
    </div>
    <div className={`${maxHeightClass} overflow-auto rounded border bg-white`}>
      <table className="table-fixed whitespace-nowrap text-left text-xs" style={{ width: (leading ? leading.width ?? 44 : 0) + (trailing ? trailing.width ?? 110 : 0) + visible.reduce((sum, id) => sum + width(id), 0) }}>
        <colgroup>
          {leading && <col style={{ width: leading.width ?? 44 }} />}
          {visible.map((id) => <col key={id} style={{ width: width(id) }} />)}
          {trailing && <col style={{ width: trailing.width ?? 110 }} />}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            {leading && <th className="p-2">{leading.header}</th>}
            {visible.map((id) => <th key={id} className="relative p-2" title={byId.get(id)!.label}>
              <button type="button" className="block max-w-full truncate text-left font-semibold" onClick={() => toggleSort(id)}>
                {byId.get(id)!.label} {prefs.sort?.id === id ? prefs.sort.desc ? "▼" : "▲" : ""}
              </button>
              <span role="separator" aria-label={`Resize ${byId.get(id)!.label}`} onMouseDown={(event) => startResize(id, event)}
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-300" />
            </th>)}
            {trailing && <th className="p-2">{trailing.header}</th>}
          </tr>
          <tr>
            {leading && <th />}
            {visible.map((id) => <th key={id} className="p-1">
              <input aria-label={`Filter ${byId.get(id)!.label}`} placeholder="Filter" value={filters[id] ?? ""}
                onChange={(event) => setFilters({ ...filters, [id]: event.target.value })}
                className="w-full min-w-0 rounded border px-1 py-1 font-normal" />
            </th>)}
            {trailing && <th />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => <tr key={rowKey(row)} className={`border-t hover:bg-sky-50 ${onRowClick ? "cursor-pointer" : ""}`}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={onRowClick ? (event) => { if (event.key === "Enter") onRowClick(row); } : undefined}
            tabIndex={onRowClick ? 0 : undefined}>
            {leading && <td className="p-2" onClick={(event) => event.stopPropagation()}>{leading.cell(row)}</td>}
            {visible.map((id) => {
              const column = byId.get(id)!;
              return <td key={id} className="max-w-sm truncate px-2 py-1.5" title={column.value(row)}>{column.render ? column.render(row) : column.value(row) || "—"}</td>;
            })}
            {trailing && <td className="p-2" onClick={(event) => event.stopPropagation()}>{trailing.cell(row)}</td>}
          </tr>)}
        </tbody>
      </table>
      {!sorted.length && <p className="p-4 text-sm text-slate-500">{emptyText}</p>}
    </div>
  </div>;
}

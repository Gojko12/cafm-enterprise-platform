"use client";

import React, { useEffect, useRef, useState } from "react";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@cafm/shared-schema";

export type TableColumn<T> = { id: string; label: string; value: (row: T) => string | number | undefined; render?: (row: T) => React.ReactNode; renderFilter?: () => React.ReactNode; wrap?: boolean };
type Settings = { order: string[]; hidden: string[]; widths?: Record<string, number> };
const displayValue = (value: string | number | undefined) => {
  if (typeof value !== "string") return value ?? "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateDDMMYYYY(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return formatDateTimeDDMMYYYY(value);
  return value || "—";
};

export function ResizeHandle({ label, onResize, width }: { label: string; width: number; onResize: (width: number) => void }) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  return <span role="separator" aria-label={`Resize ${label}`} aria-orientation="vertical" tabIndex={0}
    className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300"
    onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); onResize(Math.max(60, Math.min(800, width + (event.key === "ArrowLeft" ? -10 : 10)))); }
    }}
    onMouseDown={(event) => {
      event.preventDefault(); event.stopPropagation();
      const start = event.clientX;
      const move = (next: MouseEvent) => onResize(Math.max(60, Math.min(800, width + next.clientX - start)));
      cleanup.current?.();
      const stop = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop); cleanup.current = null; };
      cleanup.current = stop;
      window.addEventListener("mousemove", move); window.addEventListener("mouseup", stop);
    }} />;
}

export function useTableColumns<T>(key: string, columns: TableColumn<T>[]) {
  const [settings, setSettings] = useState<Settings>({ order: columns.map((column) => column.id), hidden: [] });
  const [loaded, setLoaded] = useState(false);
  const [sort, setSort] = useState<{ id: string; direction: "asc" | "desc" } | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`cafm-columns:${key}`);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!parsed || typeof parsed !== "object" || !("order" in parsed) || !("hidden" in parsed) ||
            !Array.isArray(parsed.order) || !Array.isArray(parsed.hidden) ||
            !parsed.order.every((item: unknown) => typeof item === "string") || !parsed.hidden.every((item: unknown) => typeof item === "string")) {
          throw new Error("Invalid column preferences");
        }
        const ids = columns.map((column) => column.id);
        const widths = "widths" in parsed && parsed.widths && typeof parsed.widths === "object"
          ? Object.fromEntries(Object.entries(parsed.widths).filter(([id, value]) => (ids.includes(id) || id === "__select" || id === "__action") && typeof value === "number" && Number.isFinite(value) && value >= 60 && value <= 800)) : {};
        setSettings({ order: [...new Set([...parsed.order.filter((id: string) => ids.includes(id)), ...ids])],
          hidden: parsed.hidden.filter((id: string) => ids.includes(id)), widths });
      }
    } catch (error) { console.error("Could not load table column preferences", error); }
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(`cafm-columns:${key}`, JSON.stringify(settings)); }
    catch (error) { console.error("Could not save table column preferences", error); }
  }, [key, settings, loaded]);
  const ordered = settings.order.map((id) => columns.find((column) => column.id === id)).filter((column): column is TableColumn<T> => !!column);
  const visible = ordered.filter((column) => !settings.hidden.includes(column.id));
  const move = (id: string, offset: number) => setSettings((current) => {
    const order = [...current.order], from = order.indexOf(id), to = from + offset;
    if (from < 0 || to < 0 || to >= order.length) return current;
    [order[from], order[to]] = [order[to], order[from]];
    return { ...current, order };
  });
  const toggleSort = (id: string) => setSort((current) => current?.id !== id ? { id, direction: "asc" } :
    current.direction === "asc" ? { id, direction: "desc" } : null);
  const sorted = (rows: T[]) => {
    const column = columns.find((item) => item.id === sort?.id);
    if (!column || !sort) return rows;
    return [...rows].sort((a, b) => {
      const x = column.value(a), y = column.value(b);
      const result = typeof x === "number" && typeof y === "number" ? x - y :
        String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? result : -result;
    });
  };
  const width = (id: string) => settings.widths?.[id] ?? (id === "__select" ? 60 : id === "__action" ? 120 : 150);
  const resize = (id: string, value: number) => setSettings((current) => ({ ...current, widths: { ...current.widths, [id]: value } }));
  return { visible, ordered, sort, toggleSort, sorted, width, resize, menu: <details className="relative text-xs">
    <summary className="cursor-pointer rounded border bg-white px-2 py-1">Columns ⚙️</summary>
    <div className="absolute right-0 z-30 max-h-80 w-64 overflow-auto rounded border bg-white p-2 shadow-lg">
      {ordered.map((column, index) => <div key={column.id} className="flex items-center gap-1 py-1" draggable
        onDragStart={(event) => event.dataTransfer.setData("text/plain", column.id)}
        onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault();
          const dragged = event.dataTransfer.getData("text/plain");
          setSettings((current) => {
            if (!current.order.includes(dragged) || dragged === column.id) return current;
            const order = current.order.filter((item) => item !== dragged);
            order.splice(order.indexOf(column.id), 0, dragged);
            return { ...current, order };
          });
        }}>
        <label className="flex flex-1 items-center gap-1"><input type="checkbox" checked={!settings.hidden.includes(column.id)}
          onChange={(event) => { const checked = event.target.checked; setSettings((current) => ({ ...current, hidden: checked ? current.hidden.filter((id) => id !== column.id) : [...current.hidden, column.id] })); }} />{column.label}</label>
        <button type="button" aria-label={`Move ${column.label} left`} disabled={index === 0} onClick={() => move(column.id, -1)}>←</button>
        <button type="button" aria-label={`Move ${column.label} right`} disabled={index === ordered.length - 1} onClick={() => move(column.id, 1)}>→</button>
      </div>)}
    </div></details> };
}

export function OverviewTable<T>({ preferenceKey, columns, rows, rowKey, onRow, rowClassName, groupBy, viewportClassName }: {
  preferenceKey: string; columns: TableColumn<T>[]; rows: T[]; rowKey: (item: T) => string; onRow?: (item: T) => void; rowClassName?: (item: T) => string;
  groupBy?: { getKey: (item: T) => string; order: readonly string[] }; viewportClassName?: string;
}) {
  const config = useTableColumns(preferenceKey, columns);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const filtered = config.sorted(rows.filter((item) => config.visible.every((column) =>
    String(column.value(item) ?? "").toLowerCase().includes((filters[column.id] ?? "").trim().toLowerCase()))));
  const renderRow = (item: T) => <tr key={rowKey(item)} className={`border-t hover:bg-slate-50 ${rowClassName?.(item) ?? ""}`} tabIndex={onRow ? 0 : undefined}
    onClick={() => onRow?.(item)} onKeyDown={(event) => { if (onRow && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRow(item); } }}>
    {config.visible.map((column) => <td key={column.id} className="p-2" title={column.render ? String(column.value(item) ?? "") : String(displayValue(column.value(item)))}><div className={column.wrap ? "max-h-28 overflow-y-auto whitespace-normal" : "block max-w-full truncate"}>{column.render ? column.render(item) : displayValue(column.value(item))}</div></td>)}</tr>;
  const groups = groupBy ? [...new Set([...groupBy.order, ...filtered.map(groupBy.getKey)])].filter((key) => filtered.some((item) => groupBy.getKey(item) === key)) : [];
  return <div className="space-y-2"><div className="flex justify-end">{config.menu}</div><div className={viewportClassName ?? "overflow-auto rounded border"}>
    <table className="table-fixed text-left text-xs" style={{ width: config.visible.reduce((sum, column) => sum + config.width(column.id), 0) }}><colgroup>{config.visible.map((column) => <col key={column.id} style={{ width: config.width(column.id) }} />)}</colgroup><thead className={viewportClassName ? "sticky top-0 z-20 bg-slate-100" : "bg-slate-100"}><tr>{config.visible.map((column) => <th key={column.id} className="relative p-2" title={column.label}>
      <button className="block max-w-full truncate text-left" onClick={() => config.toggleSort(column.id)}>{column.label} {config.sort?.id === column.id ? config.sort.direction === "asc" ? "▲" : "▼" : ""}</button><ResizeHandle label={column.label} width={config.width(column.id)} onResize={(width) => config.resize(column.id, width)} />
    </th>)}</tr><tr>{config.visible.map((column) => <th key={column.id} className="p-1">{column.renderFilter ? column.renderFilter() : <input aria-label={`Filter ${column.label}`} placeholder="Filter"
      className="w-full min-w-0 rounded border p-1" value={filters[column.id] ?? ""} onChange={(event) => setFilters({ ...filters, [column.id]: event.target.value })} />}</th>)}</tr></thead>
      <tbody>{groupBy ? groups.map((group) => <React.Fragment key={group}><tr className="border-t bg-slate-50"><th colSpan={config.visible.length} className="p-0 text-left"><button className="sticky left-0 z-10 bg-slate-50 p-2 font-semibold" aria-expanded={!collapsed.includes(group)} onClick={() => setCollapsed((old) => old.includes(group) ? old.filter((key) => key !== group) : [...old, group])}>{collapsed.includes(group) ? "▶" : "▼"} 📁 {group || "Unspecified"}</button></th></tr>{!collapsed.includes(group) && filtered.filter((item) => groupBy.getKey(item) === group).map(renderRow)}</React.Fragment>) : filtered.map(renderRow)}</tbody></table>
    {!filtered.length && <p className="p-3 text-xs">No matching records.</p>}
  </div></div>;
}

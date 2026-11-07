"use client";

import React, { useState } from "react";

export type FilterOption = { value: string; label: string; className?: string };

export function MultiSelectFilter({ label, options, value, onChange }: {
  label: string; options: FilterOption[]; value: string[] | null; onChange: (value: string[] | null) => void;
}) {
  const [search, setSearch] = useState("");
  return <details className="relative">
    <summary className="cursor-pointer rounded border bg-white px-2 py-1">{label} {value === null ? "(All)" : `(${value.length} selected)`}</summary>
    <div className="absolute left-0 z-30 w-64 rounded border bg-white p-2 shadow-lg">
      <input aria-label={`Search ${label}`} className="w-full border p-1" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="flex gap-2"><button type="button" onClick={() => onChange(null)}>Select All</button><button type="button" onClick={() => onChange([])}>Clear</button></div>
      <div className="max-h-60 overflow-auto">{options.filter((item) => item.label.toLowerCase().includes(search.toLowerCase())).map((item) => <label key={item.value} className="block">
        <input type="checkbox" checked={value === null || value.includes(item.value)} onChange={(event) => {
          const current = value ?? options.map((option) => option.value);
          onChange(event.target.checked ? [...current, item.value] : current.filter((id) => id !== item.value));
        }} /> <span className={item.className}>{item.label}</span>
      </label>)}</div>
    </div>
  </details>;
}

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCafmStore } from "@/lib/cafm-store";

// The global search reads the live site state directly (same store every
// other panel uses), so there are no extra network round-trips: typing
// filters the client-side state in memory. Every result links to the module
// page that owns the entity.

type AnyRow = Record<string, unknown>;
type StoreData = Record<string, unknown>;

const str = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const rows = (value: unknown): AnyRow[] => {
  if (!Array.isArray(value)) return [];
  return value as AnyRow[];
};

interface SearchCategory {
  key: string;
  label: string;
  href: string;
  // Per-hit href override: when a hit should deep-link to the exact item
  // (query param + effect on the target page) instead of the plain module page.
  buildHref?: (item: AnyRow) => string;
  items: AnyRow[];
  fields: string[];
  terms: string[];
  title: string[];
  subtitle: string[];
}

interface SearchHit {
  categoryKey: string;
  categoryLabel: string;
  href: string;
  title: string;
  subtitle: string;
  score: number;
}

interface SearchGroup {
  category: SearchCategory;
  hits: SearchHit[];
  total: number;
}

const CATEGORY_LIMIT = 5;

function buildCategories(data: StoreData): SearchCategory[] {
  return [
    {
      key: "wr", label: "Work Requests", href: "/work-requests", items: rows(data.workRequests),
      // Deep link to the queue that owns the WR; the ?wr= effect on the page
      // opens the WR details popup right away.
      buildHref: (item) => {
        const id = encodeURIComponent(str(item.WR_ID));
        const type = str(item.WR_Type);
        const route = type === "PM" ? "/preventive-maintenance" : type === "FJ" ? "/fast-jobs" : "/long-jobs";
        return `${route}?wr=${id}`;
      },
      fields: ["WR_ID", "WR_Type", "Description", "WorkRequestStatus", "ProblemLocation", "bl_id", "RoomCode"],
      terms: [],
      title: ["WR_ID"], subtitle: ["WR_Type", "Description"],
    },
    {
      key: "buildings", label: "Buildings", href: "/locations", items: rows(data.buildings),
      fields: ["bl_id", "Name", "Address"],
      terms: ["building"],
      title: ["bl_id"], subtitle: ["Name", "Address"],
    },
    {
      key: "floors", label: "Floors", href: "/locations", items: rows(data.floors),
      fields: ["bl_id", "LevelName", "FloorNumber"],
      terms: ["floor"],
      title: ["LevelName"], subtitle: ["bl_id"],
    },
    {
      key: "rooms", label: "Rooms", href: "/locations", items: rows(data.rooms),
      fields: ["RoomCode", "Name", "bl_id", "LevelName"],
      terms: ["room"],
      title: ["RoomCode"], subtitle: ["Name", "bl_id", "LevelName"],
    },
    {
      key: "equipment", label: "Equipment", href: "/equipment", items: rows(data.equipment),
      // /equipment?eq= preselects the item and opens its details panel.
      buildHref: (item) => `/equipment?eq=${encodeURIComponent(str(item.EquipmentCode))}`,
      fields: ["EquipmentCode", "LocalEquipmentCode", "EquipmentName", "EquipmentNameLocal", "Category", "Manufacturer", "Model", "bl_id", "RoomCode"],
      terms: [],
      title: ["EquipmentCode"], subtitle: ["EquipmentName", "Category"],
    },
    {
      key: "schedules", label: "PM Schedules", href: "/preventive-maintenance", items: rows(data.schedules),
      fields: ["ScheduleId", "ChecklistCode", "Title", "frequencyCode", "targetKey", "bl_id", "LevelName", "RoomCode"],
      terms: ["schedule", "pm"],
      title: ["ChecklistCode"], subtitle: ["Title", "frequencyCode"],
    },
    {
      key: "freezes", label: "Freeze Periods", href: "/freezes", items: rows(data.locationFreezes),
      fields: ["id", "title", "description", "responsiblePerson", "startDateTime", "endDateTime", "buildingId"],
      terms: ["freeze", "freeze period"],
      title: ["title"], subtitle: ["id", "responsiblePerson"],
    },
    {
      key: "craftspeople", label: "Craftspeople", href: "/scheduler", items: rows(data.craftspeople),
      fields: ["id", "Name", "LastName", "Trade", "username", "SkillLevel"],
      terms: ["craftsperson"],
      title: ["Name"], subtitle: ["Trade", "SkillLevel"],
    },
    {
      key: "people", label: "CIFM People", href: "/admin/rbac", items: rows(data.cifmPeople),
      fields: ["id", "displayName", "employeeCode", "departmentTeam", "email", "username"],
      terms: ["person"],
      title: ["displayName"], subtitle: ["employeeCode", "departmentTeam"],
    },
  ];
}

function scoreHit(item: AnyRow, titleFields: string[], query: string): number {
  const title = str(item[titleFields[0]]).toLowerCase();
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  return 2;
}

function searchCategory(category: SearchCategory, query: string): { hits: SearchHit[]; total: number } {
  const q = query.toLowerCase();
  const matched: SearchHit[] = [];
  const seen = new Set<string>();
  for (const item of category.items) {
    const values = [...category.fields.map((field) => str(item[field])), ...category.terms];
    const isMatch = values.some((value) => value.toLowerCase().includes(q));
    if (!isMatch) continue;
    const title = category.title.map((field) => str(item[field])).filter(Boolean).join(" · ");
    const subtitle = category.subtitle.map((field) => str(item[field])).filter(Boolean).join(" · ");
    const dedupeKey = `${category.key}|${title}|${subtitle}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    matched.push({
      categoryKey: category.key,
      categoryLabel: category.label,
      href: category.buildHref ? category.buildHref(item) : category.href,
      title,
      subtitle,
      score: scoreHit(item, category.title, q),
    });
  }
  matched.sort((a, b) => a.score - b.score || (a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1));
  return { hits: matched.slice(0, CATEGORY_LIMIT), total: matched.length };
}

export function GlobalSearch() {
  const { data } = useCafmStore();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const groups: SearchGroup[] = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return buildCategories(data as unknown as StoreData)
      .map((category) => {
        const { hits, total } = searchCategory(category, trimmed);
        return { category, hits, total };
      })
      .filter((group) => group.total > 0);
  }, [query, data]);

  const flat: SearchHit[] = useMemo(() => groups.flatMap((group) => group.hits), [groups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Close the dropdown when clicking anywhere outside of it.
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Press "/" anywhere (outside of a field) to jump into the search box.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    router.push(hit.href);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || flat.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((previous) => (previous + 1) % flat.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((previous) => (previous - 1 + flat.length) % flat.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const hit = flat[Math.min(activeIndex, flat.length - 1)];
      if (hit) go(hit);
    }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative hidden lg:block w-64">
      <div className="flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-300">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          aria-label="Search across the whole platform"
          placeholder="Search WR, room, building, freeze..."
          onFocus={() => { if (query.trim()) setOpen(true); }}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          className="w-full text-sm outline-none bg-transparent"
        />
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {flat.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">Nothing found for &#8220;{query.trim()}&#8221;.</p>
          ) : (
            groups.map((group) => (
              <div key={group.category.key} className="border-b border-gray-100 last:border-b-0">
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase text-gray-400">
                  {group.category.label}
                  <span className="ml-1 normal-case">({group.total})</span>
                </p>
                {group.hits.map((hit) => {
                  const hitIndex = flat.indexOf(hit);
                  const isActive = hitIndex === activeIndex;
                  return (
                    <Link
                      key={`${hit.categoryKey}-${hit.title}-${hit.subtitle}`}
                      href={hit.href}
                      onClick={() => { setOpen(false); }}
                      onMouseEnter={() => setActiveIndex(hitIndex)}
                      className={`block px-4 py-2 text-sm ${isActive ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    >
                      <span className="font-mono text-xs text-gray-800">{hit.title}</span>
                      {hit.subtitle && (
                        <span className="ml-2 text-xs text-gray-500 truncate">{hit.subtitle}</span>
                      )}
                    </Link>
                  );
                })}
                {group.total > group.hits.length && (
                  <Link href={group.category.href} onClick={() => { setOpen(false); }}
                    className="block px-4 pb-2 pt-1 text-[11px] text-gray-400 hover:text-gray-600">
                    +{group.total - group.hits.length} more in {group.category.label} · open module
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

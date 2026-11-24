"use client";

import React, { useMemo, useState } from "react";
import { Info, MapPin, Plane, Radio, Satellite } from "lucide-react";

import { useApp } from "@/lib/hooks/useApp";
import {
  REMOTE_STATIONS,
  STATION_SYSTEM_CATEGORIES,
  STATION_SYSTEMS_BY_ID,
  type RemoteStation,
} from "@/lib/remote-stations";
import { SplatLibrary } from "./SplatLibrary";

const KIND_LABELS: Record<RemoteStation["kind"], string> = {
  dsa: "Deep Space Antenna site",
  ttc: "Near-Earth tracking station",
  campus: "Station campus",
};

export function GroundStationsWorkspace() {
  const { moduleAccessDenied } = useApp();
  const [tab, setTab] = useState<"stations" | "splats">("stations");
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState(REMOTE_STATIONS[0]?.code ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REMOTE_STATIONS;
    return REMOTE_STATIONS.filter((station) =>
      [station.code, station.name, station.country, station.region, station.notes].some((value) => value?.toLowerCase().includes(q)));
  }, [query]);

  const station = REMOTE_STATIONS.find((item) => item.code === selectedCode) ?? filtered[0] ?? null;

  // V66 (Section 116): the no-access check comes after all hooks.
  if (moduleAccessDenied("groundStations")) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">Ground Stations · no access</h1>
        <p className="text-sm text-slate-600">
          Your access profile does not include this module. Ask an administrator to restore it
          in People &amp; Permissions, tab 6 (Person Permission Exceptions).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Ground Stations <span className="text-sm font-normal text-slate-500">ESTRACK remote sites &amp; 3D captures</span></h1>
          <p className="text-xs text-slate-500">Remote antenna stations of the CAFM estate and their Gaussian-splats plan (demo scope).</p>
        </div>
        <div className="flex rounded border bg-white text-sm">
          <button type="button" aria-pressed={tab === "stations"} onClick={() => setTab("stations")}
            className={`px-3 py-1.5 ${tab === "stations" ? "bg-slate-200 font-semibold" : "hover:bg-slate-50"}`}>
            <Radio size={13} className="mr-1 inline" /> Stations ({REMOTE_STATIONS.length})
          </button>
          <button type="button" aria-pressed={tab === "splats"} onClick={() => setTab("splats")}
            className={`px-3 py-1.5 ${tab === "splats" ? "bg-slate-200 font-semibold" : "hover:bg-slate-50"}`}>
            <Satellite size={13} className="mr-1 inline" /> Splat 3D library
          </button>
        </div>
      </div>

      {tab === "stations" ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search station, country, region…" className="w-full rounded border bg-white px-2 py-1.5 text-sm" />
            {filtered.map((item) => (
              <button key={item.code} type="button" onClick={() => setSelectedCode(item.code)}
                className={`w-full rounded border p-2 text-left text-sm ${station?.code === item.code ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <span className="flex items-center justify-between">
                  <span className="font-semibold">{item.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 font-mono text-[11px] text-slate-600">{item.code}</span>
                </span>
                <span className="block text-xs text-slate-500">{item.country} · {item.antennas.length} antenna{item.antennas.length > 1 ? "s" : ""} · since {item.commissioned}</span>
              </button>
            ))}
            {!station && <p className="text-sm text-slate-500">No station matches the search.</p>}
            <p className="flex items-start gap-1 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
              <Info size={12} className="mt-0.5 shrink-0" />
              <span>ESA&apos;s ESTRACK core network: seven ESA-owned stations in seven countries, operated by the Network Operations Centre at ESOC (public ESA material, November 2026). Commercial partner stations (KSAT, SSC, Goonhilly…) run by contract and are not catalogued here. Catalogue is read-only for the demo; promoting a station to a full CAFM site is the next step.</span>
            </p>
          </div>

          {station && <StationDetails station={station} onShowSplats={() => setTab("splats")} />}
        </div>
      ) : (
        <SplatLibrary />
      )}
    </div>
  );
}

function StationDetails({ station, onShowSplats }: { station: RemoteStation; onShowSplats: () => void }) {
  const mapHref = `https://www.openstreetmap.org/?mlat=${station.lat}&mlon=${station.lon}#map=12/${station.lat}/${station.lon}`;
  return (
    <div className="space-y-4">
      <div className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{station.name}</h2>
            <p className="text-sm text-slate-500">{station.country} · {station.region}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {station.kind === "dsa" ? "Deep Space Antenna site" : KIND_LABELS[station.kind]}
          </span>
        </div>
        <div className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-1"><MapPin size={13} className="text-slate-400" /> {station.lat.toFixed(3)}°, {station.lon.toFixed(3)}° · <a href={mapHref} target="_blank" rel="noreferrer" className="text-blue-700 underline">map ↗</a></p>
          <p>Timezone: <span className="font-mono text-xs">{station.timezone}</span></p>
          <p>Managed by: {station.managedBy}</p>
          <p>First antenna in service: {station.commissioned}</p>
          <p className="flex items-center gap-1">
            <Plane size={13} className="text-slate-400" /> Helipad: {station.helipad === null ? "to confirm" : station.helipad ? "yes" : "no"}
          </p>
        </div>
        {station.notes && <p className="mt-2 text-xs text-slate-500">{station.notes}</p>}
      </div>

      <div className="rounded border bg-white p-4">
        <h3 className="text-sm font-semibold">Antennas</h3>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-1 pr-2">ID</th><th className="py-1 pr-2">Dish</th><th className="py-1 pr-2">Bands</th><th className="py-1">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {station.antennas.map((antenna) => (
              <tr key={antenna.id} className="border-b last:border-0">
                <td className="py-1.5 pr-2 font-mono text-xs">{antenna.id}</td>
                <td className="py-1.5 pr-2">{antenna.diameterM} m</td>
                <td className="py-1.5 pr-2">{antenna.bands}</td>
                <td className="py-1.5 text-xs text-slate-600">{antenna.note} (since {antenna.since})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded border bg-white p-4">
        <h3 className="text-sm font-semibold">Technical building ({station.rooms.length} rooms, max 5 by design)</h3>
        <div className="mt-2 flex flex-wrap gap-1">
          {station.rooms.map((room) => (
            <span key={room} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{room}</span>
          ))}
        </div>
      </div>

      <div className="rounded border bg-white p-4">
        <h3 className="text-sm font-semibold">Standard station kit ({STATION_SYSTEM_CATEGORIES.length} groups)</h3>
        <p className="text-xs text-slate-500">The same systems at every station, so the travelling technician finds the same kit here and there.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {STATION_SYSTEM_CATEGORIES.map((category) => (
            <div key={category.id} className="space-y-1 rounded border p-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{category.label}</p>
              {station.systems
                .map((id) => STATION_SYSTEMS_BY_ID[id])
                .filter((system) => system?.category === category.id)
                .map((system) => (
                  <label key={system.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <span aria-hidden className="inline-block h-3.5 w-3.5 rounded border border-emerald-600 bg-emerald-50 text-center text-[9px] leading-[14px] text-emerald-700">✓</span>
                    <span>{system.label}</span>
                  </label>
                ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Technician clearance (planned)</p>
          <p>Only selected technicians travel to these stations. Assignment management will build on the V66 per-person permission exceptions: a station clearance will sit on each technician&apos;s profile (module access, capability flags, future station list). The demo shows the standard kit that makes travel maintenance plannable.</p>
        </div>
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <p className="font-semibold">3D captures without BIM (the splats plan)</p>
          <p>Instead of expensive BIM models, each station gets a walkable 3D capture from a drone flight and ordinary photos (Gaussian splatting), embedded like the examples in this platform.</p>
          <button type="button" onClick={onShowSplats} className="mt-1 rounded border border-blue-700 bg-white px-2 py-1 font-semibold text-blue-800 hover:bg-blue-100">
            Open the Splat 3D library →
          </button>
        </div>
      </div>
    </div>
  );
}

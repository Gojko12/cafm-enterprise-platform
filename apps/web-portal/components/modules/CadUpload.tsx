"use client";

import { useState } from "react";
import { z } from "zod";
import { GeoJSONPolygonSchema } from "@cafm/shared-schema";
import type { Floor } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";

const resultSchema = z.object({
  rooms: z.array(z.object({
    RoomCode: z.string().min(1),
    Name: z.string().min(1),
    NetAreaM2: z.number().nonnegative(),
    Polygon: GeoJSONPolygonSchema,
  })).min(1),
  desks: z.array(z.unknown()),
});

export function CadUpload({ floor }: { floor: Floor }) {
  const { setData } = useCafmStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function importCad(file?: File) {
    setBusy(true);
    setMessage("");
    try {
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        body = form;
      } else {
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({ generateSample: true });
      }
      const response = await fetch("/api/cad-parse", { method: "POST", headers, body });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(typeof result === "object" && result !== null && "error" in result ? String(result.error) : "CAD extraction failed.");
      }
      const parsed = resultSchema.parse(result);
      setData((current) => {
        const rooms = [...current.rooms];
        for (const extracted of parsed.rooms) {
          const index = rooms.findIndex((room) => room.SiteId === floor.SiteId && room.bl_id === floor.bl_id &&
            room.LevelName === floor.LevelName && room.RoomCode === extracted.RoomCode);
          if (index >= 0) {
            rooms[index] = { ...rooms[index], NetAreaM2: extracted.NetAreaM2, Polygon: extracted.Polygon };
          } else {
            rooms.push({
              ...extracted, SiteId: floor.SiteId, bl_id: floor.bl_id, LevelName: floor.LevelName,
              IsActive: true, IsDeskReservable: false,
            });
          }
        }
        return { ...current, rooms };
      });
      setMessage(`Imported ${parsed.rooms.length} rooms; ${parsed.desks.length} desks extracted.`);
    } catch (error) {
      console.error("CAD upload failed", error);
      setMessage(error instanceof Error ? error.message : "CAD upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer rounded bg-blue-600 px-3 py-2 text-sm text-white">
          Upload DXF
          <input type="file" accept=".dxf" className="hidden" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importCad(file);
          }} />
        </label>
        <button type="button" disabled={busy} onClick={() => void importCad()}
          className="rounded border border-blue-600 px-3 py-2 text-sm text-blue-600 disabled:opacity-50">
          Generate sample DXF
        </button>
      </div>
      {busy && <p className="text-sm">Extracting rooms...</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  );
}

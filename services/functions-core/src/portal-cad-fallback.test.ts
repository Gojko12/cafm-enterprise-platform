import { describe, expect, it } from "vitest";
import { extractSimpleDxf } from "../../../apps/web-portal/lib/cad-dxf-fallback";

function dxf(extra: string[] = []) {
  return Buffer.from([
    "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "8", "RM$", "90", "4", "70", "1",
    "10", "0", "20", "0", "10", "5000", "20", "0",
    "10", "5000", "20", "4000", "10", "0", "20", "4000",
    "0", "TEXT", "8", "ROOM_LABELS", "10", "2500", "20", "2000", "1", "RM-001",
    ...extra, "0", "ENDSEC", "0", "EOF", "",
  ].join("\n"));
}

describe("CAD fallback", () => {
  it("extracts closed room boundaries in metres", () => {
    const result = extractSimpleDxf(dxf());
    expect(result.rooms[0].RoomCode).toBe("RM-001");
    expect(result.rooms[0].NetAreaM2).toBe(20);
    expect(result.rooms[0].Polygon.coordinates[0]).toEqual([
      [0, 0], [5, 0], [5, 4], [0, 4], [0, 0],
    ]);
  });

  it("refuses drawings with unsupported voids rather than returning incorrect areas", () => {
    expect(() => extractSimpleDxf(dxf(["0", "LWPOLYLINE", "8", "COLUMNS"]))).toThrow("voids and desks");
  });
});

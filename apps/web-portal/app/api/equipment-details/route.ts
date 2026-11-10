import { NextResponse } from "next/server";
import { GET as readState } from "../cafm-state/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Rec = Record<string, unknown>;

const allowedOrigins = new Set(["http://localhost:3000", "http://localhost:3001"]);
function cors(request: Request) {
  const origin = request.headers.get("origin");
  let allowed = false;
  if (origin) {
    if (allowedOrigins.has(origin)) allowed = true;
    else {
      try {
        const host = new URL(origin);
        const own = [new URL(request.url).host, request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()].filter(Boolean);
        allowed = own.includes(host.host) || host.hostname === "localhost" || host.hostname === "127.0.0.1" || host.hostname.endsWith(".onrender.com") || host.hostname.endsWith(".vercel.app");
      } catch { allowed = false; }
    }
  }
  return {
    ...(origin && allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CAFM-Site-Id, X-CAFM-Person",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function reply(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: cors(request) });
}

const str = (value: unknown) => (typeof value === "string" ? value : undefined);

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const equipmentCode = url.searchParams.get("equipmentCode")?.trim();
  if (!equipmentCode) return reply(request, { error: "equipmentCode is required." }, 400);

  const upstream = await readState(request);
  if (!upstream.ok) return reply(request, { error: "Could not read the CAFM state." }, upstream.status);
  const { state } = (await upstream.json()) as { state: Rec | null };
  if (!state) return reply(request, { error: "No state has been synchronized for this site." }, 404);

  const list = (key: string) => (Array.isArray(state[key]) ? (state[key] as Rec[]) : []);
  const asset = list("equipment").find((item) => item.EquipmentCode === equipmentCode);
  if (!asset) return reply(request, { error: `Equipment ${equipmentCode} was not found.` }, 404);

  const spec = (asset.TechnicalSpecifications ?? {}) as Rec;
  const children = list("equipment").filter((item) => item.ParentEquipmentCode === equipmentCode)
    .map((item) => ({ EquipmentCode: item.EquipmentCode, EquipmentName: item.EquipmentName, HierarchyLevel: item.HierarchyLevel }));
  const parent = list("equipment").find((item) => item.EquipmentCode === asset.ParentEquipmentCode);
  const findings = list("auditFindings").filter((item) => item.equipmentId === equipmentCode)
    .sort((a, b) => String(b.discoveredAt).localeCompare(String(a.discoveredAt)));
  const inspections = (((state.auditAssurance as Rec | undefined)?.equipmentInspections as Rec[] | undefined) ?? [])
    .filter((sheet) => sheet.equipmentId === equipmentCode)
    .sort((a, b) => String(b.inspectedAt).localeCompare(String(a.inspectedAt)));
  const latestFinding = findings[0];
  const latestSheet = inspections[0];

  const installed = str(asset.InstallationDate);
  const warranty = str(asset.WarrantyExpiryDate);
  const system = latestSheet?.systemName ?? latestFinding?.systemName ?? null;
  const specs = {
    category: asset.Category ?? null,
    hierarchyLevel: asset.HierarchyLevel ?? null,
    status: asset.Status ?? null,
    manufacturer: asset.Manufacturer ?? null,
    model: asset.Model ?? null,
    serialNumber: asset.SerialNumber ?? null,
    installYear: installed ? new Date(installed).getUTCFullYear() || null : null,
    warrantyExpiry: warranty ?? null,
    warrantyActive: warranty ? Date.parse(warranty) > Date.now() : null,
    criticality: asset.Criticality ?? null,
    primaryTrade: asset.PrimaryTradeId ?? null,
    classification: { standardId: asset.EquipmentStandardId ?? null, standard: asset.EquipmentStandardDescription ?? null, system },
    parent: parent ? { EquipmentCode: parent.EquipmentCode, EquipmentName: parent.EquipmentName } : null,
    children,
    technical: spec,
    sophia: latestFinding || latestSheet ? {
      conditionScore: latestFinding?.conditionScore ?? null,
      urgency: latestFinding?.urgency ?? null,
      checkpoint: latestFinding?.checkpointName ?? null,
      summary: latestFinding?.observation ?? null,
      lastInspectedAt: latestSheet?.inspectedAt ?? latestFinding?.discoveredAt ?? null,
      operationalStatus: latestSheet?.operationalStatus ?? latestFinding?.operationalStatus ?? null,
    } : null,
  };

  const stored = Array.isArray(asset.Documents) ? (asset.Documents as Rec[]) : [];
  const documents = [
    ...stored.map((doc) => ({ id: String(doc.id), name: String(doc.name), type: String(doc.type), source: "uploaded", url: str(doc.dataUrl) ?? null })),
    ...(str(asset.DocumentationUrl) ? [{ id: "doc-url", name: "Manufacturer documentation", type: "link", source: "link", url: str(asset.DocumentationUrl) ?? null }] : []),
    ...["O&M Manual (PDF)", "Electrical Schematic", "Commissioning / Safety Certificate", "Inspection Datasheet"].map((name, index) => ({
      id: `${equipmentCode}-doc-${index + 1}`, name, type: "pdf", source: "register", url: null as string | null,
    })),
  ];

  const room = list("rooms").find((item) => item.bl_id === asset.bl_id && item.LevelName === asset.LevelName && item.RoomCode === asset.RoomCode);
  const floorRooms = list("rooms").filter((item) => item.bl_id === asset.bl_id && item.LevelName === asset.LevelName);
  const floorPlan = {
    bl_id: asset.bl_id,
    LevelName: asset.LevelName,
    highlightRoomCode: asset.RoomCode,
    rooms: floorRooms.map((item) => ({ RoomCode: item.RoomCode, RoomName: item.RoomName ?? null, NetAreaM2: item.NetAreaM2 ?? null, Polygon: item.Polygon ?? null })),
    pin: room?.Polygon ? centroid(room.Polygon as Rec) : null,
    assetsOnFloor: list("equipment").filter((item) => item.bl_id === asset.bl_id && item.LevelName === asset.LevelName).length,
  };

  const floor = list("floors").find((item) => item.bl_id === asset.bl_id && item.LevelName === asset.LevelName);
  const elevation = floor?.ElevationM ?? floor?.Elevation;
  const bim = {
    ifcGlobalId: asset.BIM_GlobalId ?? null,
    ifcClass: ifcClass(String(asset.Category ?? "")),
    discipline: asset.PrimaryTradeId ?? null,
    elevation: typeof elevation === "number" ? elevation : null,
    dimensionsCm: { length: asset.LengthCm ?? null, width: asset.WidthCm ?? null, height: asset.HeightCm ?? null },
    weightKg: asset.WeightKg ?? null,
    systemLoop: system ?? parent?.EquipmentName ?? null,
    room: { RoomCode: asset.RoomCode, NetAreaM2: room?.NetAreaM2 ?? null, Polygon: room?.Polygon ?? null },
  };

  return reply(request, {
    equipmentCode,
    siteId: asset.SiteId,
    generatedAt: new Date().toISOString(),
    specs, documents, floorPlan, bim,
  });
}

function centroid(polygon: Rec): { x: number; y: number } | null {
  const ring = (polygon.coordinates as number[][][] | undefined)?.[0] ?? [];
  if (!ring.length) return null;
  return { x: ring.reduce((sum, point) => sum + point[0], 0) / ring.length, y: ring.reduce((sum, point) => sum + point[1], 0) / ring.length };
}

function ifcClass(category: string): string {
  const name = category.toLowerCase();
  if (/hvac|air|ahu|vent/.test(name)) return "IfcUnitaryEquipment";
  if (/electr|power|distribution/.test(name)) return "IfcElectricDistributionBoard";
  if (/pump/.test(name)) return "IfcPump";
  if (/fire|safety/.test(name)) return "IfcFireSuppressionTerminal";
  if (/light/.test(name)) return "IfcLightFixture";
  if (/lift|elevator/.test(name)) return "IfcTransportElement";
  return "IfcBuildingElementProxy";
}

type Point = [number, number];
type Pair = { code: number; value: string };
type Entity = { type: string; fields: Pair[] };

function contains(ring: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonArea(ring: Point[]): number {
  return Math.abs(ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

function validateSimpleRing(ring: Point[]) {
  const orientation = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const overlaps = (a: Point, b: Point, c: Point, d: Point) => {
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    if (abC === 0 || abD === 0 || cdA === 0 || cdB === 0) {
      return Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <= Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
        Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <= Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]));
    }
    return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
  };
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
      if (overlaps(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) {
        throw new Error("Self-intersecting room boundaries are not supported.");
      }
    }
  }
}

export function extractSimpleDxf(bytes: Buffer) {
  const text = bytes.toString("utf8");
  if (text.includes("\0")) throw new Error("Binary DXF is not supported by the fallback parser.");
  const lines = text.split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) throw new Error("Invalid ASCII DXF group code.");
    pairs.push({ code, value: lines[i + 1].trim() });
  }
  const unitsIndex = pairs.findIndex((pair) => pair.code === 9 && pair.value === "$INSUNITS");
  const units = unitsIndex >= 0 ? Number(pairs[unitsIndex + 1]?.value) : 0;
  const scale = new Map([[2, 0.3048], [4, 0.001], [5, 0.01], [6, 1]]).get(units);
  if (!scale) throw new Error("DXF drawing units are missing or unsupported.");
  const entities: Entity[] = [];
  let inEntities = false;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === "SECTION" && pairs[i + 1]?.value === "ENTITIES") inEntities = true;
    else if (pairs[i].code === 0 && pairs[i].value === "ENDSEC") inEntities = false;
    else if (inEntities && pairs[i].code === 0 && pairs[i].value !== "SECTION") {
      const entity: Entity = { type: pairs[i].value, fields: [] };
      while (i + 1 < pairs.length && pairs[i + 1].code !== 0) entity.fields.push(pairs[++i]);
      entities.push(entity);
    }
  }
  const field = (entity: Entity, code: number) => entity.fields.find((item) => item.code === code)?.value;
  const labels = entities.filter((entity) => entity.type === "TEXT" && ["ROOM_LABELS", "TEXT", "0"].includes(field(entity, 8) ?? "0"))
    .map((entity) => ({
      name: field(entity, 1)?.toUpperCase() ?? "",
      point: [Number(field(entity, 10)) * scale, Number(field(entity, 20)) * scale] as Point,
    }));
  const boundaryLayers = ["RM$", "A-AREA-BOUNDARY", "ROOM_POLYGONS", "BOUNDARIES"];
  const unsupportedLayers = ["VOIDS", "COLUMNS", "SHAFTS", "DESKS", "FURNITURE", "A-FURN-DESK"];
  if (entities.some((entity) => unsupportedLayers.includes(field(entity, 8) ?? ""))) {
    throw new Error("DXF voids and desks require the Python CAD parser.");
  }
  const boundaries = entities.filter((entity) => boundaryLayers.includes(field(entity, 8) ?? ""));
  if (boundaries.some((entity) => entity.type !== "LWPOLYLINE")) {
    throw new Error("Only LWPOLYLINE room boundaries are supported by the fallback parser.");
  }
  const rooms = boundaries.map((entity, index) => {
    if (!(Number(field(entity, 70) ?? 0) & 1)) throw new Error("Room boundaries must be closed.");
    if (entity.fields.some((item) => item.code === 42 && Number(item.value) !== 0)) throw new Error("Curved boundaries require the Python CAD parser.");
    const xs = entity.fields.filter((item) => item.code === 10).map((item) => Number(item.value) * scale);
    const ys = entity.fields.filter((item) => item.code === 20).map((item) => Number(item.value) * scale);
    if (xs.length < 3 || xs.length !== ys.length || !xs.every(Number.isFinite) || !ys.every(Number.isFinite)) {
      throw new Error("Invalid LWPOLYLINE coordinates.");
    }
    if (xs.length > 2000) throw new Error("Room boundary is too complex for the fallback parser.");
    const ring: Point[] = xs.map((x, i) => [x, ys[i]]);
    if (ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
    validateSimpleRing(ring);
    const area = polygonArea(ring);
    if (!area) throw new Error("Room boundary has zero area.");
    const matched = labels.filter((label) => contains(ring, label.point));
    if (matched.length > 1) throw new Error("Multiple room labels found inside a boundary.");
    const RoomCode = matched[0]?.name || `ROOM-${String(index + 1).padStart(3, "0")}`;
    ring.push(ring[0]);
    return { RoomCode, Name: RoomCode, NetAreaM2: Math.round(area * 100) / 100, Polygon: { type: "Polygon", coordinates: [ring] } };
  });
  if (!rooms.length) throw new Error("No room boundaries found on the configured layers.");
  if (new Set(rooms.map((room) => room.RoomCode)).size !== rooms.length) throw new Error("Duplicate room codes.");
  return {
    rooms,
    geojson: { type: "FeatureCollection", features: rooms.map((room) => ({
      type: "Feature", properties: { room_code: room.RoomCode, net_area_m2: room.NetAreaM2 }, geometry: room.Polygon,
    })) },
    desks: [],
    unmatchedDesks: [],
    units,
    engine: "typescript-fallback",
  };
}

export const EQ_DETAIL_CACHE_KEY = "cafm_eq_detail_lru_v1";
export const EQ_DETAIL_MAX_ITEMS = 25;
export const EQ_DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface EquipmentDetailPack {
  equipmentCode: string;
  siteId: string;
  generatedAt: string;
  specs: {
    category: string | null; hierarchyLevel: string | null; status: string | null; manufacturer: string | null;
    model: string | null; serialNumber: string | null; installYear: number | null; warrantyExpiry: string | null;
    warrantyActive: boolean | null; criticality: string | null; primaryTrade: string | null;
    classification: { standardId: string | null; standard: string | null; system: string | null };
    parent: { EquipmentCode: string; EquipmentName: string } | null;
    children: { EquipmentCode: string; EquipmentName: string; HierarchyLevel?: string }[];
    technical: Record<string, unknown>;
    sophia: { conditionScore: string | null; urgency: string | null; checkpoint: string | null; summary: string | null; lastInspectedAt: string | null; operationalStatus: string | null } | null;
  };
  documents: { id: string; name: string; type: string; source: string; url: string | null }[];
  floorPlan: {
    bl_id: string; LevelName: string; highlightRoomCode: string; assetsOnFloor: number; pin: { x: number; y: number } | null;
    rooms: { RoomCode: string; RoomName: string | null; NetAreaM2: number | null; Polygon: { type: "Polygon"; coordinates: number[][][] } | null }[];
  };
  bim: {
    ifcGlobalId: string | null; ifcClass: string; discipline: string | null; elevation: number | null;
    dimensionsCm: { length: number | null; width: number | null; height: number | null };
    weightKg: number | null; systemLoop: string | null;
    room: { RoomCode: string; NetAreaM2: number | null; Polygon: { type: "Polygon"; coordinates: number[][][] } | null };
  };
}

interface CacheEntry { key: string; savedAt: number; pack: EquipmentDetailPack }

const cacheKey = (siteId: string, code: string) => `${siteId}:${code}`;

function readCache(): CacheEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EQ_DETAIL_CACHE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as CacheEntry[]).filter((entry) => entry && typeof entry.key === "string" && typeof entry.savedAt === "number") : [];
  } catch {
    return [];
  }
}

function writeCache(entries: CacheEntry[]) {
  let list = entries;
  while (list.length) {
    try {
      localStorage.setItem(EQ_DETAIL_CACHE_KEY, JSON.stringify(list));
      return;
    } catch {
      list = list.slice(1);
    }
  }
  localStorage.removeItem(EQ_DETAIL_CACHE_KEY);
}

// Entries are ordered least- to most-recently used; reading refreshes recency but not the TTL.
export function getCachedEquipmentDetails(siteId: string, code: string): { pack: EquipmentDetailPack; savedAt: number } | null {
  const now = Date.now();
  const entries = readCache().filter((entry) => now - entry.savedAt < EQ_DETAIL_TTL_MS);
  const key = cacheKey(siteId, code);
  const hit = entries.find((entry) => entry.key === key);
  if (!hit) return null;
  writeCache([...entries.filter((entry) => entry !== hit), hit]);
  return { pack: hit.pack, savedAt: hit.savedAt };
}

function storeEquipmentDetails(siteId: string, code: string, pack: EquipmentDetailPack) {
  const now = Date.now();
  const key = cacheKey(siteId, code);
  const entries = readCache().filter((entry) => entry.key !== key && now - entry.savedAt < EQ_DETAIL_TTL_MS);
  writeCache([...entries, { key, savedAt: now, pack }].slice(-EQ_DETAIL_MAX_ITEMS));
}

function endpoint(siteId: string, code: string) {
  const override = localStorage.getItem("cafm_api_base_url")?.trim() || import.meta.env.VITE_API_BASE_URL?.trim();
  const query = `siteId=${encodeURIComponent(siteId)}&equipmentCode=${encodeURIComponent(code)}`;
  const base = override ? new URL(override, window.location.origin).href.replace(/\/+$/, "") : "";
  return `${base}/api/equipment-details?${query}`;
}

async function fetchPack(url: string, siteId: string): Promise<Response> {
  const token = import.meta.env.VITE_CAFM_SYNC_TOKEN;
  return fetch(url, {
    headers: { "X-CAFM-Site-Id": siteId, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
}

export async function loadEquipmentDetails(siteId: string, code: string): Promise<{ pack: EquipmentDetailPack; cached: boolean; savedAt: number }> {
  const cached = getCachedEquipmentDetails(siteId, code);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (cached && offline) return { ...cached, cached: true };
  try {
    let response = await fetchPack(endpoint(siteId, code), siteId);
    const local = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port !== "3000";
    if (response.status === 404 && local && !localStorage.getItem("cafm_api_base_url")) {
      response = await fetchPack(`http://localhost:3000/api/equipment-details?siteId=${encodeURIComponent(siteId)}&equipmentCode=${encodeURIComponent(code)}`, siteId);
    }
    const raw = await response.text();
    if (!raw.trim()) throw new Error(`The portal returned an empty response (HTTP ${response.status}).`);
    const data = JSON.parse(raw) as EquipmentDetailPack & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    storeEquipmentDetails(siteId, code, data);
    return { pack: data, cached: false, savedAt: Date.now() };
  } catch (error) {
    if (cached) return { ...cached, cached: true };
    throw error instanceof Error ? error : new Error("Could not load equipment details.");
  }
}

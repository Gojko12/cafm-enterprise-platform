import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedOrigins = new Set(["http://localhost:3000", "http://localhost:3001"]);
function cors(request: Request) {
  const origin = request.headers.get("origin");
  return {
    ...(origin && allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CAFM-Site-Id, X-CAFM-Person",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}
const siteSchema = z.enum(["SITE-01", "SITE-02", "SITE-03"]);
const records = z.array(z.record(z.string(), z.unknown()));
const stateSchema = z.object({
  sites: z.array(z.string().min(1)),
  buildings: records,
  floors: records,
  rooms: records,
  desks: records,
  equipment: records,
  blueprints: records,
  schedules: records,
  craftspeople: records,
  siteRoleAssignments: records,
  workRequests: records,
  users: records,
  tradeRoleMappings: records,
  siteRoleMappings: records,
  mobileMutationIds: z.array(z.string().min(1)).optional(),
}).strict();
const payloadSchema = z.object({ revision: z.number().int().nonnegative(), state: stateSchema });
const envelopeSchema = z.object({ revision: z.number().int().positive(), state: stateSchema });
const databaseSchema = z.object({
  sites: z.partialRecord(siteSchema, envelopeSchema),
});
const directory = path.join(process.cwd(), ".data");
const filename = path.join(directory, "cafm-db.json");
const lockFile = path.join(directory, "cafm-db.lock");
const maxBytes = 32 * 1024 * 1024;

function reply(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: cors(request) });
}

function scope(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return null;
  const header = request.headers.get("x-cafm-site-id");
  const query = new URL(request.url).searchParams.get("siteId");
  if (header && query && header !== query) return null;
  const site = siteSchema.safeParse(header ?? query);
  return site.success ? site.data : null;
}

function validateSite(state: z.infer<typeof stateSchema>, site: string) {
  if (state.sites.length !== 1 || state.sites[0] !== site) return false;
  const scoped = ["buildings", "floors", "rooms", "desks", "equipment", "schedules", "craftspeople", "siteRoleAssignments", "workRequests", "tradeRoleMappings", "siteRoleMappings"] as const;
  if (scoped.some((key) => state[key].some((item) => item.SiteId !== site))) return false;
  if (state.blueprints.some((item) => item.SiteId !== undefined && item.SiteId !== site)) return false;
  if (state.users.some((user) => !Array.isArray(user.AssignedSiteIds) || user.AssignedSiteIds.length !== 1 || user.AssignedSiteIds[0] !== site)) return false;
  return true;
}

function authorize(request: Request) {
  const localDevelopment = process.env.NODE_ENV === "development" && new URL(request.url).hostname === "localhost";
  const expected = process.env.CAFM_SYNC_TOKEN || (localDevelopment ? "cafm-local-development-sync-token-2026" : undefined);
  if (!expected || expected.length < 32) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function load() {
  try {
    return databaseSchema.parse(JSON.parse(await readFile(filename, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { sites: {} };
    }
    throw error;
  }
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) return new Response(null, { status: 403, headers: cors(request) });
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request) {
  const site = scope(request);
  if (!site) return reply(request, { error: "A valid site and allowed origin are required." }, 400);
  if (!authorize(request)) return reply(request, { error: "Local demo sync is disabled or the token is invalid." }, 401);
  try {
    const data = await load();
    return reply(request, data.sites[site] ?? { revision: 0, state: null });
  } catch (error) {
    console.error("Could not read CAFM state", error);
    return reply(request, { error: "Could not read the persisted CAFM state." }, 500);
  }
}

export async function POST(request: Request) {
  const site = scope(request);
  if (!site) return reply(request, { error: "A valid site and allowed origin are required." }, 400);
  if (!authorize(request)) return reply(request, { error: "Local demo sync is disabled or the token is invalid." }, 401);
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  let temporary: string | undefined;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > maxBytes) return reply(request, { error: "State exceeds 32 MB." }, 413);
    let json: unknown;
    try { json = JSON.parse(text); } catch { return reply(request, { error: "Invalid JSON." }, 400); }
    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) return reply(request, { error: "Invalid state or revision.", details: parsed.error.issues }, 400);
    if (!validateSite(parsed.data.state, site)) return reply(request, { error: "State contains records from another site." }, 400);
    await mkdir(directory, { recursive: true });
    try {
      lock = await open(lockFile, "wx", 0o600);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        return reply(request, { error: "Another state write is in progress." }, 503);
      }
      throw error;
    }
    const database = await load();
    const current = database.sites[site];
    if (parsed.data.revision !== (current?.revision ?? 0)) {
      return reply(request, { error: "State has changed; reload and resolve the conflict.", revision: current?.revision ?? 0 }, 409);
    }
    const next = { revision: (current?.revision ?? 0) + 1, state: parsed.data.state };
    database.sites[site] = next;
    temporary = path.join(directory, `cafm-db-${randomUUID()}.tmp`);
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(database), "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, filename);
    temporary = undefined;
    return reply(request, next);
  } catch (error) {
    console.error("Could not persist CAFM state", error);
    return reply(request, { error: "Could not persist the CAFM state." }, 500);
  } finally {
    if (temporary) await unlink(temporary).catch((error) => console.error("Could not remove temporary state file", error));
    if (lock) {
      await lock.close();
      await unlink(lockFile);
    }
  }
}

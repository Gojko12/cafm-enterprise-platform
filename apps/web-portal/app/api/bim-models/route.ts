import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertMarkInStepText } from "@/lib/ifc-step-mark";
import { LEGACY_SITE_ALIAS, normalizeSiteId } from "@cafm/shared-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Direct in-app uploads may be raw `.ifc` or client-gzipped `.ifc.gz` up to 200MB. */
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Identifiers may only contain letters, digits, dashes, and underscores.");
// Legacy SITE-0x identifiers resolve to the official platform site IDs.
const siteIdSchema = idSchema.transform((value) => normalizeSiteId(value) ?? value);
function siteAliases(siteId: string): string[] {
  const legacy = LEGACY_SITE_ALIAS[siteId];
  return legacy ? [siteId, legacy] : [siteId];
}
const uploadSchema = z.object({
  siteId: siteIdSchema,
  buildingId: idSchema,
  fileName: z.string().trim().min(1).max(260).optional(),
  content: z.string().min(1).max(MAX_UPLOAD_BYTES),
});
const patchSchema = z.object({
  siteId: siteIdSchema,
  buildingId: idSchema,
  ifcGlobalId: z.string().trim().min(1).max(64),
  expressId: z.number().int().nonnegative().optional(),
  // An empty code clears the Mark (unassign).
  equipmentCode: z.string().trim().max(64),
});

function storageDirectory() {
  return path.join(process.cwd(), ".data", "bim");
}

function bundledDirectory() {
  return path.join(process.cwd(), "public", "bim");
}

function storedModelPath(siteId: string, buildingId: string, compressed: boolean) {
  return path.join(storageDirectory(), `${siteId}__${buildingId}.ifc${compressed ? ".gz" : ""}`);
}

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Reads the gzip ISIZE footer (uncompressed size modulo 2^32) without inflating. */
function gzipUncompressedBytes(bytes: Buffer): number | undefined {
  if (bytes.length < 4) return undefined;
  return bytes.readUInt32LE(bytes.length - 4);
}

interface BimModelMetadata {
  siteId: string;
  buildingId: string;
  fileName: string;
  updatedAt: string;
  sizeBytes: number;
  uncompressedBytes?: number;
  compressed: boolean;
  source: "uploaded" | "bundled";
}

interface ResolvedModelFile {
  filePath: string;
  compressed: boolean;
  source: "uploaded" | "bundled";
}

function parseModelFileName(entry: string): { baseName: string; compressed: boolean } | null {
  if (entry.endsWith(".ifc.gz")) return { baseName: entry.slice(0, -7), compressed: true };
  if (entry.endsWith(".ifc")) return { baseName: entry.slice(0, -4), compressed: false };
  return null;
}

async function safeReadDir(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function describe(filePath: string, base: Omit<BimModelMetadata, "updatedAt" | "sizeBytes" | "uncompressedBytes">): Promise<BimModelMetadata> {
  const info = await stat(filePath);
  let uncompressedBytes: number | undefined;
  if (base.compressed) {
    const content = await readFile(filePath);
    uncompressedBytes = gzipUncompressedBytes(content);
  }
  return { ...base, updatedAt: info.mtime.toISOString(), sizeBytes: info.size, uncompressedBytes };
}

/** Lists uploaded site models plus every bundled model in public/bim (*.ifc and *.ifc.gz). */
async function listModels(siteId: string): Promise<BimModelMetadata[]> {
  const models = new Map<string, BimModelMetadata>();
  // Bundled defaults first; site uploads override them below.
  for (const entry of await safeReadDir(bundledDirectory())) {
    const parsed = parseModelFileName(entry);
    if (!parsed || !idSchema.safeParse(parsed.baseName).success) continue;
    const existing = models.get(parsed.baseName);
    if (existing && !existing.compressed) continue; // plain .ifc beats .ifc.gz for the same id
    models.set(parsed.baseName, await describe(path.join(bundledDirectory(), entry), {
      siteId, buildingId: parsed.baseName, fileName: entry, compressed: parsed.compressed, source: "bundled",
    }));
  }
  for (const alias of siteAliases(siteId)) {
  const prefix = `${alias}__`;
  for (const entry of await safeReadDir(storageDirectory())) {
    if (!entry.startsWith(prefix)) continue;
    const parsed = parseModelFileName(entry.slice(prefix.length));
    if (!parsed || !idSchema.safeParse(parsed.baseName).success) continue;
    const existing = models.get(parsed.baseName);
    if (existing?.source === "uploaded" && existing.compressed && !parsed.compressed) continue;
    models.set(parsed.baseName, await describe(path.join(storageDirectory(), entry), {
      siteId, buildingId: parsed.baseName, fileName: entry, compressed: parsed.compressed, source: "uploaded",
    }));
  }
  }
  return [...models.values()].sort((a, b) => a.buildingId.localeCompare(b.buildingId));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function resolveModelFile(siteId: string, buildingId: string): Promise<ResolvedModelFile | null> {
  const candidates: ResolvedModelFile[] = [
    ...siteAliases(siteId).flatMap((alias) => [
      { filePath: storedModelPath(alias, buildingId, true), compressed: true, source: "uploaded" as const },
      { filePath: storedModelPath(alias, buildingId, false), compressed: false, source: "uploaded" as const },
    ]),
    { filePath: path.join(bundledDirectory(), `${buildingId}.ifc`), compressed: false, source: "bundled" },
    { filePath: path.join(bundledDirectory(), `${buildingId}.ifc.gz`), compressed: true, source: "bundled" },
  ];
  for (const candidate of candidates) {
    if (await exists(candidate.filePath)) return candidate;
  }
  return null;
}

/** Persists the model as compressed `.ifc.gz` (atomic replace), dropping stale plain copies. */
async function saveCompressedModel(siteId: string, buildingId: string, gzBytes: Buffer | Uint8Array) {
  await mkdir(storageDirectory(), { recursive: true });
  const destination = storedModelPath(siteId, buildingId, true);
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, gzBytes);
  await rename(temporary, destination);
  const legacyPlain = storedModelPath(siteId, buildingId, false);
  if (await exists(legacyPlain)) await unlink(legacyPlain).catch(() => undefined);
  const info = await stat(destination);
  return { updatedAt: info.mtime.toISOString(), sizeBytes: info.size };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siteId = siteIdSchema.safeParse(url.searchParams.get("siteId") ?? "02-ESOC");
  if (!siteId.success) return reply({ error: "Invalid siteId." }, 400);
  const buildingParam = url.searchParams.get("buildingId");
  try {
    if (!buildingParam) return reply({ models: await listModels(siteId.data) });
    const buildingId = idSchema.safeParse(buildingParam);
    if (!buildingId.success) return reply({ error: "Invalid buildingId." }, 400);
    const resolved = await resolveModelFile(siteId.data, buildingId.data);
    if (!resolved) return reply({ error: `No .ifc model is stored for ${buildingId.data}.` }, 404);
    const info = await stat(resolved.filePath);
    if (url.searchParams.get("download") !== "1") {
      const content = resolved.compressed ? await readFile(resolved.filePath) : null;
      return reply({ model: {
        siteId: siteId.data, buildingId: buildingId.data, fileName: path.basename(resolved.filePath),
        updatedAt: info.mtime.toISOString(), sizeBytes: info.size, compressed: resolved.compressed,
        uncompressedBytes: content ? gzipUncompressedBytes(content) : info.size, source: resolved.source,
      } });
    }
    const content = await readFile(resolved.filePath);
    // `rawIfc=1` / `gunzip=1` always deliver a standard uncompressed .ifc (used by the
    // "Download .IFC (with EQ IDs)" button and as a DecompressionStream fallback).
    const wantRaw = url.searchParams.get("rawIfc") === "1" || url.searchParams.get("gunzip") === "1";
    const sendCompressed = resolved.compressed && !wantRaw;
    const body = resolved.compressed && wantRaw ? gunzipSync(content) : content;
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": sendCompressed ? "application/gzip" : "application/x-step; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildingId.data}.ifc${sendCompressed ? ".gz" : ""}"`,
        "Cache-Control": "no-store",
        "X-BIM-Source": resolved.source,
        "X-BIM-Updated-At": info.mtime.toISOString(),
        ...(sendCompressed ? {
          "X-BIM-Compressed": "gzip",
          ...(gzipUncompressedBytes(content) !== undefined ? { "X-BIM-Uncompressed-Bytes": String(gzipUncompressedBytes(content)) } : {}),
        } : {}),
      },
    });
  } catch (error) {
    console.error("Could not read the BIM model storage", error);
    return reply({ error: "Could not read the BIM model storage." }, 500);
  }
}

interface NormalizedUpload {
  siteId: string;
  buildingId: string;
  bytes: Uint8Array;
}

async function parseUpload(request: Request): Promise<NormalizedUpload | { error: string; status: number }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const siteId = siteIdSchema.safeParse(form.get("siteId"));
    const buildingId = idSchema.safeParse(form.get("buildingId"));
    const file = form.get("file");
    if (!siteId.success || !buildingId.success) return { error: "Provide valid siteId and buildingId fields.", status: 400 };
    if (!(file instanceof Blob)) return { error: "Provide the .ifc or .ifc.gz file as the 'file' form field.", status: 400 };
    if (file.size > MAX_UPLOAD_BYTES) return { error: "The upload exceeds the 200MB limit.", status: 413 };
    return { siteId: siteId.data, buildingId: buildingId.data, bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  let payload: z.infer<typeof uploadSchema>;
  try {
    payload = uploadSchema.parse(await request.json());
  } catch {
    return { error: "Invalid upload payload. Provide siteId, buildingId, and the .ifc file content.", status: 400 };
  }
  return { siteId: payload.siteId, buildingId: payload.buildingId, bytes: new TextEncoder().encode(payload.content) };
}

export async function POST(request: Request) {
  try {
    const upload = await parseUpload(request);
    if ("error" in upload) return reply({ error: upload.error }, upload.status);
    const gzUpload = isGzipBytes(upload.bytes);
    const stepBytes = gzUpload ? gunzipSync(upload.bytes) : upload.bytes;
    const header = Buffer.from(stepBytes.slice(0, 64)).toString("utf8").trimStart();
    if (!header.startsWith("ISO-10303-21")) {
      return reply({ error: "The uploaded file is not a valid IFC STEP (ISO-10303-21) file." }, 422);
    }
    // Always persist compressed to keep server disk usage small.
    const gzBytes = gzUpload ? upload.bytes : gzipSync(stepBytes, { level: 6 });
    const saved = await saveCompressedModel(upload.siteId, upload.buildingId, gzBytes);
    return reply({ ok: true, model: {
      siteId: upload.siteId, buildingId: upload.buildingId,
      fileName: `${upload.siteId}__${upload.buildingId}.ifc.gz`,
      ...saved, uncompressedBytes: stepBytes.length, compressed: true, source: "uploaded" as const,
    } });
  } catch (error) {
    console.error("Could not persist the BIM model", error);
    return reply({ error: "Could not persist the uploaded .ifc model." }, 500);
  }
}

export async function PATCH(request: Request) {
  let payload: z.infer<typeof patchSchema>;
  try {
    payload = patchSchema.parse(await request.json());
  } catch {
    return reply({ error: "Invalid payload. Provide siteId, buildingId, ifcGlobalId, and equipmentCode." }, 400);
  }
  try {
    const resolved = await resolveModelFile(payload.siteId, payload.buildingId);
    if (!resolved) return reply({ error: `No .ifc model is stored for ${payload.buildingId}.` }, 404);
    const content = await readFile(resolved.filePath);
    const stepText = (resolved.compressed ? gunzipSync(content) : content).toString("utf8");
    const { text, action } = upsertMarkInStepText(stepText, {
      ifcGlobalId: payload.ifcGlobalId,
      expressId: payload.expressId,
      equipmentCode: payload.equipmentCode,
    });
    // Copy-on-write: patched models (bundled or uploaded) persist as compressed site overrides.
    const saved = await saveCompressedModel(payload.siteId, payload.buildingId, gzipSync(Buffer.from(text, "utf8"), { level: 6 }));
    return reply({ ok: true, action, ...saved });
  } catch (error) {
    if (error instanceof Error && error.message.includes("was not found in the model")) return reply({ error: error.message }, 404);
    console.error("Could not write the Mark assignment into the .ifc model", error);
    return reply({ error: "Could not write the Equipment ID into the .ifc model." }, 500);
  }
}

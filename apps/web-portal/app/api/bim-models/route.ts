import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertMarkInStepText } from "@/lib/ifc-step-mark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IFC_BYTES = 128 * 1024 * 1024;
const BUNDLED_BUILDING_ID = "S01-BL-1";
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Identifiers may only contain letters, digits, dashes, and underscores.");
const uploadSchema = z.object({
  siteId: idSchema,
  buildingId: idSchema,
  fileName: z.string().trim().min(1).max(260).optional(),
  content: z.string().min(1).max(MAX_IFC_BYTES),
});
const patchSchema = z.object({
  siteId: idSchema,
  buildingId: idSchema,
  ifcGlobalId: z.string().trim().min(1).max(64),
  expressId: z.number().int().nonnegative().optional(),
  // An empty code clears the Mark (unassign).
  equipmentCode: z.string().trim().max(64),
});

function storageDirectory() {
  return path.join(process.cwd(), ".data", "bim");
}

function bundledModelPath() {
  return path.join(process.cwd(), "public", "bim", `${BUNDLED_BUILDING_ID}.ifc`);
}

function storedModelPath(siteId: string, buildingId: string) {
  return path.join(storageDirectory(), `${siteId}__${buildingId}.ifc`);
}

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

interface BimModelMetadata {
  siteId: string;
  buildingId: string;
  fileName: string;
  updatedAt: string;
  sizeBytes: number;
  source: "uploaded" | "bundled";
}

async function listModels(siteId: string): Promise<BimModelMetadata[]> {
  const models: BimModelMetadata[] = [];
  const prefix = `${siteId}__`;
  try {
    for (const entry of await readdir(storageDirectory())) {
      if (!entry.startsWith(prefix) || !entry.endsWith(".ifc")) continue;
      const buildingId = entry.slice(prefix.length, -4);
      if (!idSchema.safeParse(buildingId).success) continue;
      const info = await stat(path.join(storageDirectory(), entry));
      models.push({ siteId, buildingId, fileName: entry, updatedAt: info.mtime.toISOString(), sizeBytes: info.size, source: "uploaded" });
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  // The demo building ships with the app; expose it whenever no custom override was uploaded.
  if (!models.some((model) => model.buildingId === BUNDLED_BUILDING_ID)) {
    try {
      const info = await stat(bundledModelPath());
      models.push({ siteId, buildingId: BUNDLED_BUILDING_ID, fileName: `${BUNDLED_BUILDING_ID}.ifc`, updatedAt: info.mtime.toISOString(), sizeBytes: info.size, source: "bundled" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return models.sort((a, b) => a.buildingId.localeCompare(b.buildingId));
}

async function resolveModelFile(siteId: string, buildingId: string): Promise<{ filePath: string; source: "uploaded" | "bundled" } | null> {
  const stored = storedModelPath(siteId, buildingId);
  try {
    await stat(stored);
    return { filePath: stored, source: "uploaded" };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  if (buildingId === BUNDLED_BUILDING_ID) {
    try {
      await stat(bundledModelPath());
      return { filePath: bundledModelPath(), source: "bundled" };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return null;
}

async function saveModelAtomically(siteId: string, buildingId: string, content: string) {
  await mkdir(storageDirectory(), { recursive: true });
  const destination = storedModelPath(siteId, buildingId);
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, destination);
  const info = await stat(destination);
  return { updatedAt: info.mtime.toISOString(), sizeBytes: info.size };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siteId = idSchema.safeParse(url.searchParams.get("siteId") ?? "SITE-01");
  if (!siteId.success) return reply({ error: "Invalid siteId." }, 400);
  const buildingParam = url.searchParams.get("buildingId");
  try {
    if (!buildingParam) return reply({ models: await listModels(siteId.data) });
    const buildingId = idSchema.safeParse(buildingParam);
    if (!buildingId.success) return reply({ error: "Invalid buildingId." }, 400);
    const resolved = await resolveModelFile(siteId.data, buildingId.data);
    if (!resolved) return reply({ error: `No .ifc model is stored for ${buildingId.data}.` }, 404);
    if (url.searchParams.get("download") !== "1") {
      const info = await stat(resolved.filePath);
      return reply({ model: { siteId: siteId.data, buildingId: buildingId.data, fileName: path.basename(resolved.filePath), updatedAt: info.mtime.toISOString(), sizeBytes: info.size, source: resolved.source } });
    }
    const content = await readFile(resolved.filePath);
    const info = await stat(resolved.filePath);
    return new Response(new Uint8Array(content), {
      status: 200,
      headers: {
        "Content-Type": "application/x-step; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildingId.data}.ifc"`,
        "Cache-Control": "no-store",
        "X-BIM-Source": resolved.source,
        "X-BIM-Updated-At": info.mtime.toISOString(),
      },
    });
  } catch (error) {
    console.error("Could not read the BIM model storage", error);
    return reply({ error: "Could not read the BIM model storage." }, 500);
  }
}

export async function POST(request: Request) {
  let payload: z.infer<typeof uploadSchema>;
  try {
    payload = uploadSchema.parse(await request.json());
  } catch {
    return reply({ error: "Invalid upload payload. Provide siteId, buildingId, and the .ifc file content." }, 400);
  }
  if (!payload.content.trimStart().startsWith("ISO-10303-21")) {
    return reply({ error: "The uploaded file is not a valid IFC STEP (ISO-10303-21) file." }, 422);
  }
  try {
    const saved = await saveModelAtomically(payload.siteId, payload.buildingId, payload.content);
    return reply({ ok: true, model: { siteId: payload.siteId, buildingId: payload.buildingId, fileName: `${payload.siteId}__${payload.buildingId}.ifc`, ...saved, source: "uploaded" as const } });
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
    const stepText = await readFile(resolved.filePath, "utf8");
    const { text, action } = upsertMarkInStepText(stepText, {
      ifcGlobalId: payload.ifcGlobalId,
      expressId: payload.expressId,
      equipmentCode: payload.equipmentCode,
    });
    // Copy-on-write: patched bundled models are persisted as site-specific overrides.
    const saved = await saveModelAtomically(payload.siteId, payload.buildingId, text);
    return reply({ ok: true, action, ...saved });
  } catch (error) {
    if (error instanceof Error && error.message.includes("was not found in the model")) return reply({ error: error.message }, 404);
    console.error("Could not write the Mark assignment into the .ifc model", error);
    return reply({ error: "Could not write the Equipment ID into the .ifc model." }, 500);
  }
}

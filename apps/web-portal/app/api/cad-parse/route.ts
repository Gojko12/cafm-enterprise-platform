import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { extractSimpleDxf } from "@/lib/cad-dxf-fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const run = promisify(execFile);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const sample = [
  "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LWPOLYLINE", "100", "AcDbEntity", "8", "RM$", "100", "AcDbPolyline", "90", "4", "70", "1",
  "10", "0", "20", "0", "10", "5000", "20", "0",
  "10", "5000", "20", "4000", "10", "0", "20", "4000",
  "0", "TEXT", "100", "AcDbEntity", "8", "ROOM_LABELS", "100", "AcDbText", "10", "2500", "20", "2000", "40", "200", "1", "RM-001",
  "0", "LWPOLYLINE", "100", "AcDbEntity", "8", "RM$", "100", "AcDbPolyline", "90", "4", "70", "1",
  "10", "5000", "20", "0", "10", "9000", "20", "0",
  "10", "9000", "20", "4000", "10", "5000", "20", "4000",
  "0", "TEXT", "100", "AcDbEntity", "8", "ROOM_LABELS", "100", "AcDbText", "10", "7000", "20", "2000", "40", "200", "1", "RM-002",
  "0", "ENDSEC", "0", "EOF", "",
].join("\n");

export async function POST(request: Request) {
  let directory: string | undefined;
  try {
    const type = request.headers.get("content-type") ?? "";
    let bytes: Buffer;
    if (type.includes("application/json")) {
      const body: unknown = await request.json();
      if (!body || typeof body !== "object" || !("generateSample" in body) || body.generateSample !== true) {
        return NextResponse.json({ error: "Expected generateSample: true." }, { status: 400 });
      }
      bytes = Buffer.from(sample);
    } else {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".dxf")) {
        return NextResponse.json({ error: "Select a DXF file." }, { status: 400 });
      }
      if (file.size === 0 || file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "DXF must be between 1 byte and 10 MB." }, { status: 400 });
      }
      bytes = Buffer.from(await file.arrayBuffer());
    }
    const root = path.resolve(process.cwd(), "..", "..", "services", "cad-bim-parser");
    const python = process.env.CAFM_CAD_PYTHON || path.join(root, ".venv", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");
    directory = await mkdtemp(path.join(tmpdir(), "cafm-cad-"));
    const input = path.join(directory, "input.dxf");
    await writeFile(input, bytes);
    try {
      const { stdout } = await run(python, [path.join(root, "src", "portal_extract.py"), input], {
        timeout: 30000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
      return NextResponse.json(JSON.parse(stdout));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return NextResponse.json(extractSimpleDxf(bytes));
      }
      throw error;
    }
  } catch (error) {
    console.error("CAD extraction failed", error);
    const message = error instanceof Error ? error.message : "CAD extraction failed";
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

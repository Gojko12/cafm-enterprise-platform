/**
 * Pure IFC STEP (ISO-10303-21) text helpers for writing CAFM Equipment IDs back
 * into an `.ifc` file as the Revit `Mark` property. No DOM/WASM dependencies, so
 * this module is shared between the `/api/bim-models` server route and the client.
 */

export interface MarkPatch {
  ifcGlobalId: string;
  expressId?: number;
  /** Empty string clears the Mark (unassign). */
  equipmentCode: string;
}

export type MarkWriteAction = "updated" | "appended";

const IFC_GUID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** Generates a spec-compliant 22-character IFC GlobalId from 128 random bits. */
export function newIfcGlobalId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < 16; index++) bytes[index] = Math.floor(Math.random() * 256);
  // First character encodes only 2 bits (the IFC GUID packs 128 bits into 22 base-64 chars).
  bytes[0] &= 0x3f;
  let result = "";
  // Process 128 bits as one big integer in base 64, most significant first.
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  for (let index = 21; index >= 0; index--) {
    result = IFC_GUID_ALPHABET[Number(bits & 63n)] + result;
    bits >>= 6n;
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** STEP strings escape apostrophes by doubling them. */
function escapeStepString(value: string): string {
  return value.replace(/'/g, "''");
}

function findElementExpressId(stepText: string, patch: MarkPatch): number | null {
  const byGlobalId = new RegExp(`#(\\d+)\\s*=\\s*IFC[A-Z0-9_]+\\('${escapeRegExp(patch.ifcGlobalId)}'`);
  const match = byGlobalId.exec(stepText);
  if (match) return Number(match[1]);
  if (patch.expressId !== undefined && new RegExp(`(^|\\n)#${patch.expressId}\\s*=\\s*IFC[A-Z0-9_]+\\(`).test(stepText)) {
    return patch.expressId;
  }
  return null;
}

function collectReferencedIds(argumentText: string): number[] {
  return [...argumentText.matchAll(/#(\d+)/g)].map((entry) => Number(entry[1]));
}

/**
 * Finds the express ID of an existing IFCPROPERTYSINGLEVALUE('Mark',...) attached to
 * the element through any IFCRELDEFINESBYPROPERTIES -> IFCPROPERTYSET chain.
 */
function findExistingMarkPropertyId(stepText: string, elementId: number): number | null {
  const propertySets = new Map<number, number[]>();
  for (const line of stepText.matchAll(/#(\d+)\s*=\s*IFCPROPERTYSET\((.*)\);/g)) {
    const listMatch = /\(([^()]*)\)\s*$/.exec(line[2]);
    if (listMatch) propertySets.set(Number(line[1]), collectReferencedIds(listMatch[1]));
  }
  const markProperties = new Set<number>();
  for (const line of stepText.matchAll(/#(\d+)\s*=\s*IFCPROPERTYSINGLEVALUE\('Mark'/g)) {
    markProperties.add(Number(line[1]));
  }
  for (const line of stepText.matchAll(/#\d+\s*=\s*IFCRELDEFINESBYPROPERTIES\((.*)\);/g)) {
    const tail = /\(([^()]*)\)\s*,\s*#(\d+)\s*$/.exec(line[1]);
    if (!tail) continue;
    const relatedObjects = collectReferencedIds(tail[1]);
    if (!relatedObjects.includes(elementId)) continue;
    const propertyIds = propertySets.get(Number(tail[2])) ?? [];
    const mark = propertyIds.find((id) => markProperties.has(id));
    if (mark !== undefined) return mark;
  }
  return null;
}

function findMaxExpressId(stepText: string): number {
  let max = 0;
  for (const line of stepText.matchAll(/(^|\n)#(\d+)\s*=/g)) {
    const id = Number(line[2]);
    if (id > max) max = id;
  }
  return max;
}

function findOwnerHistoryRef(stepText: string): string {
  const match = /#(\d+)\s*=\s*IFCOWNERHISTORY\(/.exec(stepText);
  return match ? `#${match[1]}` : "$";
}

/**
 * Writes `Mark = equipmentCode` for the element with the given IfcGlobalId directly
 * into the STEP text. Updates the existing Mark IFCPROPERTYSINGLEVALUE when present;
 * otherwise appends a valid IFCPROPERTYSINGLEVALUE + IFCPROPERTYSET ('Identity Data')
 * + IFCRELDEFINESBYPROPERTIES block right before the DATA section's `ENDSEC;` so a
 * re-import of the file preserves every in-app EQ ID assignment.
 */
export function upsertMarkInStepText(stepText: string, patch: MarkPatch): { text: string; action: MarkWriteAction } {
  const elementId = findElementExpressId(stepText, patch);
  if (elementId === null) throw new Error(`IFC element with GlobalId ${patch.ifcGlobalId} was not found in the model.`);
  const value = escapeStepString(patch.equipmentCode);
  const existingMarkId = findExistingMarkPropertyId(stepText, elementId);
  if (existingMarkId !== null) {
    const markLine = new RegExp(`#${existingMarkId}\\s*=\\s*IFCPROPERTYSINGLEVALUE\\([^\\n]*\\);`);
    const replacement = `#${existingMarkId}=IFCPROPERTYSINGLEVALUE('Mark',$,IFCTEXT('${value}'),$);`;
    return { text: stepText.replace(markLine, replacement), action: "updated" };
  }
  const endSecIndex = stepText.lastIndexOf("ENDSEC;");
  if (endSecIndex < 0) throw new Error("The IFC file has no ENDSEC; marker and cannot be patched.");
  const nextId = findMaxExpressId(stepText) + 1;
  const ownerHistory = findOwnerHistoryRef(stepText);
  const block =
    `#${nextId}=IFCPROPERTYSINGLEVALUE('Mark',$,IFCTEXT('${value}'),$);\n` +
    `#${nextId + 1}=IFCPROPERTYSET('${newIfcGlobalId()}',${ownerHistory},'Identity Data',$,(#${nextId}));\n` +
    `#${nextId + 2}=IFCRELDEFINESBYPROPERTIES('${newIfcGlobalId()}',${ownerHistory},$,$,(#${elementId}),#${nextId + 1});\n`;
  return { text: stepText.slice(0, endSecIndex) + block + stepText.slice(endSecIndex), action: "appended" };
}

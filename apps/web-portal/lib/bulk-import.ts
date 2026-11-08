import * as XLSX from "xlsx";
import {
  BuildingSchema, FloorSchema, RoomSchema, EquipmentSchema, PM_ChecklistStandardSchema,
  PM_ScheduleSchema, SiteRoleAssignmentSchema, BaseWorkRequestSchema,
  WR_Statuses,
} from "@cafm/shared-schema";
import type { SiteId } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";

export const entities = {
  buildings: { label: "Buildings", schema: BuildingSchema, keys: ["bl_id"] },
  floors: { label: "Floors", schema: FloorSchema, keys: ["bl_id", "LevelName"] },
  rooms: { label: "Rooms", schema: RoomSchema, keys: ["bl_id", "LevelName", "RoomCode"] },
  equipment: { label: "Equipment", schema: EquipmentSchema, keys: ["EquipmentCode"] },
  blueprints: { label: "PM Checklist Standards", schema: PM_ChecklistStandardSchema, keys: ["ChecklistCode"] },
  schedules: { label: "PM Schedules", schema: PM_ScheduleSchema, keys: ["ScheduleId"] },
  siteRoleAssignments: { label: "Site Role Assignments", schema: SiteRoleAssignmentSchema, keys: ["AssignmentId"] },
  workRequests: { label: "Work Requests", schema: BaseWorkRequestSchema, keys: ["WR_ID"] },
} as const;
export type Entity = keyof typeof entities;
export interface ImportError { row: number; column: string; message: string }
export interface ImportDiff { row: number; code: string; operation: "Insert" | "Update"; changes: { field: string; before: unknown; after: unknown }[] }
export interface Preview { errors: ImportError[]; diffs: ImportDiff[]; next: DemoData }

const numeric = new Set(["FloorNumber", "GrossAreaM2", "NetAreaM2", "ExpectedHours", "Version", "FrequencyInterval", "MeterInterval", "LeadTimeDays", "MarginWindowDays", "TicketSequence", "TotalTimeMinutes", "Percentage", "EstimatedCostEur", "ActualCostEur", "DowntimeMinutes"]);
const boolean = new Set(["IsActive", "IsDeskReservable", "IsInstallation", "ReceiveNotifications", "StartDateTBD", "IsFrozen", "ChecklistCompleted", "PreSATApproved", "RequiresSAT", "RequiresDrawingUpdate", "RequiresInventoryUpdate"]);
const dateOnly = new Set(["CreatedDate", "StartDate", "DueDate", "MarginDate", "NextDueDate", "InstallationDate", "WarrantyExpiryDate"]);
const json = new Set(["GPSCoordinates", "Polygon", "TechnicalSpecifications", "Steps", "EquipmentCodes", "AssignedCraftpersonIds", "AssignedUserIds", "AssignedRoles", "ChecklistSteps", "ChecklistInstances", "StepAuditLogs", "ChecklistHistory", "MobileWorkSessions", "CraftpersonLabor", "timeSessions", "laborEntries", "todoSteps", "CraftpersonAssignments", "SpareParts", "QuotationLines", "Activity", "Attachments", "ChecklistResults", "AcceptanceGates"]);
const columns = (entity: Entity) => Object.keys(entities[entity].schema.shape);

function keyOf(record: object, entity: Entity): string {
  const entries = new Map(Object.entries(record));
  return JSON.stringify(entities[entity].keys.map((key) => entries.get(key)));
}

function rowsFor(data: DemoData, entity: Entity): Record<string, unknown>[] {
  return data[entity].map((record) => ({ ...record }));
}

function replace(data: DemoData, entity: Entity, record: Record<string, unknown>): DemoData {
  const key = keyOf(record, entity);
  const update = <T extends object>(items: T[], item: T): T[] => {
    const index = items.findIndex((value) => keyOf({ ...value }, entity) === key);
    if (index < 0) return [...items, item];
    return items.map((value, i) => i === index ? item : value);
  };
  switch (entity) {
    case "buildings": return { ...data, buildings: update(data.buildings, { ...record, ...BuildingSchema.parse(record) }) };
    case "floors": return { ...data, floors: update(data.floors, { ...record, ...FloorSchema.parse(record) }) };
    case "rooms": return { ...data, rooms: update(data.rooms, { ...record, ...RoomSchema.parse(record) }) };
    case "equipment": return { ...data, equipment: update(data.equipment, { ...record, ...EquipmentSchema.parse(record) }) };
    case "blueprints": return { ...data, blueprints: update(data.blueprints, { ...record, ...PM_ChecklistStandardSchema.parse(record) }) };
    case "schedules": return { ...data, schedules: update(data.schedules, { ...record, ...PM_ScheduleSchema.parse(record) }) };
    case "siteRoleAssignments": return { ...data, siteRoleAssignments: update(data.siteRoleAssignments, { ...record, ...SiteRoleAssignmentSchema.parse(record) }) };
    case "workRequests": return { ...data, workRequests: update(data.workRequests, { ...record, ...BaseWorkRequestSchema.parse(record) }) };
  }
}

function encode(value: unknown): string | number | boolean {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : String(value);
}

function sheet(entity: Entity, data?: DemoData) {
  const fields = columns(entity);
  const rows = data ? rowsFor(data, entity).map((record) => fields.map((field) => encode(record[field]))) : [];
  return XLSX.utils.aoa_to_sheet([fields, ...rows]);
}

export function downloadTemplate(entity: Entity, format: "csv" | "xlsx") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet(entity), entity);
  XLSX.writeFile(workbook, `${entity}-template.${format}`, { bookType: format });
}

export function siteWorkbook(data: DemoData): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  for (const entity of Object.keys(entities) as Entity[]) XLSX.utils.book_append_sheet(workbook, sheet(entity, data), entity);
  for (const key of ["sites", "desks", "users", "craftspeople", "tradeRoleMappings", "siteRoleMappings", "mobileMutationIds"] as const) {
    const records: Record<string, unknown>[] = data[key].map((item) =>
      typeof item === "string" ? { value: item } : { ...item });
    const fields = [...new Set(records.flatMap((record) => Object.keys(record)))];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      fields.length ? fields : ["No records"],
      ...records.map((record) => fields.map((field) => encode(record[field]))),
    ]), key);
  }
  return workbook;
}

export function siteWorkbookBytes(data: DemoData): ArrayBuffer {
  return XLSX.write(siteWorkbook(data), { type: "array", bookType: "xlsx" });
}

export function downloadSite(data: DemoData, site: SiteId, format: "xlsx" | "json" | "csv", entity: Entity) {
  if (format === "json") {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${site}-cafm.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (format === "csv") {
    if (rowsFor(data, entity).some((record) => Object.values(record).some((value) =>
      typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(value)))) {
      throw new Error("CSV export contains spreadsheet formula-like values. Use XLSX or JSON to export safely.");
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet(entity, data), entity);
    XLSX.writeFile(workbook, `${site}-${entity}.csv`, { bookType: "csv" });
    return;
  }
  const url = URL.createObjectURL(new Blob([siteWorkbookBytes(data)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${site}-cafm.xlsx`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function convert(field: string, value: unknown): unknown {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Invalid date.");
    return dateOnly.has(field) ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  if (typeof value !== "string") return value;
  if (json.has(field)) {
    try { return JSON.parse(value); } catch { throw new Error("Expected valid JSON."); }
  }
  if (boolean.has(field)) {
    if (/^(true|yes|1)$/i.test(value)) return true;
    if (/^(false|no|0)$/i.test(value)) return false;
    throw new Error("Expected true/false or yes/no.");
  }
  if (numeric.has(field)) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("Expected a number.");
    return number;
  }
  return value;
}

export function dryRun(buffer: ArrayBuffer, filename: string, entity: Entity, data: DemoData, site: SiteId): Preview {
  const errors: ImportError[] = [];
  const diffs: ImportDiff[] = [];
  let next = data;
  if (!/\.(csv|xlsx)$/i.test(filename)) throw new Error("Choose a CSV or XLSX file.");
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("File exceeds the 10 MB limit.");
  const workbook = XLSX.read(buffer, { type: "array", raw: true, cellDates: true, cellFormula: true, sheetRows: 10002 });
  const name = /\.csv$/i.test(filename) ? workbook.SheetNames[0] : entity;
  if (!name || !workbook.Sheets[name]) throw new Error(`Workbook must contain a sheet named "${entity}".`);
  const worksheet = workbook.Sheets[name];
  for (const [address, cell] of Object.entries(worksheet)) {
    if (!address.startsWith("!") && cell && typeof cell === "object" && "f" in cell && cell.f) {
      throw new Error(`Formula cells are not supported (${address}).`);
    }
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", blankrows: true, raw: true });
  if (!rows.length) throw new Error("The file is empty.");
  if (rows.length > 10001) throw new Error("File exceeds the 10,000 row limit.");
  const headers = rows[0].map((value) => String(value).trim());
  if (headers.some((value) => !value) || new Set(headers).size !== headers.length) throw new Error("Column headers must be non-empty and unique.");
  const allowed = new Set(columns(entity));
  for (const header of headers) if (!allowed.has(header)) errors.push({ row: 1, column: header, message: "Unknown column." });
  for (const key of entities[entity].keys) if (!headers.includes(key)) errors.push({ row: 1, column: key, message: "Required key column is missing." });
  const seen = new Set<string>();
  const rowCodes = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((value) => value === "" || value === null || value === undefined)) continue;
    const partial: Record<string, unknown> = {};
    for (let col = 0; col < row.length; col++) {
      const field = headers[col];
      const cell = row[col];
      const value = typeof cell === "string" ? cell.trim() : cell;
      if (value === "" || value === null || value === undefined) continue;
      if (!field) { errors.push({ row: i + 1, column: `Column ${col + 1}`, message: "Missing column header." }); continue; }
      try { partial[field] = convert(field, value); }
      catch (error) { errors.push({ row: i + 1, column: field, message: error instanceof Error ? error.message : "Invalid value." }); }
    }
    if (partial.SiteId && partial.SiteId !== site) errors.push({ row: i + 1, column: "SiteId", message: `Must match active site ${site}.` });
    partial.SiteId = site;
    const key = keyOf(partial, entity);
    if (seen.has(key)) { errors.push({ row: i + 1, column: entities[entity].keys.join(", "), message: "Duplicate key in file." }); continue; }
    seen.add(key);
    rowCodes.set(key, i + 1);
    const old = rowsFor(data, entity).find((record) => keyOf(record, entity) === key);
    const combined = { ...old, ...partial };
    if (["equipment", "schedules", "workRequests"].includes(entity) && combined.RoomCode && (!combined.bl_id || !combined.LevelName)) {
      const candidates = next.rooms.filter((room) => room.RoomCode === combined.RoomCode &&
        (!combined.bl_id || room.bl_id === combined.bl_id) && (!combined.LevelName || room.LevelName === combined.LevelName));
      if (candidates.length === 1) {
        combined.bl_id = candidates[0].bl_id;
        combined.LevelName = candidates[0].LevelName;
      } else errors.push({ row: i + 1, column: "RoomCode", message: "Room is missing or ambiguous; specify building and floor." });
    } else if (["equipment", "schedules", "workRequests"].includes(entity) && combined.LevelName && !combined.bl_id) {
      const candidates = next.floors.filter((floor) => floor.LevelName === combined.LevelName);
      if (candidates.length === 1) combined.bl_id = candidates[0].bl_id;
      else errors.push({ row: i + 1, column: "LevelName", message: "Floor is missing or ambiguous; specify building." });
    }
    const parsed = entities[entity].schema.safeParse(combined);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push({ row: i + 1, column: issue.path.join(".") || "row", message: issue.message });
      continue;
    }
    if (entity === "workRequests") {
      const wr = BaseWorkRequestSchema.parse(parsed.data);
      if (old && ["ESAWorkType", "WorkRequestStatus", "WorkRequestSubstatus", "Percentage"].some((field) => old[field] !== combined[field])) {
        errors.push({ row: i + 1, column: "Percentage", message: "Status transitions must be performed in the work request workflow, not by import." });
      } else if (!old && !WR_Statuses.some((status) => status.ESAWorkType === wr.ESAWorkType &&
        status.WorkRequestStatus === wr.WorkRequestStatus && status.WorkRequestSubstatus === wr.WorkRequestSubstatus &&
        status.Percentage === wr.Percentage && status.Percentage === 50)) {
        errors.push({ row: i + 1, column: "Percentage", message: "New work requests must use the configured 50% Issued status." });
      }
    }
    const record = { ...old, ...parsed.data };
    const changes = Object.keys(record)
      .filter((field) => JSON.stringify(old?.[field]) !== JSON.stringify(record[field as keyof typeof record]))
      .map((field) => ({ field, before: old?.[field], after: record[field as keyof typeof record] }));
    diffs.push({ row: i + 1, code: entities[entity].keys.map((field) => String(partial[field] ?? "")).join(" / "), operation: old ? "Update" : "Insert", changes });
    next = replace(next, entity, record);
  }
  if (!diffs.length && !errors.length) errors.push({ row: 1, column: "file", message: "No data rows found." });
  for (const record of rowsFor(next, entity)) {
    const row = rowCodes.get(keyOf(record, entity)) ?? (entity === "equipment" ? diffs[0]?.row : undefined);
    if (!row) continue;
    const add = (column: string, message: string) => errors.push({ row, column, message });
    if (entity === "floors" || entity === "rooms" || entity === "equipment" || entity === "schedules" || entity === "workRequests") {
      if (record.bl_id && !next.buildings.some((building) => building.bl_id === record.bl_id)) add("bl_id", "Building does not exist on this site.");
      if (record.LevelName && !next.floors.some((floor) => floor.bl_id === record.bl_id && floor.LevelName === record.LevelName)) add("LevelName", "Floor does not exist in this building.");
      if (record.RoomCode && !next.rooms.some((room) => room.bl_id === record.bl_id && room.LevelName === record.LevelName && room.RoomCode === record.RoomCode)) add("RoomCode", "Room does not exist on this floor.");
    }
    if (entity === "equipment" && record.ParentEquipmentCode) {
      const visited = new Set([record.EquipmentCode]);
      let parent: unknown = record.ParentEquipmentCode;
      while (parent) {
        if (visited.has(parent)) { add("ParentEquipmentCode", "Equipment hierarchy contains a cycle."); break; }
        visited.add(parent);
        const found = next.equipment.find((item) => item.EquipmentCode === parent);
        if (!found) { add("ParentEquipmentCode", "Parent equipment does not exist on this site."); break; }
        if (visited.size > 3) { add("ParentEquipmentCode", "Equipment hierarchy exceeds three tiers."); break; }
        parent = found.ParentEquipmentCode;
      }
    }
    if (entity === "schedules" && !next.blueprints.some((blueprint) => blueprint.ChecklistCode === record.ChecklistCode)) add("ChecklistCode", "Checklist does not exist on this site.");
    if ((entity === "schedules" || entity === "workRequests") && Array.isArray(record.EquipmentCodes)) {
      for (const code of record.EquipmentCodes) if (!next.equipment.some((item) => item.EquipmentCode === code)) add("EquipmentCodes", `Equipment ${String(code)} does not exist on this site.`);
    }
  }
  return { errors, diffs, next };
}

import type { Equipment } from "@cafm/shared-schema";
import { EQUIPMENT_CATEGORIES } from "@cafm/shared-schema";

// V70 Section 120: shared equipment filter engine.
// Pure logic, no React. The registry (all three views: equipment tree,
// location tree, flat table) builds one matcher from: the quick search box,
// the status checkboxes, per-field "contains" rows and the advanced
// AND/OR condition list. Everything combines with AND except the rows of
// the advanced list, which combine with their own per-row connector.

export type FilterConnector = "and" | "or";

export type FilterOperator =
  | "contains" | "notContains" | "equals" | "notEquals"
  | "startsWith" | "endsWith" | "isEmpty" | "isNotEmpty"
  | "greater" | "less" | "greaterOrEqual" | "lessOrEqual";

export interface EquipmentFilterField {
  id: string;
  label: string;
  numeric?: boolean;
  value: (eq: Equipment) => string | number | undefined;
}

export interface FieldFilterRow {
  id: string;
  fieldId: string;
  value: string;
}

export interface FilterCondition {
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value: string;
  // How this row combines with the result of everything above it.
  // The first row's connector is ignored. Rows evaluate top to bottom.
  connector: FilterConnector;
}

export const TEXT_OPERATORS: { id: FilterOperator; label: string }[] = [
  { id: "contains", label: "contains" },
  { id: "notContains", label: "does not contain" },
  { id: "equals", label: "equals" },
  { id: "notEquals", label: "does not equal" },
  { id: "startsWith", label: "starts with" },
  { id: "endsWith", label: "ends with" },
  { id: "isEmpty", label: "is empty" },
  { id: "isNotEmpty", label: "is not empty" },
];

export const NUMERIC_OPERATORS: { id: FilterOperator; label: string }[] = [
  { id: "greater", label: "greater than" },
  { id: "greaterOrEqual", label: "greater or equal" },
  { id: "less", label: "less than" },
  { id: "lessOrEqual", label: "less or equal" },
  { id: "equals", label: "equals" },
  { id: "notEquals", label: "does not equal" },
  { id: "isEmpty", label: "is empty" },
  { id: "isNotEmpty", label: "is not empty" },
];

export const EQUIPMENT_FILTER_FIELDS: EquipmentFilterField[] = [
  { id: "EquipmentCode", label: "EQ ID (internal)", value: (eq) => eq.EquipmentCode },
  { id: "LocalEquipmentCode", label: "Local Equipment Code", value: (eq) => eq.LocalEquipmentCode },
  { id: "EquipmentName", label: "Name (English)", value: (eq) => eq.EquipmentName },
  { id: "EquipmentNameLocal", label: "Name (local language)", value: (eq) => eq.EquipmentNameLocal },
  { id: "Category", label: "Category", value: (eq) => eq.Category ? `${eq.Category} - ${EQUIPMENT_CATEGORIES[eq.Category]}` : undefined },
  { id: "HierarchyLevel", label: "Hierarchy level", value: (eq) => eq.HierarchyLevel },
  { id: "ParentEquipmentCode", label: "Parent EQ ID", value: (eq) => eq.ParentEquipmentCode },
  { id: "bl_id", label: "Building", value: (eq) => eq.bl_id },
  { id: "LevelName", label: "Floor", value: (eq) => eq.LevelName },
  { id: "RoomCode", label: "Room", value: (eq) => eq.RoomCode },
  { id: "Status", label: "Status", value: (eq) => eq.Status },
  { id: "Criticality", label: "Criticality", value: (eq) => eq.Criticality },
  { id: "PrimaryTradeId", label: "Trade", value: (eq) => eq.PrimaryTradeId },
  { id: "Manufacturer", label: "Manufacturer", value: (eq) => eq.Manufacturer },
  { id: "Model", label: "Model", value: (eq) => eq.Model },
  { id: "SerialNumber", label: "Serial number", value: (eq) => eq.SerialNumber },
  { id: "BimLink", label: "3D BIM link", value: (eq) => eq.bimGlobalId ? "Yes" : "No" },
  { id: "ReplacementCostEur", label: "Replacement cost (EUR)", numeric: true, value: (eq) => eq.ReplacementCostEur },
];

const FIELD_BY_ID = new Map(EQUIPMENT_FILTER_FIELDS.map((field) => [field.id, field]));

export function findEquipmentFilterField(fieldId: string): EquipmentFilterField | undefined {
  return FIELD_BY_ID.get(fieldId);
}

export function operatorsForField(field: EquipmentFilterField | undefined) {
  return field?.numeric ? NUMERIC_OPERATORS : TEXT_OPERATORS;
}

// Quick-search fields. The V69 list plus the local equipment code and the
// identification fields users expect search to know about.
const QUICK_SEARCH_FIELDS: ((eq: Equipment) => string | number | undefined)[] = [
  (eq) => eq.EquipmentCode,
  (eq) => eq.LocalEquipmentCode,
  (eq) => eq.EquipmentName,
  (eq) => eq.EquipmentNameLocal,
  (eq) => eq.Category,
  (eq) => eq.PrimaryTradeId,
  (eq) => eq.bl_id,
  (eq) => eq.LevelName,
  (eq) => eq.RoomCode,
  (eq) => eq.ParentEquipmentCode,
  (eq) => eq.Manufacturer,
  (eq) => eq.Model,
  (eq) => eq.SerialNumber,
  (eq) => eq.Criticality,
];

function isEmptyValue(value: string | number | undefined) {
  return value === undefined || value === null || value === "";
}

function evaluateText(eq: Equipment, field: EquipmentFilterField, operator: FilterOperator, raw: string): boolean {
  const actual = String(field.value(eq) ?? "").toLowerCase();
  const wanted = raw.trim().toLowerCase();
  switch (operator) {
    case "contains": return !!wanted && actual.includes(wanted);
    case "notContains": return !wanted || !actual.includes(wanted);
    case "equals": return !!wanted && actual === wanted;
    case "notEquals": return !wanted || actual !== wanted;
    case "startsWith": return !!wanted && actual.startsWith(wanted);
    case "endsWith": return !!wanted && actual.endsWith(wanted);
    default: return true;
  }
}

function evaluateNumber(eq: Equipment, field: EquipmentFilterField, operator: FilterOperator, raw: string): boolean {
  const actual = field.value(eq);
  if (operator === "isEmpty") return isEmptyValue(actual);
  if (operator === "isNotEmpty") return !isEmptyValue(actual);
  const left = typeof actual === "number" ? actual : Number(actual);
  const right = Number(raw);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  switch (operator) {
    case "greater": return left > right;
    case "less": return left < right;
    case "greaterOrEqual": return left >= right;
    case "lessOrEqual": return left <= right;
    case "equals": return left === right;
    case "notEquals": return left !== right;
    default: return true;
  }
}

export function evaluateCondition(eq: Equipment, condition: FilterCondition): boolean {
  const field = FIELD_BY_ID.get(condition.fieldId);
  if (!field) return true;
  if (condition.operator === "isEmpty") return isEmptyValue(field.value(eq));
  if (condition.operator === "isNotEmpty") return !isEmptyValue(field.value(eq));
  if (!condition.value.trim()) return true; // incomplete rows never filter
  return field.numeric
    ? evaluateNumber(eq, field, condition.operator, condition.value)
    : evaluateText(eq, field, condition.operator, condition.value);
}

// Top to bottom: ((row1 c row2) c row3) ... where c is each row's connector.
export function evaluateAdvanced(eq: Equipment, conditions: FilterCondition[]): boolean {
  let result: boolean | null = null;
  for (const condition of conditions) {
    const outcome = evaluateCondition(eq, condition);
    result = result === null ? outcome : condition.connector === "or" ? result || outcome : result && outcome;
  }
  return result ?? true;
}

export interface EquipmentMatcherInput {
  query: string;
  statuses: string[];
  fieldFilters: FieldFilterRow[];
  conditions: FilterCondition[];
}

export function buildEquipmentMatcher(input: EquipmentMatcherInput): (eq: Equipment) => boolean {
  const query = input.query.trim().toLowerCase();
  return (eq: Equipment) => {
    if (input.statuses.length && !input.statuses.includes(eq.Status)) return false;
    if (query && !QUICK_SEARCH_FIELDS.some((accessor) => String(accessor(eq) ?? "").toLowerCase().includes(query))) return false;
    for (const row of input.fieldFilters) {
      const wanted = row.value.trim().toLowerCase();
      if (!wanted) continue;
      const field = FIELD_BY_ID.get(row.fieldId);
      if (!field) continue;
      if (!String(field.value(eq) ?? "").toLowerCase().includes(wanted)) return false;
    }
    return evaluateAdvanced(eq, input.conditions);
  };
}

// ----- Local Equipment Code guidance (V70 Section 120) -----
// The Local Equipment Code is the human-readable operational identifier
// ([Location]_[Installation]_[Subcomponent], e.g. E-1_ARLT1_FT1). It is
// NOT a key: EquipmentCode stays the immutable internal ID and nothing
// cascades on local code changes. Legacy live values (e.g. HVAC-GF-001)
// must keep parsing, so the schema stays permissive and conformance is
// guidance shown in the UI, never a hard block.
export const LOCAL_EQUIPMENT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*(?:_[A-Za-z0-9-]+)*$/;

export const LOCAL_EQUIPMENT_CODE_HINT =
  "Structure: [Location]_[Installation]_[Subcomponent], e.g. E-1_ARLT1 or E-1_ARLT1_FT1. " +
  "Keep it short and understandable: prefer recognisable abbreviations (DOOR, LADD, WIND, ALAR, FEXT, UV).";

export function localEquipmentCodeIssue(code: string | undefined): string | null {
  if (!code || !code.trim()) return null;
  if (/\s/.test(code)) return "Local Equipment Codes cannot contain spaces; separate parts with underscores.";
  if (!LOCAL_EQUIPMENT_CODE_PATTERN.test(code)) return "Recommended structure: [Location]_[Installation]_[Subcomponent], letters/digits/dashes per part, e.g. E-1_ARLT1_FT1.";
  return null;
}

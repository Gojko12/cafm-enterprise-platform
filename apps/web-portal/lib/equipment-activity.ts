import type { Equipment } from "@cafm/shared-schema";

export function equipmentChangeDescriptions(before: Equipment, after: Equipment, actor: string): string[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])] as (keyof Equipment)[];
  const format = (value: unknown) => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const descriptions = keys.filter((key) => key !== "Activity" && key !== "Documents" &&
    JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => `${key} changed from '${format(before[key])}' to '${format(after[key])}' by ${actor}`);
  if (JSON.stringify(before.Documents) !== JSON.stringify(after.Documents)) {
    const names = (documents: Equipment["Documents"]) => (documents ?? []).map((document) => document.name).join(", ") || "none";
    descriptions.push(`Documents changed from '${names(before.Documents)}' to '${names(after.Documents)}' by ${actor}`);
  }
  return descriptions;
}

export function generateTechnicianSteps(scope: string): string[] {
  const clauses = scope.trim().split(/(?:\r?\n|[;,.]+|\s+and\s+(?=[a-z]))/i)
    .map((part) => part.trim()).filter(Boolean);
  if (!clauses.length) throw new Error("Enter a scope containing actionable work.");
  return [
    "Review the work permit, hazards and required PPE; isolate and lock out equipment as applicable.",
    ...clauses,
    "Restore equipment safely and perform the appropriate functional test.",
    "Record results and required photos; remove tools and leave the area safe and clean.",
  ];
}

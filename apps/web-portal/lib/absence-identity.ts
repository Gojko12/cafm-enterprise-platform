import type { CraftpersonAbsence } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { addDays } from "./dispatch";

type Person = DemoData["craftspeople"][number];
export function resolveAbsencePerson(absence: CraftpersonAbsence, people: Person[]): Person | undefined {
  const sitePeople = people.filter((p) => p.SiteId === absence.siteId);
  const exact = sitePeople.find((p) => p.id === absence.craftpersonId);
  if (exact) return exact;
  const name = absence.craftpersonId.trim().toLocaleLowerCase();
  const matches = sitePeople.filter((p) => [p.Name, `${p.Name} ${p.LastName}`, p.username].some((value) => value?.trim().toLocaleLowerCase() === name));
  return matches.length === 1 ? matches[0] : undefined;
}

export function carveAbsenceDates(absences: CraftpersonAbsence[], people: Person[], ids: string[], dates: string[]): CraftpersonAbsence[] {
  return absences.flatMap((absence) => {
    const person = resolveAbsencePerson(absence, people);
    if (!person || !ids.includes(person.id)) return [absence];
    const cuts = [...new Set(dates.filter((day) => day >= absence.startDate && day <= absence.endDate))].sort();
    if (!cuts.length) return [absence];
    const pieces: CraftpersonAbsence[] = [];
    let start = absence.startDate;
    for (const day of cuts) {
      if (start < day) pieces.push({ ...absence, id: pieces.length ? crypto.randomUUID() : absence.id, craftpersonId: person.id, startDate: start, endDate: addDays(day, -1) });
      start = addDays(day, 1);
    }
    if (start <= absence.endDate) pieces.push({ ...absence, id: pieces.length ? crypto.randomUUID() : absence.id, craftpersonId: person.id, startDate: start });
    return pieces;
  });
}

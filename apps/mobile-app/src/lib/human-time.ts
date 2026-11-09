export function formatHumanDateTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso), end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return `Invalid time range: ${startIso} – ${endIso}`;
  const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
  const date = (value: Date, weekday: boolean) => new Intl.DateTimeFormat("en-GB", { ...(weekday ? { weekday: "short" as const } : {}), day: "2-digit", month: "short", year: "numeric" }).format(value);
  const time = (value: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const duration = `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
  return sameDay ? `${date(start, true)} • ${time(start)} – ${time(end)} (${duration})` : `${date(start, false)}, ${time(start)} – ${date(end, false)}, ${time(end)} (${duration})`;
}

const dayKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export function formatPlannedRange(startIso: string, endIso: string, now: Date = new Date()): string {
  const start = new Date(startIso), end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return `${startIso} - ${endIso}`;
  const time = (value: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  const hours = ((end.getTime() - start.getTime()) / 3600000).toFixed(1);
  const day = (value: Date) => {
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    if (dayKey(value) === dayKey(now)) return "";
    if (dayKey(value) === dayKey(tomorrow)) return "Tomorrow";
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (dayKey(value) === dayKey(yesterday)) return "Yesterday";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(value.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }) }).format(value);
  };
  const first = day(start);
  if (dayKey(start) === dayKey(end)) return `${first ? `${first} \u00b7 ` : ""}${time(start)} \u2013 ${time(end)} (${hours}h)`;
  return `${first || "Today"}, ${time(start)} \u2013 ${day(end) || "Today"}, ${time(end)} (${hours}h)`;
}

export function formatShortDateTime(iso: string | undefined): string {
  if (!iso) return "";
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return iso;
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  return `${date}, ${time}`;
}

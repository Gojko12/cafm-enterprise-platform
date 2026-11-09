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

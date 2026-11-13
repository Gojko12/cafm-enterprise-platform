import type { BaseWorkRequest } from "@cafm/shared-schema";

export interface PersistedTimerState {
  wrId: string;
  sessionId: string;
  craftpersonId: string;
  craftpersonName: string;
  startedAt: string;
  pausedAt?: string;
  accumulatedPausedMs: number;
  isRunning: boolean;
}

type TimerSession = NonNullable<BaseWorkRequest["timeSessions"]>[number];
type TimerIndex = Record<string, PersistedTimerState[]>;

function isTimerState(value: unknown): value is PersistedTimerState {
  if (!value || typeof value !== "object") return false;
  const timer = value as Partial<PersistedTimerState>;
  return typeof timer.wrId === "string" && typeof timer.startedAt === "string" &&
    typeof timer.craftpersonId === "string" && typeof timer.craftpersonName === "string" &&
    typeof timer.sessionId === "string" && typeof timer.isRunning === "boolean" &&
    typeof timer.accumulatedPausedMs === "number";
}

function readTimerIndex(site: string): TimerIndex {
  const text = localStorage.getItem(`cafm-active-timers:${site}`);
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Saved active timer state has an invalid format.");
  }
  const index: TimerIndex = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value)) {
      if (!value.every(isTimerState)) throw new Error(`Saved timer state for ${key} has an invalid format.`);
      index[key] = value;
      continue;
    }
    if (value && typeof value === "object") {
      const legacy = value as Partial<PersistedTimerState>;
      if (typeof legacy.wrId === "string" && typeof legacy.craftpersonId === "string" &&
          typeof legacy.craftpersonName === "string" && typeof legacy.startedAt === "string") {
        let legacySessionId = key;
        try {
          const legacyKey: unknown = JSON.parse(key);
          if (Array.isArray(legacyKey) && typeof legacyKey[3] === "string") legacySessionId = legacyKey[3];
        } catch { /* Older keys may not be JSON tuples. */ }
        const timer: PersistedTimerState = {
          wrId: legacy.wrId, sessionId: legacy.sessionId ?? legacySessionId, craftpersonId: legacy.craftpersonId,
          craftpersonName: legacy.craftpersonName, startedAt: legacy.startedAt,
          accumulatedPausedMs: legacy.accumulatedPausedMs ?? 0, isRunning: legacy.isRunning ?? true,
          ...(legacy.pausedAt ? { pausedAt: legacy.pausedAt } : {}),
        };
        index[timer.wrId] = [...(index[timer.wrId] ?? []), timer];
      }
    }
  }
  return index;
}

function sessionFromTimer(timer: PersistedTimerState): TimerSession {
  return {
    id: timer.sessionId,
    craftpersonId: timer.craftpersonId,
    craftpersonName: timer.craftpersonName,
    startedAt: timer.startedAt,
    durationMinutes: 0,
  };
}

export function restoreActiveTimers(site: string, requests: BaseWorkRequest[]): BaseWorkRequest[] {
  const index = readTimerIndex(site);
  return requests.map((wr) => {
    if (wr.Percentage >= 78) return wr;
    const stored = index[wr.WR_ID] ?? [];
    const sessions = [...(wr.timeSessions ?? [])];
    for (const timer of stored) {
      const exact = sessions.find((session) => session.id === timer.sessionId);
      const active = sessions.find((session) => session.craftpersonId === timer.craftpersonId && !session.endedAt);
      const stoppedAfter = sessions.some((session) => session.craftpersonId === timer.craftpersonId &&
        !!session.endedAt && Date.parse(session.endedAt) >= Date.parse(timer.startedAt));
      if (exact || active || stoppedAfter) continue;
      sessions.push(sessionFromTimer(timer));
    }
    return sessions.length === (wr.timeSessions ?? []).length ? wr : { ...wr, timeSessions: sessions };
  });
}

export function persistActiveTimers(site: string, requests: BaseWorkRequest[]): void {
  const index = readTimerIndex(site);
  const requestsById = new Map(requests.map((wr) => [wr.WR_ID, wr]));
  const next: TimerIndex = {};
  for (const [wrId, timers] of Object.entries(index)) {
    const wr = requestsById.get(wrId);
    if (!wr) { next[wrId] = timers; continue; }
    if (wr.Percentage >= 78) continue;
    const sessions = wr.timeSessions ?? [];
    const retained = timers.filter((timer) => {
      const exact = sessions.find((session) => session.id === timer.sessionId);
      if (exact) return !exact.endedAt;
      const active = sessions.some((session) => session.craftpersonId === timer.craftpersonId && !session.endedAt);
      const stoppedAfter = sessions.some((session) => session.craftpersonId === timer.craftpersonId &&
        !!session.endedAt && Date.parse(session.endedAt) >= Date.parse(timer.startedAt));
      return !active && !stoppedAfter;
    });
    if (retained.length) next[wrId] = retained;
  }
  for (const wr of requests) {
    if (wr.Percentage >= 78) continue;
    for (const session of wr.timeSessions ?? []) {
      if (session.endedAt) continue;
      const timer: PersistedTimerState = {
        wrId: wr.WR_ID, sessionId: session.id, craftpersonId: session.craftpersonId,
        craftpersonName: session.craftpersonName, startedAt: session.startedAt,
        accumulatedPausedMs: 0, isRunning: true,
      };
      next[wr.WR_ID] = [...(next[wr.WR_ID] ?? []).filter((item) => item.sessionId !== timer.sessionId), timer];
    }
  }
  localStorage.setItem(`cafm-active-timers:${site}`, JSON.stringify(next));
}

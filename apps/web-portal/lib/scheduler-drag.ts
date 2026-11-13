import type React from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";

export type SchedulerDraggedRequest = { wrId: string; siteId: string; from?: string };
export const activeDraggedWrRef: { current: SchedulerDraggedRequest | null } = { current: null };

export function startSchedulerRequestDrag(event: React.DragEvent, wr: BaseWorkRequest, from?: string): void {
  const dragged: SchedulerDraggedRequest = {
    wrId: wr.WR_ID,
    siteId: wr.SiteId,
    ...(from ? { from } : {}),
  };
  activeDraggedWrRef.current = dragged;
  const payload = JSON.stringify(dragged);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-cafm-wr", payload);
  event.dataTransfer.setData("text/plain", payload);
  event.dataTransfer.setData("application/json", JSON.stringify({ id: wr.WR_ID, from }));
  console.info("[Scheduler DnD] dragstart", { wrId: wr.WR_ID, siteId: wr.SiteId, from: from ?? null });
}

export function readSchedulerDrag(event: React.DragEvent): {
  dragged: SchedulerDraggedRequest | null;
  rawPayload: string;
} {
  const rawPayload = event.dataTransfer.getData("application/x-cafm-wr") ||
    event.dataTransfer.getData("text/plain") ||
    event.dataTransfer.getData("application/json");
  if (rawPayload) {
    try {
      const parsed: unknown = JSON.parse(rawPayload);
      if (typeof parsed === "string" || typeof parsed === "number") {
        return { dragged: { wrId: String(parsed), siteId: activeDraggedWrRef.current?.siteId ?? "" }, rawPayload };
      }
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const wrId = typeof record.wrId === "string" ? record.wrId :
          typeof record.id === "string" ? record.id : undefined;
        if (wrId) return {
          dragged: {
            wrId,
            siteId: typeof record.siteId === "string" ? record.siteId : activeDraggedWrRef.current?.siteId ?? "",
            ...(typeof record.from === "string" ? { from: record.from } : {}),
          },
          rawPayload,
        };
      }
    } catch {
      if (/^\d{10}$/.test(rawPayload)) {
        return { dragged: { wrId: rawPayload, siteId: activeDraggedWrRef.current?.siteId ?? "" }, rawPayload };
      }
    }
  }
  return { dragged: activeDraggedWrRef.current, rawPayload };
}

export function finishSchedulerRequestDrag(): void {
  if (activeDraggedWrRef.current) console.info("[Scheduler DnD] dragend", activeDraggedWrRef.current);
  activeDraggedWrRef.current = null;
}

export function logSchedulerDropRejected(reason: string, rawPayload: string, details: Record<string, unknown> = {}): void {
  console.warn("[Scheduler DnD] drop-rejected", { reason, rawPayload, ...details });
}

import type React from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { tradeColor } from "./trade-colors";
import { startSchedulerRequestDrag } from "./scheduler-drag";

export function startRequestDrag(event: React.DragEvent, wr: BaseWorkRequest, from?: string) {
  startSchedulerRequestDrag(event, wr, from);
  const ghost = document.createElement("div");
  ghost.textContent = `${wr.WR_ID} (2h)`;
  ghost.className = `border-l-4 ${tradeColor(wr.TradeName)}`;
  Object.assign(ghost.style, { position: "fixed", left: "-1000px", top: "0", width: "88px", height: "26px", boxSizing: "border-box", padding: "4px", overflow: "hidden", whiteSpace: "nowrap", borderRadius: "4px", fontSize: "11px" });
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 12, 13);
  window.setTimeout(() => ghost.remove(), 0);
}

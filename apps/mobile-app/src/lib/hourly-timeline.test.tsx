import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { HourlyTimeline } from "../../../web-portal/components/modules/HourlyTimeline";
import { section20Seed } from "../../../web-portal/lib/section20-seed";

afterEach(cleanup);

describe("hourly dispatch timeline", () => {
  const seed = section20Seed(["SITE-01"]);
  const person = seed.craftspeople[0];
  const wr = {
    ...seed.workRequests[0], AssignedCraftpersonIds: [person.id], Percentage: 50, IsFrozen: false,
    CraftpersonAssignments: [{ craftpersonId: person.id, assignedStartDateTime: "2026-11-09T08:00", assignedEndDateTime: "2026-11-09T11:30" }],
  };
  const props = {
    dates: ["2026-11-09"], people: [person], requests: [wr], absences: [], freezes: [],
    site: "SITE-01", firstHour: 6, lastHour: 20, visible: () => true,
    onMove: vi.fn(), onOpen: vi.fn(), onEdit: vi.fn(),
  };
  it("renders the clipped hours and previews a half-hour resize without committing until mouseup", () => {
    const onMove = vi.fn();
    render(<HourlyTimeline {...props} onMove={onMove} />);
    expect(screen.getByText("w.46 Nov 2026")).toBeTruthy();
    expect(screen.getByText("06")).toBeTruthy();
    expect(screen.getByText("19")).toBeTruthy();
    expect(screen.queryByText("20")).toBeNull();
    expect(screen.getByText("Craftsperson").className).toContain("sticky");
    expect(screen.getByText(/📁 Mechanical/).closest("th")?.className).toContain("sticky");
    expect(screen.getByText(/Gregor GOJKOŠEK/).closest("th")?.className).toContain("sticky");
    expect(screen.getByText(/3\.5 \/ 7\.5 h/)).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("separator", { name: "Resize end" }), { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 118 });
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText(/4\.0 \/ 7\.5 h/)).toBeTruthy();
    fireEvent.mouseUp(window);
    expect(onMove).toHaveBeenCalledWith(wr.WR_ID, person.id, "2026-11-09T08:00", "2026-11-09T12:00", person.id);
  });
  it("drops onto an exact hour and preserves the dragged assignment duration", () => {
    const onMove = vi.fn();
    const view = render(<HourlyTimeline {...props} onMove={onMove} />);
    const cell = view.container.querySelector("tbody tr:nth-child(2) td");
    expect(cell).toBeTruthy();
    const drop = createEvent.drop(cell!, { dataTransfer: { getData: () => JSON.stringify({ id: wr.WR_ID, from: person.id }) } });
    Object.defineProperty(drop, "clientX", { value: 4 * 36 + 1 });
    fireEvent(cell!, drop);
    expect(onMove).toHaveBeenCalledWith(wr.WR_ID, person.id, "2026-11-09T10:00", "2026-11-09T13:30", person.id);
  });
  it("hydrates server-rendered timeline markup without recoverable errors", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<HourlyTimeline {...props} />);
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, <HourlyTimeline {...props} />, { onRecoverableError });
    await act(async () => {});
    expect(onRecoverableError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
  it("expands a collapsed trade and scrolls the highlighted assignment into view", () => {
    const scroll = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
    const view = render(<HourlyTimeline {...props} />);
    fireEvent.click(screen.getByText(/📁 Mechanical/));
    expect(screen.queryByText(wr.WR_ID)).toBeNull();
    view.rerender(<HourlyTimeline {...props} spotlight={{ id: wr.WR_ID, person: person.id, day: "2026-11-09", trade: person.Trade, token: 1 }} />);
    const bar = screen.getByText(wr.WR_ID).parentElement!;
    expect(bar.className).toContain("ring-4");
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center", inline: "center" });
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });
});

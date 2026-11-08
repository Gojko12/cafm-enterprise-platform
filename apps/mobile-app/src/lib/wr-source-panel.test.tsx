import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WRSourcePanel } from "../../../web-portal/components/modules/WRSourcePanel";
import { section20Seed } from "../../../web-portal/lib/section20-seed";

const seed = section20Seed(["SITE-01"]);
const pm = { ...seed.workRequests[0], WR_ID: "PM-1", WR_Type: "PM" as const, Percentage: 50, AssignedCraftpersonIds: [], Description: "Pump" };
const lj = { ...seed.workRequests[1], WR_ID: "LJ-1", WR_Type: "LJ" as const, Percentage: 20, AssignedCraftpersonIds: [], Description: "Repair" };
const props = { requests: [pm, lj], people: seed.craftspeople, buildings: seed.buildings, freezes: [], now: "", onOpen: vi.fn(), onAssign: vi.fn(), onShow: vi.fn() };
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("work request source panel", () => {
  it("limits available statuses to checked types and filters the cards", () => {
    render(<WRSourcePanel {...props} />);
    expect(screen.getByText("20% Quotation Preparation Offer by Contractor")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("LJ"));
    expect(screen.queryByText("20% Quotation Preparation Offer by Contractor")).toBeNull();
    expect(screen.getByText("50% Issued")).toBeTruthy();
    expect(screen.getByText("Pump")).toBeTruthy();
    expect(screen.queryByText("Repair")).toBeNull();
  });
  it("persists view and field selections and permits list row drag and opening", () => {
    const onOpen = vi.fn();
    const view = render(<WRSourcePanel {...props} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("Columns / Fields ⚙️"));
    fireEvent.click(screen.getByLabelText("Margin Date"));
    expect(screen.getAllByText(/Margin Date:/).length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "List View" }));
    expect(screen.getByRole("columnheader", { name: /Margin Date/ })).toBeTruthy();
    const row = screen.getByText("PM-1").closest("tr")!;
    const setData = vi.fn();
    const setDragImage = vi.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, setDragImage } });
    expect(setData).toHaveBeenCalledWith("application/json", JSON.stringify({ id: "PM-1" }));
    expect(setDragImage).toHaveBeenCalledWith(expect.any(HTMLElement), 12, 13);
    fireEvent.click(within(row).getByRole("button", { name: /Open/ }));
    expect(onOpen).toHaveBeenCalledWith("PM-1");
    view.unmount();
    render(<WRSourcePanel {...props} />);
    expect(screen.getByRole("button", { name: "List View" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("columnheader", { name: /Margin Date/ })).toBeTruthy();
  });
  it("persists field order and widths across card and list views", () => {
    const view = render(<WRSourcePanel {...props} />);
    fireEvent.click(screen.getByText("Columns / Fields ⚙️"));
    fireEvent.click(screen.getByRole("button", { name: "Move WR Type (PM/FJ/LJ) left" }));
    const firstCard = screen.getByText("Pump").closest("article")!;
    expect(firstCard.querySelector("p")?.textContent).toContain("WR Type");
    fireEvent.click(screen.getByRole("button", { name: "List View" }));
    fireEvent.mouseDown(screen.getByRole("separator", { name: "Resize WR ID" }), { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 160 });
    fireEvent.mouseUp(window);
    expect(screen.getByRole("columnheader", { name: /WR ID/ }).closest("table")?.querySelectorAll("col")[1].style.width).toBe("204px");
    view.unmount();
    render(<WRSourcePanel {...props} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")[0].textContent).toContain("WR Type");
    expect(table.querySelectorAll("col")[1].style.width).toBe("204px");
  });
  it("filters by due date and ignores out-of-range and missing due dates", () => {
    render(<WRSourcePanel {...props} requests={[{ ...pm, DueDate: "2026-11-10" }, { ...lj, DueDate: undefined }]} />);
    fireEvent.change(screen.getByLabelText("Due From"), { target: { value: "2026-11-09" } });
    expect(screen.getByText("Pump")).toBeTruthy();
    expect(screen.queryByText("Repair")).toBeNull();
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-09" } });
    expect(screen.queryByText("Pump")).toBeNull();
  });
  it("shows scheduled assignments in card and list view with working locator actions", () => {
    const scheduled = { ...pm, AssignedCraftpersonIds: [seed.craftspeople[0].id], CraftpersonAssignments: [{ craftpersonId: seed.craftspeople[0].id, assignedStartDateTime: "2026-11-09T08:00", assignedEndDateTime: "2026-11-09T11:00" }] };
    const onShow = vi.fn();
    render(<WRSourcePanel {...props} requests={[scheduled]} onShow={onShow} />);
    expect(screen.getByRole("button", { name: "Scheduled & Unscheduled" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Show$/ }));
    fireEvent.click(screen.getByRole("button", { name: "List View" }));
    fireEvent.click(screen.getByRole("button", { name: /Show$/ }));
    expect(onShow).toHaveBeenCalledTimes(2);
    expect(onShow).toHaveBeenCalledWith("PM-1");
  });
  it("filters scheduled, unscheduled and mixed requests", () => {
    const scheduled = { ...pm, AssignedCraftpersonIds: [seed.craftspeople[0].id], CraftpersonAssignments: [{ craftpersonId: seed.craftspeople[0].id, assignedStartDateTime: "2026-11-09T08:00", assignedEndDateTime: "2026-11-09T11:00" }] };
    render(<WRSourcePanel {...props} requests={[scheduled, lj]} />);
    fireEvent.click(screen.getByRole("button", { name: "Scheduled", exact: true }));
    expect(screen.getByText("Pump")).toBeTruthy();
    expect(screen.queryByText("Repair")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Unscheduled", exact: true }));
    expect(screen.queryByText("Pump")).toBeNull();
    expect(screen.getByText("Repair")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scheduled & Unscheduled" }));
    expect(screen.getByText("Pump")).toBeTruthy();
  });
  it("filters independently by multiple trades and buildings", () => {
    const first = { ...pm, TradeName: "Mechanical", bl_id: seed.buildings[0].bl_id };
    const second = { ...lj, TradeName: "Electrical", bl_id: seed.buildings[1].bl_id };
    render(<WRSourcePanel {...props} requests={[first, second]} />);
    const trades = screen.getByText("Pool Trades (All)").closest("details")!;
    fireEvent.click(within(trades).getByText("Clear"));
    fireEvent.click(within(trades).getByLabelText("Mechanical"));
    expect(screen.getByText("Pump")).toBeTruthy();
    expect(screen.queryByText("Repair")).toBeNull();
    fireEvent.click(within(trades).getByLabelText("Electrical"));
    expect(screen.getByText("Repair")).toBeTruthy();
    const buildings = screen.getByText("Pool Buildings (All)").closest("details")!;
    fireEvent.click(within(buildings).getByText("Clear"));
    fireEvent.click(within(buildings).getByLabelText(new RegExp(seed.buildings[1].bl_id)));
    expect(screen.queryByText("Pump")).toBeNull();
    expect(screen.getByText("Repair")).toBeTruthy();
  });
});

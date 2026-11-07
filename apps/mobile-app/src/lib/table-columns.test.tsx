import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { OverviewTable } from "../../../web-portal/components/common/TableColumns";

const columns = [
  { id: "name", label: "Name", value: (item: { id: string; name: string; cost: number }) => item.name },
  { id: "cost", label: "Cost", value: (item: { id: string; name: string; cost: number }) => item.cost },
];
const rows = [{ id: "a", name: "Alpha", cost: 10 }, { id: "b", name: "Beta", cost: 2 }];

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("overview table columns", () => {
  it("sorts numeric values in both directions and returns to original order", () => {
    render(<OverviewTable preferenceKey="test" columns={columns} rows={rows} rowKey={(item) => item.id} />);
    const body = screen.getByRole("table").querySelector("tbody")!;
    const names = () => within(body).getAllByRole("row").map((row) => row.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Cost" }));
    expect(names()[0]).toContain("Beta");
    fireEvent.click(screen.getByRole("button", { name: "Cost ▲" }));
    expect(names()[0]).toContain("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Cost ▼" }));
    expect(names()[0]).toContain("Alpha");
  });

  it("persists visibility and column order across remounts", () => {
    const view = render(<OverviewTable preferenceKey="test" columns={columns} rows={rows} rowKey={(item) => item.id} />);
    fireEvent.click(screen.getByText("Columns ⚙️"));
    fireEvent.click(screen.getByRole("button", { name: "Move Cost left" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Name" }));
    view.unmount();
    render(<OverviewTable preferenceKey="test" columns={columns} rows={rows} rowKey={(item) => item.id} />);
    expect(screen.queryByRole("columnheader", { name: "Name" })).toBeNull();
    expect(screen.getAllByRole("columnheader")[0].textContent).toContain("Cost");
  });
  it("resizes with mouse and keyboard, persists widths and exposes full cell values", () => {
    const view = render(<OverviewTable preferenceKey="test" columns={columns} rows={rows} rowKey={(item) => item.id} />);
    const handle = screen.getByRole("separator", { name: "Resize Name" });
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 160 });
    fireEvent.mouseUp(window);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(screen.getByTitle("Alpha").className).toContain("p-2");
    expect(screen.getByRole("table").querySelector("col")?.style.width).toBe("220px");
    view.unmount();
    render(<OverviewTable preferenceKey="test" columns={columns} rows={rows} rowKey={(item) => item.id} />);
    expect(screen.getByRole("table").querySelector("col")?.style.width).toBe("220px");
  });
});

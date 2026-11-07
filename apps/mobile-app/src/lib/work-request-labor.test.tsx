import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { WorkRequestLabor } from "../../../web-portal/components/modules/WorkRequestLabor";
import { section20Seed } from "../../../web-portal/lib/section20-seed";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("../../../web-portal/node_modules/next/navigation.js", () => ({ useRouter: () => navigation }));
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); navigation.push.mockClear(); });

describe("work request labor", () => {
  const data = section20Seed(["SITE-01"]);
  const person = data.craftspeople[0];
  const wr = { ...data.workRequests[0], AssignedCraftpersonIds: [person.id], CraftpersonLabor: [], CraftpersonAssignments: [{ craftpersonId: person.id, assignedStartDateTime: "2026-11-09T08:00", assignedEndDateTime: "2026-11-09T11:00" }] };
  it("shows a scheduler assignment and navigates to its isolated calendar location", () => {
    const close = vi.fn();
    render(<WorkRequestLabor wr={wr} people={data.craftspeople} absences={[]} freezes={[]} update={vi.fn()} onClose={close} />);
    expect(screen.getByText("2026-11-09T08:00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "📍 Show in Calendar" }));
    expect(close).toHaveBeenCalledOnce();
    const url = new URL(navigation.push.mock.calls[0][0], "http://localhost");
    expect(url.pathname).toBe("/scheduler");
    expect(Object.fromEntries(url.searchParams)).toEqual({ focusWrId: wr.WR_ID, focusCraftpersonId: person.id, focusStart: "2026-11-09T08:00", isolateWr: "true" });
  });
  it("creates editable labor for a scheduled assignment and unassigns it", () => {
    let updated: BaseWorkRequest = wr;
    const update = (change: (current: BaseWorkRequest) => BaseWorkRequest) => { updated = change(updated); };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<WorkRequestLabor wr={wr} people={data.craftspeople} absences={[]} freezes={[]} update={update} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(`Actual minutes ${person.Name}`), { target: { value: "75" } });
    expect(updated.CraftpersonLabor?.[0]).toMatchObject({ craftpersonId: person.id, workingTimeMinutes: 75 });
    fireEvent.click(screen.getByRole("button", { name: "✕ Unassign" }));
    expect(updated.AssignedCraftpersonIds).not.toContain(person.id);
    expect(updated.CraftpersonLabor?.[0].workingTimeMinutes).toBe(75);
  });
});

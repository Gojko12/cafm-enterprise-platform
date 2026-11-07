import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AbsenceForm } from "../../../web-portal/components/modules/AbsenceForm";

vi.mock("@cafm/shared-schema", () => ({}));
afterEach(cleanup);

describe("absence form with unavailable shared schema export", () => {
  const person = { id: "p1", SiteId: "SITE-01" as const, Name: "Eva", LastName: "Example", Trade: "Mechanical", HourlyRate: 30, ShiftHours: 8, SkillLevel: 1 };
  it("saves a vacation without accessing the missing shared schema", () => {
    const save = vi.fn();
    render(<AbsenceForm people={[person]} initial="p1" existing={null} site="SITE-01" date="2026-11-09" onClose={vi.fn()} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Save absence" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ craftpersonId: "p1", absenceType: "Vacation", isFullDay: true }));
  });
  it("saves partial training and rejects reversed time ranges", () => {
    const save = vi.fn();
    render(<AbsenceForm people={[person]} initial="p1" existing={null} site="SITE-01" date="2026-11-09" onClose={vi.fn()} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "Training" } });
    fireEvent.click(screen.getByLabelText("Full day"));
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save absence" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save absence" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ absenceType: "Training", startTime: "09:00", endTime: "13:00", unavailableHoursPerDay: 4 }));
  });
});

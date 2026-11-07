import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AssignmentLocatorDialog } from "../../../web-portal/components/modules/AssignmentLocatorDialog";
import { section20Seed } from "../../../web-portal/lib/section20-seed";

afterEach(cleanup);

describe("assignment locator dialog", () => {
  it("lists each scheduled craftsperson, time and trade and targets the chosen assignment", () => {
    const seed = section20Seed(["SITE-01"]);
    const request = seed.workRequests[0];
    const select = vi.fn();
    render(<AssignmentLocatorDialog request={request} people={seed.craftspeople} onSelect={select} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Which assignment do you want to see?" });
    const person = seed.craftspeople.find((item) => item.id === request.AssignedCraftpersonIds[1])!;
    const option = within(dialog).getByRole("button", { name: new RegExp(person.Name) });
    expect(option.textContent).toContain(person.Trade);
    expect(option.textContent).toContain("2026-11-10 09:00");
    fireEvent.click(option);
    expect(select).toHaveBeenCalledWith(person.id);
  });
});

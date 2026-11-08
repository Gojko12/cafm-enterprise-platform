import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ResizableHistory } from "../../../web-portal/components/common/ResizableHistory";

afterEach(cleanup);

describe("resizable history", () => {
  it("starts compact and expands, restores and supports keyboard resizing", () => {
    render(<ResizableHistory><div>History contents</div></ResizableHistory>);
    const panel = screen.getByText("History contents").parentElement!.parentElement!;
    expect(panel.style.height).toBe("190px");
    fireEvent.click(screen.getByRole("button", { name: "↕ Expand" }));
    expect(panel.style.height).toBe("75%");
    fireEvent.click(screen.getByRole("button", { name: "↕ Restore" }));
    expect(panel.style.height).toBe("190px");
    Object.defineProperty(panel, "getBoundingClientRect", { value: () => ({ height: 190 }) });
    Object.defineProperty(panel.parentElement, "clientHeight", { value: 800 });
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize history" }), { key: "ArrowUp" });
    expect(panel.style.height).toBe("210px");
  });
});

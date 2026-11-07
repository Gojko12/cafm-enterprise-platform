import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MultiSelectFilter } from "../../../web-portal/components/common/MultiSelectFilter";

afterEach(cleanup);

function Example() {
  const [selected, setSelected] = useState<string[] | null>(null);
  return <MultiSelectFilter label="Buildings" options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]} value={selected} onChange={setSelected} />;
}

describe("multi-select filter", () => {
  it("supports searching, selecting, clearing and selecting all", () => {
    render(<Example />);
    fireEvent.click(screen.getByText("Buildings (All)"));
    fireEvent.click(screen.getByLabelText("Alpha"));
    expect(screen.getByText("Buildings (1 selected)")).toBeTruthy();
    expect(screen.getByLabelText("Beta")).toHaveProperty("checked", true);
    fireEvent.change(screen.getByLabelText("Search Buildings"), { target: { value: "alpha" } });
    expect(screen.queryByLabelText("Beta")).toBeNull();
    fireEvent.click(screen.getByLabelText("Alpha"));
    expect(screen.getByText("Buildings (2 selected)")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByText("Buildings (0 selected)")).toBeTruthy();
    fireEvent.click(screen.getByText("Select All"));
    expect(screen.getByText("Buildings (All)")).toBeTruthy();
  });
});

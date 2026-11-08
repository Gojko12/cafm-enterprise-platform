import { describe, expect, it } from "vitest";
import { newestFirst } from "../../../web-portal/lib/history-order";

describe("history ordering", () => {
  it("orders by instant, not insertion or timestamp string, without mutating the source", () => {
    const records = [{ id: "middle", time: "2026-11-08T10:00:00+02:00" }, { id: "new", time: "2026-11-08T08:30:00Z" }, { id: "old", time: "2026-11-08T07:00:00Z" }];
    expect(newestFirst(records, (row) => row.time).map((row) => row.id)).toEqual(["new", "middle", "old"]);
    expect(records.map((row) => row.id)).toEqual(["middle", "new", "old"]);
  });
});

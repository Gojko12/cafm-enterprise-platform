import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseWorkRequest } from "@cafm/shared-schema";

const mocks = vi.hoisted(() => {
  const putWorkRequest = vi.fn();
  const putMutation = vi.fn();
  const put = vi.fn();
  const getAllFromIndex = vi.fn();
  const get = vi.fn();
  const transaction = vi.fn((stores: string[], mode: string) => ({
    objectStore: (name: string) => ({
      put: name === "workRequests" ? putWorkRequest : putMutation,
    }),
    done: Promise.resolve(),
  }));
  return { putWorkRequest, putMutation, put, getAllFromIndex, get, transaction };
});

vi.mock("./db.js", () => ({
  getDB: async () => ({
    transaction: mocks.transaction,
    put: mocks.put,
    getAllFromIndex: mocks.getAllFromIndex,
    get: mocks.get,
  }),
}));

import { OfflineEngine } from "./offline-engine";

describe("offline sync safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllFromIndex.mockResolvedValue([]);
    mocks.get.mockResolvedValue(undefined);
  });

  it("queues a work request in the same transaction even when offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValueOnce(false);
    const engine = new OfflineEngine();
    const wr = { WR_ID: "WR-1" } as BaseWorkRequest;

    await engine.saveWorkRequest(wr);

    expect(mocks.transaction).toHaveBeenCalledWith(["workRequests", "syncQueue"], "readwrite");
    expect(mocks.putWorkRequest).toHaveBeenCalledWith(wr);
    expect(mocks.putMutation).toHaveBeenCalledWith(
      expect.objectContaining({ MutationType: "WR_UPDATE", Payload: wr, SyncStatus: "PENDING" }),
    );
  });

  it("leaves photos pending rather than marking an unuploaded photo synced", async () => {
    const engine = new OfflineEngine();
    await engine.queuePhotoUpload("WR-1", "data:image/webp;base64,abc", 10, 5);
    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.put).toHaveBeenCalledWith("photoQueue", expect.objectContaining({ SyncStatus: "PENDING" }));
  });

  it("reports unavailable synchronization without acknowledging pending items", async () => {
    mocks.getAllFromIndex.mockImplementation(async (store: string) =>
      store === "syncQueue" ? [{ QueueId: "Q1", SyncStatus: "PENDING" }] : [],
    );
    const engine = new OfflineEngine();
    const listener = vi.fn();
    engine.onSyncStatusChange(listener);

    await expect(engine.syncNow()).rejects.toThrow("Synchronization is not configured");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ pending: 1, synced: 0 }));
    expect(mocks.put).not.toHaveBeenCalled();
  });
});

import { getDB } from "./db.js";
import { BaseWorkRequest, Building, Floor, Room, Equipment, SiteId } from "@cafm/shared-schema";
import { stable, synchronizePortal } from "./portal-sync";

/**
 * Generate UUID v4
 */
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Compresses images to WebP or JPEG with quality degradation before queuing
 */
export async function compressPhoto(
  dataUrl: string,
  maxWidthPx: number = 800,
  maxHeightPx: number = 800,
  quality: number = 0.7,
): Promise<{ compressedDataUrl: string; originalSizeKB: number; compressedSizeKB: number }> {
  const originalSize = new Blob([dataUrl]).size / 1024;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxWidthPx || height > maxHeightPx) {
        const ratio = Math.min(maxWidthPx / width, maxHeightPx / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) reject(new Error("Could not get canvas context"));
      else {
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL("image/webp", quality);
        const compressedSize = new Blob([compressedDataUrl]).size / 1024;

        resolve({
          compressedDataUrl,
          originalSizeKB: originalSize,
          compressedSizeKB: compressedSize,
        });
      }
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = dataUrl;
  });
}

/**
 * Core offline persistence & synchronization engine
 */
export class OfflineEngine {
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private syncFinished: Promise<void> | null = null;
  private site: SiteId = "02-ESOC";
  private person = "TECH-001";
  private simulatedOffline = false;
  private syncAbort: AbortController | null = null;
  private onlineChangeListeners: Array<(isOnline: boolean) => void> = [];
  private syncStatusListeners: Array<(status: SyncStatus) => void> = [];

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.setOnline(true));
      window.addEventListener("offline", () => this.setOnline(false));
    }
  }

  private setOnline(online: boolean): void {
    this.isOnline = online;
    this.onlineChangeListeners.forEach((listener) => listener(online));
    if (online) {
      void this.syncNow().catch((error) => console.error("Background sync failed:", error));
    }
  }

  onOnlineStatusChange(listener: (isOnline: boolean) => void): void {
    this.onlineChangeListeners.push(listener);
  }

  onSyncStatusChange(listener: (status: SyncStatus) => void): void {
    this.syncStatusListeners.push(listener);
  }

  configureSync(site: SiteId, person: string, simulatedOffline = false): void {
    if (simulatedOffline || site !== this.site || person !== this.person) this.syncAbort?.abort();
    this.site = site;
    this.person = person;
    this.simulatedOffline = simulatedOffline;
  }

  /**
   * Write work request to local persistence
   */
  async saveWorkRequest(input: BaseWorkRequest, expectedBase?: BaseWorkRequest | null): Promise<void> {
    await this.saveWorkRequests([{ input, expectedBase }]);
  }

  async saveWorkRequests(changes: Array<{ input: BaseWorkRequest; expectedBase?: BaseWorkRequest | null }>): Promise<void> {
    const stampedAt = new Date().toISOString();
    const db = await getDB();
    const tx = db.transaction(["workRequests", "syncQueue"], "readwrite");
    for (const { input, expectedBase } of changes) {
      const wr: BaseWorkRequest = { ...input, updatedAt: stampedAt, UpdatedAt: stampedAt };
      const previous = await tx.objectStore("workRequests").get(wr.WR_ID);
      if (expectedBase !== undefined && stable(previous ?? null) !== stable(expectedBase)) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new Error(`Work request ${wr.WR_ID} changed while it was being edited. Your edits were not saved.`);
      }
      await tx.objectStore("workRequests").put(wr);
      await tx.objectStore("syncQueue").put({
        QueueId: uuidv4(),
        MutationType: "WR_UPDATE",
        Payload: wr,
        BaseWorkRequest: previous ?? null,
        SyncStatus: "PENDING",
        CreatedAt: stampedAt,
        RetryCount: 0,
      });
    }
    await tx.done;
  }

  /**
   * Retrieve work requests with optional filters
   */
  async getWorkRequests(filters?: {
    bl_id?: string;
    trade?: string;
    assignedToUser?: string;
  }): Promise<BaseWorkRequest[]> {
    const db = await getDB();
    let results: BaseWorkRequest[] = [];

    if (filters?.bl_id && filters?.trade) {
      const blResults = await db.getAllFromIndex("workRequests", "by-bl_id", filters.bl_id);
      results = blResults.filter((wr) => wr.TradeName === filters.trade);
    } else if (filters?.bl_id) {
      results = await db.getAllFromIndex("workRequests", "by-bl_id", filters.bl_id);
    } else if (filters?.trade) {
      results = await db.getAllFromIndex("workRequests", "by-trade", filters.trade);
    } else if (filters?.assignedToUser) {
      results = await db.getAll("workRequests");
      results = results.filter((wr) => wr.AssignedUserIds?.includes(filters.assignedToUser));
    } else {
      results = await db.getAll("workRequests");
    }

    return results;
  }

  /**
   * Retrieve single work request
   */
  async getWorkRequest(wrId: string): Promise<BaseWorkRequest | undefined> {
    const db = await getDB();
    return db.get("workRequests", wrId);
  }

  /**
   * Save building
   */
  async saveBuilding(building: Building): Promise<void> {
    const db = await getDB();
    await db.put("buildings", building);
  }

  /**
   * Get all buildings
   */
  async getBuildings(): Promise<Building[]> {
    const db = await getDB();
    return db.getAll("buildings");
  }

  /**
   * Save floor
   */
  async saveFloor(floor: Floor): Promise<void> {
    const db = await getDB();
    await db.put("floors", floor);
  }

  /**
   * Get floors for building
   */
  async getFloors(bl_id: string): Promise<Floor[]> {
    const db = await getDB();
    return db.getAllFromIndex("floors", "by-bl_id", bl_id);
  }

  /**
   * Save room
   */
  async saveRoom(room: Room): Promise<void> {
    const db = await getDB();
    await db.put("rooms", room);
  }

  /**
   * Get rooms for building/floor
   */
  async getRooms(bl_id: string, levelName: string): Promise<Room[]> {
    const db = await getDB();
    const all = await db.getAll("rooms");
    return all.filter((r) => r.bl_id === bl_id && r.LevelName === levelName);
  }

  /**
   * Save equipment
   */
  async saveEquipment(equipment: Equipment): Promise<void> {
    const db = await getDB();
    await db.put("equipment", equipment);
  }

  /**
   * Get equipment for location
   */
  async getEquipment(bl_id?: string, levelName?: string, roomCode?: string): Promise<Equipment[]> {
    const db = await getDB();
    if (bl_id && levelName && roomCode) {
      const all = await db.getAll("equipment");
      return all.filter((e) => e.bl_id === bl_id && e.LevelName === levelName && e.RoomCode === roomCode);
    } else if (bl_id && levelName) {
      const all = await db.getAll("equipment");
      return all.filter((e) => e.bl_id === bl_id && e.LevelName === levelName);
    } else if (bl_id) {
      const all = await db.getAll("equipment");
      return all.filter((e) => e.bl_id === bl_id);
    }
    return db.getAll("equipment");
  }

  /**
   * Queue photo for sync
   */
  async queuePhotoUpload(
    wrId: string,
    compressedDataUrl: string,
    originalSizeKB: number,
    compressedSizeKB: number,
    stepId?: string,
  ): Promise<string> {
    const db = await getDB();
    const queueId = uuidv4();

    const entry = {
      QueueId: queueId,
      WR_ID: wrId,
      StepId: stepId,
      OriginalSizeKB: originalSizeKB,
      CompressedSizeKB: compressedSizeKB,
      CompressedDataUrl: compressedDataUrl,
      SyncStatus: "PENDING" as const,
      CreatedAt: new Date().toISOString(),
    };

    await db.put("photoQueue", entry);

    return queueId;
  }

  /**
   * Get pending photo queue entries
   */
  async getPendingPhotos(): Promise<
    Array<{ QueueId: string; WR_ID: string; CompressedSizeKB: number }>
  > {
    const db = await getDB();
    const all = await db.getAllFromIndex("photoQueue", "by-status", "PENDING");
    return all.map((p) => ({
      QueueId: p.QueueId,
      WR_ID: p.WR_ID,
      CompressedSizeKB: p.CompressedSizeKB,
    }));
  }

  /**
   * Get pending sync mutations
   */
  async getPendingSyncItems(): Promise<number> {
    const db = await getDB();
    const items = await db.getAllFromIndex("syncQueue", "by-status", "PENDING");
    return items.length;
  }

  async clearPendingQueue(): Promise<number> {
    const db = await getDB();
    const tx = db.transaction(["syncQueue", "photoQueue"], "readwrite");
    const [mutations, photos] = await Promise.all([
      tx.objectStore("syncQueue").index("by-status").getAll("PENDING"),
      tx.objectStore("photoQueue").index("by-status").getAll("PENDING"),
    ]);
    for (const item of mutations) await tx.objectStore("syncQueue").delete(item.QueueId);
    for (const item of photos) await tx.objectStore("photoQueue").delete(item.QueueId);
    await tx.done;
    return mutations.length + photos.length;
  }

  private async coalescePendingWorkRequestUpdates(db: Awaited<ReturnType<typeof getDB>>): Promise<void> {
    const tx = db.transaction("syncQueue", "readwrite");
    const pending = await tx.store.index("by-status").getAll("PENDING");
    const groups = new Map<string, typeof pending>();
    for (const item of pending) {
      if (item.MutationType !== "WR_UPDATE" || typeof item.Payload.WR_ID !== "string" || typeof item.Payload.SiteId !== "string") continue;
      const key = JSON.stringify([item.Payload.SiteId, item.Payload.WR_ID]);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const syncedAt = new Date().toISOString();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.CreatedAt.localeCompare(b.CreatedAt) || a.QueueId.localeCompare(b.QueueId));
      const first = group[0], latest = group[group.length - 1];
      await tx.store.put({ ...latest, BaseWorkRequest: first.BaseWorkRequest ?? null });
      for (const item of group.slice(0, -1)) await tx.store.put({ ...item, SyncStatus: "SYNCED", SyncedAt: syncedAt });
    }
    await tx.done;
  }

  async queueMutation(
    mutationType: "STEP_COMPLETE" | "SESSION_LOG",
    payload: Record<string, unknown>,
  ): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(["workRequests", "syncQueue"], "readwrite");
    const wrId = payload.WR_ID;
    const baseline = mutationType === "STEP_COMPLETE" && typeof wrId === "string"
      ? await tx.objectStore("workRequests").get(wrId) : undefined;
    await tx.objectStore("syncQueue").put({
      QueueId: uuidv4(),
      MutationType: mutationType,
      Payload: payload,
      ...(mutationType === "STEP_COMPLETE" ? { BaseWorkRequest: baseline ?? null } : {}),
      SyncStatus: "PENDING",
      CreatedAt: new Date().toISOString(),
      RetryCount: 0,
    });
    await tx.done;
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<string | null> {
    const db = await getDB();
    const metadata = await db.get("syncMetadata", "lastSyncTime");
    return metadata?.value || null;
  }

  /**
   * Sync all pending mutations
   */
  async syncNow(workRequestId?: string): Promise<SyncStatus> {
    if (this.syncInProgress) {
      throw new Error("Synchronization is already in progress.");
    }

    this.syncInProgress = true;
    const controller = new AbortController();
    this.syncAbort = controller;
    let finishSync!: () => void;
    this.syncFinished = new Promise<void>((resolve) => { finishSync = resolve; });
    const status: SyncStatus = { synced: 0, failed: 0, pending: 0, lastSyncTime: null };

    try {
      const db = await getDB();
      await this.coalescePendingWorkRequestUpdates(db);
      const allSyncItems = await db.getAllFromIndex("syncQueue", "by-status", "PENDING");
      const allPhotoItems = await db.getAllFromIndex("photoQueue", "by-status", "PENDING");
      const syncItems = workRequestId ? allSyncItems.filter((item) => item.Payload.WR_ID === workRequestId) : allSyncItems;
      const photoItems = workRequestId ? allPhotoItems.filter((item) => item.WR_ID === workRequestId) : allPhotoItems;
      status.pending = allSyncItems.length + allPhotoItems.length;
      status.lastSyncTime = await this.getLastSyncTime();
      this.syncStatusListeners.forEach((listener) => listener(status));
      if (this.simulatedOffline || !this.isOnline) {
        throw new Error("Device is offline. Changes remain on this device.");
      }
      const result = await synchronizePortal(db, this.site, this.person, syncItems, photoItems, controller.signal);
      status.synced = result.synced;
      if (workRequestId) {
        const [remainingItems, remainingPhotos] = await Promise.all([
          db.getAllFromIndex("syncQueue", "by-status", "PENDING"),
          db.getAllFromIndex("photoQueue", "by-status", "PENDING"),
        ]);
        status.pending = remainingItems.filter((item) => item.Payload.WR_ID === workRequestId).length +
          remainingPhotos.filter((item) => item.WR_ID === workRequestId).length;
      } else status.pending = result.pending;
      status.lastSyncTime = result.lastSyncTime;
      this.syncStatusListeners.forEach((listener) => listener(status));
      return status;
    } finally {
      this.syncInProgress = false;
      this.syncAbort = null;
      this.syncFinished = null;
      finishSync();
    }
  }

  async syncAfterChanges(workRequestId?: string): Promise<SyncStatus> {
    while (this.syncFinished) await this.syncFinished;
    return this.syncNow(workRequestId);
  }

  isOnlineNow(): boolean {
    return this.isOnline;
  }
}

export interface SyncStatus {
  synced: number;
  failed: number;
  pending: number;
  lastSyncTime: string | null;
}

let offlineEngineInstance: OfflineEngine | null = null;

export function initOfflineEngine(): OfflineEngine {
  if (!offlineEngineInstance) {
    offlineEngineInstance = new OfflineEngine();
  }
  return offlineEngineInstance;
}

export function getOfflineEngine(): OfflineEngine {
  if (!offlineEngineInstance) {
    throw new Error("OfflineEngine not initialized. Call initOfflineEngine() first.");
  }
  return offlineEngineInstance;
}

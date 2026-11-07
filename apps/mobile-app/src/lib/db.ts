/// <reference types="vite/client" />
import { openDB, DBSchema, IDBPDatabase } from "idb";
import { createMemoryDatabase } from "./memory-db";
import {
  BaseWorkRequest,
  Building,
  Floor,
  Room,
  Equipment,
  PM_ChecklistStandard,
  PM_Schedule,
} from "@cafm/shared-schema";

export interface PM_StepPhoto {
  StepId: string;
  PhotoUrl: string;
  CompressedSizeKB: number;
  TakenAt: string;
  TechnicianComment: string;
}

export interface PM_StepAuditLogEntry {
  AuditId: string;
  StepId: string;
  WR_ID: string;
  Action: "START" | "PASS" | "FAIL" | "UPDATE_VALUE" | "PHOTO_ADDED" | "COMMENT_ADDED";
  Result?: string | number | boolean;
  TechnicianId: string;
  Timestamp: string;
  ImmutableChecksum: string;
}

export interface WorkSessionEntry {
  SessionId: string;
  WR_ID: string;
  TechnicianId?: string;
  StartedAt: string;
  PausedAt?: string;
  ResumedAt?: string;
  PausedDurationMs?: number;
  StoppedAt?: string;
  TotalTimeMinutes: number;
  TimerOverrideReason?: string;
  Status: "RUNNING" | "PAUSED" | "STOPPED";
}

export interface OfflinePhotoQueueEntry {
  QueueId: string;
  WR_ID: string;
  StepId?: string;
  OriginalSizeKB: number;
  CompressedSizeKB: number;
  CompressedDataUrl: string;
  SyncStatus: "PENDING" | "SYNCED" | "FAILED";
  CreatedAt: string;
  SyncedAt?: string;
  ErrorMessage?: string;
}

export interface SyncQueueEntry {
  QueueId: string;
  MutationType: "WR_UPDATE" | "WR_ASSIGNMENT" | "STEP_COMPLETE" | "PHOTO_UPLOAD" | "SESSION_LOG";
  Payload: Record<string, unknown>;
  BaseWorkRequest?: BaseWorkRequest | null;
  SyncStatus: "PENDING" | "SYNCED" | "FAILED";
  CreatedAt: string;
  SyncedAt?: string;
  ErrorMessage?: string;
  RetryCount: number;
}

export interface MobileAppDB extends DBSchema {
  workRequests: {
    key: string;
    value: BaseWorkRequest;
    indexes: {
      "by-bl_id": string;
      "by-trade": string;
      "by-status": string;
      "by-assigned": string;
    };
  };
  buildings: {
    key: string;
    value: Building;
  };
  floors: {
    key: [string, string];
    value: Floor;
    indexes: {
      "by-bl_id": string;
    };
  };
  rooms: {
    key: [string, string, string];
    value: Room;
    indexes: {
      "by-location": [string, string];
    };
  };
  equipment: {
    key: string;
    value: Equipment;
    indexes: {
      "by-location": [string, string, string];
      "by-trade": string;
    };
  };
  checklists: {
    key: string;
    value: PM_ChecklistStandard;
  };
  schedules: {
    key: string;
    value: PM_Schedule;
  };
  stepAuditLog: {
    key: string;
    value: PM_StepAuditLogEntry;
    indexes: {
      "by-wr": string;
      "by-timestamp": string;
    };
  };
  photoQueue: {
    key: string;
    value: OfflinePhotoQueueEntry;
    indexes: {
      "by-status": string;
      "by-wr": string;
    };
  };
  workSessions: {
    key: string;
    value: WorkSessionEntry;
    indexes: {
      "by-wr": string;
      "by-status": string;
    };
  };
  syncQueue: {
    key: string;
    value: SyncQueueEntry;
    indexes: {
      "by-status": string;
      "by-type": string;
    };
  };
  syncMetadata: {
    key: string;
    value: {
      key: "lastSyncTime" | "syncInProgress" | "conflictCount";
      value: string;
      updatedAt: string;
    };
  };
}

let db: IDBPDatabase<MobileAppDB> | null = null;

async function initDB(): Promise<IDBPDatabase<MobileAppDB>> {
  if (db) return db;

  if (typeof indexedDB === "undefined") {
    if (import.meta.env.MODE !== "test") {
      throw new Error("IndexedDB is unavailable; offline data cannot be saved.");
    }
    db = createMemoryDatabase();
    return db;
  }

  db = await openDB<MobileAppDB>("cafm-mobile-app-db", 1, {
    upgrade(db) {
      // Work Requests
      if (!db.objectStoreNames.contains("workRequests")) {
        const wrStore = db.createObjectStore("workRequests", { keyPath: "WR_ID" });
        wrStore.createIndex("by-bl_id", "bl_id");
        wrStore.createIndex("by-trade", "TradeName");
        wrStore.createIndex("by-status", "Percentage");
        wrStore.createIndex("by-assigned", "AssignedUserIds");
      }

      // Buildings
      if (!db.objectStoreNames.contains("buildings")) {
        db.createObjectStore("buildings", { keyPath: "bl_id" });
      }

      // Floors
      if (!db.objectStoreNames.contains("floors")) {
        const floorStore = db.createObjectStore("floors", { keyPath: ["bl_id", "LevelName"] });
        floorStore.createIndex("by-bl_id", "bl_id");
      }

      // Rooms
      if (!db.objectStoreNames.contains("rooms")) {
        const roomStore = db.createObjectStore("rooms", {
          keyPath: ["bl_id", "LevelName", "RoomCode"],
        });
        roomStore.createIndex("by-location", ["bl_id", "LevelName"]);
      }

      // Equipment
      if (!db.objectStoreNames.contains("equipment")) {
        const equipStore = db.createObjectStore("equipment", { keyPath: "EquipmentCode" });
        equipStore.createIndex("by-location", ["bl_id", "LevelName", "RoomCode"]);
        equipStore.createIndex("by-trade", "PrimaryTradeId");
      }

      // Checklists
      if (!db.objectStoreNames.contains("checklists")) {
        db.createObjectStore("checklists", { keyPath: "ChecklistCode" });
      }

      // Schedules
      if (!db.objectStoreNames.contains("schedules")) {
        db.createObjectStore("schedules", { keyPath: "ScheduleId" });
      }

      // Step Audit Log
      if (!db.objectStoreNames.contains("stepAuditLog")) {
        const auditStore = db.createObjectStore("stepAuditLog", { keyPath: "AuditId" });
        auditStore.createIndex("by-wr", "WR_ID");
        auditStore.createIndex("by-timestamp", "Timestamp");
      }

      // Photo Queue
      if (!db.objectStoreNames.contains("photoQueue")) {
        const photoStore = db.createObjectStore("photoQueue", { keyPath: "QueueId" });
        photoStore.createIndex("by-status", "SyncStatus");
        photoStore.createIndex("by-wr", "WR_ID");
      }

      // Work Sessions
      if (!db.objectStoreNames.contains("workSessions")) {
        const sessionStore = db.createObjectStore("workSessions", { keyPath: "SessionId" });
        sessionStore.createIndex("by-wr", "WR_ID");
        sessionStore.createIndex("by-status", "Status");
      }

      // Sync Queue
      if (!db.objectStoreNames.contains("syncQueue")) {
        const syncStore = db.createObjectStore("syncQueue", { keyPath: "QueueId" });
        syncStore.createIndex("by-status", "SyncStatus");
        syncStore.createIndex("by-type", "MutationType");
      }

      // Sync Metadata
      if (!db.objectStoreNames.contains("syncMetadata")) {
        db.createObjectStore("syncMetadata", { keyPath: "key" });
      }
    },
  });

  return db;
}

export async function getDB(): Promise<IDBPDatabase<MobileAppDB>> {
  return initDB();
}

export async function clearAllData(): Promise<void> {
  const database = await getDB();
  const stores = [
    "workRequests",
    "buildings",
    "floors",
    "rooms",
    "equipment",
    "checklists",
    "schedules",
    "stepAuditLog",
    "photoQueue",
    "workSessions",
    "syncQueue",
    "syncMetadata",
  ] as const;

  for (const store of stores) {
    const tx = database.transaction(store as never, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}

export async function closeDB(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}

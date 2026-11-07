import type { IDBPDatabase } from "idb";
import type { MobileAppDB } from "./db";

type StoreName = keyof MobileAppDB;
const keys: Record<StoreName, string[]> = {
  workRequests: ["WR_ID"], buildings: ["bl_id"], floors: ["bl_id", "LevelName"],
  rooms: ["bl_id", "LevelName", "RoomCode"], equipment: ["EquipmentCode"],
  checklists: ["ChecklistCode"], schedules: ["ScheduleId"], stepAuditLog: ["AuditId"],
  photoQueue: ["QueueId"], workSessions: ["SessionId"], syncQueue: ["QueueId"],
  syncMetadata: ["key"],
};
const indexes: Partial<Record<StoreName, Record<string, string[]>>> = {
  workRequests: { "by-bl_id": ["bl_id"], "by-trade": ["TradeName"], "by-status": ["Percentage"], "by-assigned": ["AssignedUserIds"] },
  floors: { "by-bl_id": ["bl_id"] }, rooms: { "by-location": ["bl_id", "LevelName"] },
  equipment: { "by-location": ["bl_id", "LevelName", "RoomCode"], "by-trade": ["PrimaryTradeId"] },
  stepAuditLog: { "by-wr": ["WR_ID"], "by-timestamp": ["Timestamp"] },
  photoQueue: { "by-status": ["SyncStatus"], "by-wr": ["WR_ID"] },
  workSessions: { "by-wr": ["WR_ID"], "by-status": ["Status"] },
  syncQueue: { "by-status": ["SyncStatus"], "by-type": ["MutationType"] },
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const serializeKey = (key: unknown) => JSON.stringify(key);
const stores = new Map<StoreName, Map<string, Record<string, unknown>>>();
for (const name of Object.keys(keys) as StoreName[]) stores.set(name, new Map());

function getStore(name: StoreName) {
  const store = stores.get(name);
  if (!store) throw new Error(`Unknown store: ${name}`);
  return store;
}

function keyFor(name: StoreName, value: Record<string, unknown>) {
  const parts = keys[name].map((key) => value[key]);
  if (parts.some((part) => part === undefined || part === null)) throw new Error(`Missing key for ${name}`);
  return serializeKey(parts.length === 1 ? parts[0] : parts);
}

function storeApi(name: StoreName) {
  const store = getStore(name);
  return {
    async put(value: Record<string, unknown>) {
      const key = keyFor(name, value);
      store.set(key, clone(value));
      return key;
    },
    async clear() { store.clear(); },
    async delete(key: unknown) { store.delete(serializeKey(key)); },
  };
}

// Only the methods used by this application are exposed; production always uses IndexedDB.
export function createMemoryDatabase(): IDBPDatabase<MobileAppDB> {
  const memory = {
    async put(name: StoreName, value: Record<string, unknown>) { return storeApi(name).put(value); },
    async get(name: StoreName, key: unknown) {
      const value = getStore(name).get(serializeKey(key));
      return value === undefined ? undefined : clone(value);
    },
    async getAll(name: StoreName) { return [...getStore(name).values()].map(clone); },
    async getAllFromIndex(name: StoreName, index: string, key: unknown) {
      const fields = indexes[name]?.[index];
      if (!fields) throw new Error(`Unknown index ${name}.${index}`);
      return [...getStore(name).values()].filter((value) => {
        const parts = fields.map((field) => value[field]);
        const candidate = parts.length === 1 ? parts[0] : parts;
        return serializeKey(candidate) === serializeKey(key);
      }).map(clone);
    },
    transaction(names: StoreName | StoreName[]) {
      const selected = Array.isArray(names) ? names : [names];
      return {
        objectStore(name: StoreName) {
          if (!selected.includes(name)) throw new Error(`Store ${name} is not in this transaction`);
          return storeApi(name);
        },
        store: storeApi(selected[0]),
        done: Promise.resolve(),
      };
    },
    close() {},
  };
  return memory as unknown as IDBPDatabase<MobileAppDB>;
}

"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { BaseWorkRequest, Building, Equipment, Floor, PM_ChecklistStandard, PM_Schedule, Room } from "@cafm/shared-schema";
import {
  ESOC_BUILDINGS, ESOC_EQUIPMENT, ESOC_FLOORS, ESOC_ROOMS,
  ESTEC_BUILDINGS, ESTEC_EQUIPMENT, ESTEC_FLOORS, ESTEC_ROOMS,
  ESRIN_BUILDINGS, ESRIN_EQUIPMENT, ESRIN_FLOORS, ESRIN_ROOMS,
  SAMPLE_WORK_REQUESTS,
} from "@/lib/seed-data";

interface DemoData {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  equipment: Equipment[];
  blueprints: PM_ChecklistStandard[];
  schedules: PM_Schedule[];
  workRequests: BaseWorkRequest[];
}

const STORAGE_KEY = "cafm-demo-data-v1";

function seedData(): DemoData {
  return {
    buildings: [...ESOC_BUILDINGS, ...ESTEC_BUILDINGS, ...ESRIN_BUILDINGS],
    floors: [...ESOC_FLOORS, ...ESTEC_FLOORS, ...ESRIN_FLOORS],
    rooms: [...ESOC_ROOMS, ...ESTEC_ROOMS, ...ESRIN_ROOMS],
    equipment: [...ESOC_EQUIPMENT, ...ESTEC_EQUIPMENT, ...ESRIN_EQUIPMENT],
    blueprints: [],
    schedules: [],
    workRequests: [...SAMPLE_WORK_REQUESTS],
  };
}

interface Store {
  data: DemoData;
  setData: React.Dispatch<React.SetStateAction<DemoData>>;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function CafmStoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DemoData>(seedData);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!parsed || typeof parsed !== "object" ||
            !Object.keys(seedData()).every((key) => Array.isArray((parsed as Record<string, unknown>)[key]))) {
          throw new Error("Stored demo data has an invalid format.");
        }
        setData(parsed as DemoData);
      }
    } catch (error) {
      console.error("Could not load demo data", error);
      window.alert("Could not load saved demo data. The saved data was not overwritten; reset demo data to recover.");
      return;
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Could not save demo data", error);
      window.alert("Could not save demo data to local storage.");
    }
  }, [data, ready]);

  const reset = () => {
    if (!window.confirm("Reset all saved demo data? This cannot be undone.")) return;
    setData(seedData());
    setReady(true);
  };

  return <StoreContext.Provider value={{ data, setData, reset }}>{children}</StoreContext.Provider>;
}

export function useCafmStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useCafmStore must be used within CafmStoreProvider");
  return store;
}

import { z } from "zod";

export const GeoJSONPositionSchema = z
  .tuple([z.number(), z.number()])
  .or(z.tuple([z.number(), z.number(), z.number()]));

export const GeoJSONLinearRingSchema = z
  .array(GeoJSONPositionSchema)
  .min(4)
  .superRefine((positions, context) => {
    const first = positions[0];
    const last = positions[positions.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A GeoJSON polygon ring must be closed.",
      });
    }
  });

export const GeoJSONPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(GeoJSONLinearRingSchema).min(1),
});

export const GPSCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevationMeters: z.number().optional(),
});

export const PLATFORM_SITE_IDS = ["01-ESTEC", "02-ESOC", "03-HQ", "04-ESRIN", "05-ESAC"] as const;
// Internal seed keys and pre-migration persisted IDs; always rewritten to platform IDs by migrateLegacySiteIds.
export const LEGACY_SITE_IDS = ["SITE-01", "SITE-02", "SITE-03", "SITE-04", "SITE-05"] as const;
export const SiteIdSchema = z.enum([...PLATFORM_SITE_IDS, ...LEGACY_SITE_IDS]);
export type SiteId = z.infer<typeof SiteIdSchema>;

export const LEGACY_SITE_MAP: Record<string, SiteId> = {
  "SITE-01": "02-ESOC", "SITE-02": "01-ESTEC", "SITE-03": "04-ESRIN", "SITE-04": "03-HQ", "SITE-05": "05-ESAC",
};
export const LEGACY_SITE_ALIAS: Record<string, string> = Object.fromEntries(Object.entries(LEGACY_SITE_MAP).map(([legacy, id]) => [id, legacy]));
export const SITE_LABELS: Record<SiteId, string> = {
  "01-ESTEC": "01-ESTEC · Noordwijk", "02-ESOC": "02-ESOC · Darmstadt", "03-HQ": "03-HQ · Paris", "04-ESRIN": "04-ESRIN · Frascati", "05-ESAC": "05-ESAC · Madrid",
  "SITE-01": "02-ESOC · Darmstadt", "SITE-02": "01-ESTEC · Noordwijk", "SITE-03": "04-ESRIN · Frascati", "SITE-04": "03-HQ · Paris", "SITE-05": "05-ESAC · Madrid",
};
export const SITE_CITIES: Record<string, string> = {
  "01-ESTEC": "Noordwijk, Netherlands", "02-ESOC": "Darmstadt, Germany", "03-HQ": "Paris, France", "04-ESRIN": "Frascati, Italy", "05-ESAC": "Madrid, Spain",
};

export function normalizeSiteId(value: string | null | undefined): SiteId | undefined {
  if (!value) return undefined;
  const mapped = LEGACY_SITE_MAP[value] ?? value;
  return (PLATFORM_SITE_IDS as readonly string[]).includes(mapped) ? mapped as SiteId : undefined;
}

// Deep-rewrites any string value that is exactly a legacy site ID (opaque IDs that merely start with it are left untouched).
export function migrateLegacySiteIds<T>(value: T): T {
  if (typeof value === "string") return (LEGACY_SITE_MAP[value] ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => migrateLegacySiteIds(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [LEGACY_SITE_MAP[key] ?? key, migrateLegacySiteIds(item)])) as T;
  }
  return value;
}

export const BuildingSchema = z.object({
  bl_id: z.string().min(1),
  SiteId: SiteIdSchema,
  Name: z.string().min(1),
  Address: z.string().min(1),
  GPSCoordinates: GPSCoordinatesSchema.optional(),
  IsActive: z.boolean().default(true),
  CreatedAt: z.string().min(1).optional(),
  UpdatedAt: z.string().min(1).optional(),
});

export const FloorSchema = z.object({
  bl_id: z.string().min(1),
  SiteId: SiteIdSchema,
  LevelName: z.string().min(1),
  FloorNumber: z.number().int(),
  GrossAreaM2: z.number().nonnegative().optional(),
  FloorPlanUrl: z.string().url().optional(),
  FloorPlanFormat: z.enum(["DWG", "DXF", "SVG", "GEOJSON"]).optional(),
  IsActive: z.boolean().default(true),
});

export const RoomSchema = z.object({
  bl_id: z.string().min(1),
  SiteId: SiteIdSchema,
  LevelName: z.string().min(1),
  RoomCode: z.string().min(1),
  Name: z.string().min(1),
  RoomCategory: z.string().min(1).optional(),
  Usage: z.string().min(1).optional(),
  NetAreaM2: z.number().nonnegative().optional(),
  Department: z.string().optional(),
  CostCenter: z.string().optional(),
  Polygon: GeoJSONPolygonSchema.optional(),
  PolygonSource: z.enum(["Demo", "CAD", "CAD Sample"]).optional(),
  IsDeskReservable: z.boolean().default(false),
  IsActive: z.boolean().default(true),
});

export const LocationHierarchySchema = z.object({
  bl_id: z.string().min(1),
  LevelName: z.string().min(1),
  RoomCode: z.string().min(1).optional(),
});

export type GeoJSONPosition = z.infer<typeof GeoJSONPositionSchema>;
export type GeoJSONPolygon = z.infer<typeof GeoJSONPolygonSchema>;
export type Building = z.infer<typeof BuildingSchema>;
export type Floor = z.infer<typeof FloorSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type LocationHierarchy = z.infer<typeof LocationHierarchySchema>;

export function resolveFloorHierarchy(
  floor: Floor,
  building?: Building,
): Pick<Floor, "bl_id" | "LevelName"> {
  if (building && floor.bl_id !== building.bl_id) {
    throw new Error("The selected floor does not belong to the selected building.");
  }
  return { bl_id: floor.bl_id, LevelName: floor.LevelName };
}

export function resolveRoomHierarchy(room: Room, floor?: Floor): LocationHierarchy {
  if (floor && (room.bl_id !== floor.bl_id || room.LevelName !== floor.LevelName)) {
    throw new Error("The selected room does not belong to the selected floor and building.");
  }

  return {
    bl_id: room.bl_id,
    LevelName: room.LevelName,
    RoomCode: room.RoomCode,
  };
}

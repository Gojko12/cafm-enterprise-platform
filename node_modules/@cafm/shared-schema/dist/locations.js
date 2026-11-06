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
export const BuildingSchema = z.object({
    bl_id: z.string().min(1),
    Name: z.string().min(1),
    Address: z.string().min(1),
    GPSCoordinates: GPSCoordinatesSchema.optional(),
    IsActive: z.boolean().default(true),
    CreatedAt: z.string().min(1).optional(),
    UpdatedAt: z.string().min(1).optional(),
});
export const FloorSchema = z.object({
    bl_id: z.string().min(1),
    LevelName: z.string().min(1),
    FloorNumber: z.number().int(),
    GrossAreaM2: z.number().nonnegative().optional(),
    FloorPlanUrl: z.string().url().optional(),
    FloorPlanFormat: z.enum(["DWG", "DXF", "SVG", "GEOJSON"]).optional(),
    IsActive: z.boolean().default(true),
});
export const RoomSchema = z.object({
    bl_id: z.string().min(1),
    LevelName: z.string().min(1),
    RoomCode: z.string().min(1),
    Name: z.string().min(1),
    RoomCategory: z.string().min(1).optional(),
    Usage: z.string().min(1).optional(),
    NetAreaM2: z.number().nonnegative().optional(),
    Department: z.string().optional(),
    CostCenter: z.string().optional(),
    Polygon: GeoJSONPolygonSchema.optional(),
    IsDeskReservable: z.boolean().default(false),
    IsActive: z.boolean().default(true),
});
export const LocationHierarchySchema = z.object({
    bl_id: z.string().min(1),
    LevelName: z.string().min(1),
    RoomCode: z.string().min(1).optional(),
});
export function resolveFloorHierarchy(floor, building) {
    if (building && floor.bl_id !== building.bl_id) {
        throw new Error("The selected floor does not belong to the selected building.");
    }
    return { bl_id: floor.bl_id, LevelName: floor.LevelName };
}
export function resolveRoomHierarchy(room, floor) {
    if (floor && (room.bl_id !== floor.bl_id || room.LevelName !== floor.LevelName)) {
        throw new Error("The selected room does not belong to the selected floor and building.");
    }
    return {
        bl_id: room.bl_id,
        LevelName: room.LevelName,
        RoomCode: room.RoomCode,
    };
}
//# sourceMappingURL=locations.js.map
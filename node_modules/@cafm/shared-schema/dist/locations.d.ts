import { z } from "zod";
export declare const GeoJSONPositionSchema: z.ZodUnion<[z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>]>;
export declare const GeoJSONLinearRingSchema: z.ZodArray<z.ZodUnion<[z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>]>>;
export declare const GeoJSONPolygonSchema: z.ZodObject<{
    type: z.ZodLiteral<"Polygon">;
    coordinates: z.ZodArray<z.ZodArray<z.ZodUnion<[z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>]>>>;
}, z.core.$strip>;
export declare const GPSCoordinatesSchema: z.ZodObject<{
    latitude: z.ZodNumber;
    longitude: z.ZodNumber;
    elevationMeters: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const BuildingSchema: z.ZodObject<{
    bl_id: z.ZodString;
    Name: z.ZodString;
    Address: z.ZodString;
    GPSCoordinates: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
        elevationMeters: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    IsActive: z.ZodDefault<z.ZodBoolean>;
    CreatedAt: z.ZodOptional<z.ZodString>;
    UpdatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const FloorSchema: z.ZodObject<{
    bl_id: z.ZodString;
    LevelName: z.ZodString;
    FloorNumber: z.ZodNumber;
    GrossAreaM2: z.ZodOptional<z.ZodNumber>;
    FloorPlanUrl: z.ZodOptional<z.ZodString>;
    FloorPlanFormat: z.ZodOptional<z.ZodEnum<{
        DWG: "DWG";
        DXF: "DXF";
        SVG: "SVG";
        GEOJSON: "GEOJSON";
    }>>;
    IsActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const RoomSchema: z.ZodObject<{
    bl_id: z.ZodString;
    LevelName: z.ZodString;
    RoomCode: z.ZodString;
    Name: z.ZodString;
    RoomCategory: z.ZodOptional<z.ZodString>;
    Usage: z.ZodOptional<z.ZodString>;
    NetAreaM2: z.ZodOptional<z.ZodNumber>;
    Department: z.ZodOptional<z.ZodString>;
    CostCenter: z.ZodOptional<z.ZodString>;
    Polygon: z.ZodOptional<z.ZodObject<{
        type: z.ZodLiteral<"Polygon">;
        coordinates: z.ZodArray<z.ZodArray<z.ZodUnion<[z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>]>>>;
    }, z.core.$strip>>;
    IsDeskReservable: z.ZodDefault<z.ZodBoolean>;
    IsActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const LocationHierarchySchema: z.ZodObject<{
    bl_id: z.ZodString;
    LevelName: z.ZodString;
    RoomCode: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type GeoJSONPosition = z.infer<typeof GeoJSONPositionSchema>;
export type GeoJSONPolygon = z.infer<typeof GeoJSONPolygonSchema>;
export type Building = z.infer<typeof BuildingSchema>;
export type Floor = z.infer<typeof FloorSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type LocationHierarchy = z.infer<typeof LocationHierarchySchema>;
export declare function resolveFloorHierarchy(floor: Floor, building?: Building): Pick<Floor, "bl_id" | "LevelName">;
export declare function resolveRoomHierarchy(room: Room, floor?: Floor): LocationHierarchy;
//# sourceMappingURL=locations.d.ts.map
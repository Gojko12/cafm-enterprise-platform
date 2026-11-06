import { z } from "zod";
export declare const TradeSchema: z.ZodObject<{
    TradeId: z.ZodString;
    TradeCode: z.ZodString;
    TradeName: z.ZodString;
    Description: z.ZodOptional<z.ZodString>;
    IsActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const EquipmentStatusSchema: z.ZodEnum<{
    Active: "Active";
    Decommissioned: "Decommissioned";
    "Under Repair": "Under Repair";
}>;
export declare const TechnicalSpecificationsSchema: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodString>]>>;
export declare const EquipmentSchema: z.ZodObject<{
    EquipmentCode: z.ZodString;
    LocalEquipmentCode: z.ZodOptional<z.ZodString>;
    EquipmentName: z.ZodString;
    EquipmentUseEnglish: z.ZodOptional<z.ZodString>;
    IsInstallation: z.ZodDefault<z.ZodBoolean>;
    Status: z.ZodDefault<z.ZodEnum<{
        Active: "Active";
        Decommissioned: "Decommissioned";
        "Under Repair": "Under Repair";
    }>>;
    Manufacturer: z.ZodOptional<z.ZodString>;
    Model: z.ZodOptional<z.ZodString>;
    SerialNumber: z.ZodOptional<z.ZodString>;
    InstallationDate: z.ZodOptional<z.ZodString>;
    WarrantyExpiryDate: z.ZodOptional<z.ZodString>;
    Criticality: z.ZodOptional<z.ZodEnum<{
        Low: "Low";
        Medium: "Medium";
        High: "High";
        Critical: "Critical";
    }>>;
    TechnicalSpecifications: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodString>]>>>;
    bl_id: z.ZodString;
    LevelName: z.ZodString;
    RoomCode: z.ZodString;
    PrimaryTradeId: z.ZodOptional<z.ZodString>;
    ParentEquipmentCode: z.ZodOptional<z.ZodString>;
    BIM_GlobalId: z.ZodOptional<z.ZodString>;
    QRCodeUrl: z.ZodOptional<z.ZodString>;
    CreatedAt: z.ZodOptional<z.ZodString>;
    UpdatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Trade = z.infer<typeof TradeSchema>;
export type EquipmentStatus = z.infer<typeof EquipmentStatusSchema>;
export type TechnicalSpecifications = z.infer<typeof TechnicalSpecificationsSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
//# sourceMappingURL=equipment.d.ts.map
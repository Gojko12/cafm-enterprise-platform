import { z } from "zod";
import { SiteIdSchema } from "./locations.js";

export const CLASSICAL_TRADES = [
  "Mechanical", "Civil", "Electrical", "MultiTechnic", "Cleaning", "HeavyGang", "Catering",
] as const;
export const ClassicalTradeSchema = z.enum(CLASSICAL_TRADES);
export type ClassicalTrade = z.infer<typeof ClassicalTradeSchema>;

export const TradeSchema = z.object({
  TradeId: z.string().min(1),
  TradeCode: z.string().min(1),
  TradeName: z.string().min(1),
  Description: z.string().optional(),
  IsActive: z.boolean().default(true),
});

export const EquipmentStatusSchema = z.enum(["Active", "Decommissioned", "Under Repair"]);

export const TechnicalSpecificationsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);

export const EquipmentSchema = z.object({
  EquipmentCode: z.string().min(1),
  LocalEquipmentCode: z.string().optional(),
  EquipmentName: z.string().min(1),
  EquipmentUseEnglish: z.string().optional(),
  IsInstallation: z.boolean().default(false),
  Status: EquipmentStatusSchema.default("Active"),
  Manufacturer: z.string().optional(),
  Model: z.string().optional(),
  SerialNumber: z.string().optional(),
  InstallationDate: z.string().optional(),
  WarrantyExpiryDate: z.string().optional(),
  Criticality: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  TechnicalSpecifications: TechnicalSpecificationsSchema.default({}),
  bl_id: z.string().min(1),
  SiteId: SiteIdSchema,
  LevelName: z.string().min(1),
  RoomCode: z.string().min(1),
  PrimaryTradeId: z.string().min(1).optional(),
  ParentEquipmentCode: z.string().min(1).optional(),
  BIM_GlobalId: z.string().min(1).optional(),
  QRCodeUrl: z.string().url().optional(),
  CreatedAt: z.string().min(1).optional(),
  UpdatedAt: z.string().min(1).optional(),
});

export type Trade = z.infer<typeof TradeSchema>;
export type EquipmentStatus = z.infer<typeof EquipmentStatusSchema>;
export type TechnicalSpecifications = z.infer<typeof TechnicalSpecificationsSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;

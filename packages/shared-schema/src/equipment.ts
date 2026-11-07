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

export const EQUIPMENT_CATEGORIES = {
  A: "Air Conditioning and Heat Pumps (Air/Air)", B: "Building Management System (BMS)",
  C: "Cooling Water Systems", D: "Drainwater / Sewer Systems / Domestic Water",
  E: "Energy / Electrical / E-Panels", F: "Fire Detection / Fighting / Installation",
  G: "General", H: "Heating Systems", K: "Kitchen Equipment", L: "Transport (Mailtube / Lifts)",
  M: "Mechanical", O: "Oil Systems", P: "Compressed Air Systems", Q: "Site Installation",
} as const;
export const EquipmentCategorySchema = z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "K", "L", "M", "O", "P", "Q"]);
export const EquipmentHierarchyLevelSchema = z.enum(["Installation", "SubEquipment", "Component"]);

export const TechnicalSpecificationsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);

export const EquipmentSchema = z.object({
  EquipmentCode: z.string().min(1),
  LocalEquipmentCode: z.string().optional(),
  EquipmentName: z.string().min(1),
  EquipmentNameLocal: z.string().optional(),
  Category: EquipmentCategorySchema.optional(),
  HierarchyLevel: EquipmentHierarchyLevelSchema.optional(),
  LengthCm: z.number().nonnegative().optional(),
  WidthCm: z.number().nonnegative().optional(),
  HeightCm: z.number().nonnegative().optional(),
  WeightKg: z.number().nonnegative().optional(),
  ManufacturerArticleId: z.string().optional(),
  ReplacementCostEur: z.number().nonnegative().optional(),
  DocumentationUrl: z.string().url().optional(),
  Documents: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), dataUrl: z.string() })).optional(),
  EquipmentStandardDescription: z.string().optional(),
  EquipmentStandardId: z.string().optional(),
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
}).superRefine((equipment, context) => {
  if (!equipment.HierarchyLevel) return;
  if (equipment.IsInstallation !== (equipment.HierarchyLevel === "Installation")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["IsInstallation"], message: "Installation flag must match the hierarchy level." });
  }
  if (equipment.HierarchyLevel === "Installation" && equipment.ParentEquipmentCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ParentEquipmentCode"], message: "An installation cannot have a parent." });
  }
  if (equipment.HierarchyLevel !== "Installation" && !equipment.ParentEquipmentCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ParentEquipmentCode"], message: "Subequipment and components require a parent." });
  }
  if (equipment.ParentEquipmentCode === equipment.EquipmentCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ParentEquipmentCode"], message: "Equipment cannot be its own parent." });
  }
});

export type Trade = z.infer<typeof TradeSchema>;
export type EquipmentStatus = z.infer<typeof EquipmentStatusSchema>;
export type TechnicalSpecifications = z.infer<typeof TechnicalSpecificationsSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;

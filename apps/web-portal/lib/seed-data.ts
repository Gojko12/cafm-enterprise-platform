// Seed data for 3 ESA sites with complete location hierarchies and equipment
import { Building, Floor, Room, Equipment, BaseWorkRequest, SiteId } from "@cafm/shared-schema";

export const SITES: Record<string, { name: string; location: string }> = {
  "02-ESOC": { name: "ESOC Darmstadt", location: "Darmstadt, Germany" },
  "01-ESTEC": { name: "ESTEC Noordwijk", location: "Noordwijk, Netherlands" },
  "04-ESRIN": { name: "ESRIN Frascati", location: "Frascati, Italy" },
  "03-HQ": { name: "ESA HQ Paris", location: "Paris, France" },
  "05-ESAC": { name: "ESAC Madrid", location: "Madrid, Spain" },
  "SITE-01": { name: "ESOC Darmstadt", location: "Darmstadt, Germany" },
  "SITE-02": { name: "ESTEC Noordwijk", location: "Noordwijk, Netherlands" },
  "SITE-03": { name: "ESRIN Frascati", location: "Frascati, Italy" },
};

// SITE-01: ESOC Darmstadt
export const ESOC_BUILDINGS: Building[] = [
  {
    bl_id: "BL-ESOC-001",
    Name: "ESOC Main Building",
    Address: "Robert-Bosch-Str. 5, 64293 Darmstadt",
    SiteId: "SITE-01",
    IsActive: true,
  },
  {
    bl_id: "BL-ESOC-002",
    Name: "ESOC Engineering Complex",
    Address: "Robert-Bosch-Str. 7, 64293 Darmstadt",
    SiteId: "SITE-01",
    IsActive: true,
  },
];

export const ESOC_FLOORS: Floor[] = [
  // Building BL-ESOC-001
  { LevelName: "Basement", bl_id: "BL-ESOC-001", SiteId: "SITE-01", FloorNumber: -1, IsActive: true },
  { LevelName: "Ground Floor", bl_id: "BL-ESOC-001", SiteId: "SITE-01", FloorNumber: 0, IsActive: true },
  { LevelName: "Floor 1", bl_id: "BL-ESOC-001", SiteId: "SITE-01", FloorNumber: 1, IsActive: true },
  { LevelName: "Floor 2", bl_id: "BL-ESOC-001", SiteId: "SITE-01", FloorNumber: 2, IsActive: true },
  { LevelName: "Floor 3", bl_id: "BL-ESOC-001", SiteId: "SITE-01", FloorNumber: 3, IsActive: true },
  // Building BL-ESOC-002
  { LevelName: "Ground Floor", bl_id: "BL-ESOC-002", SiteId: "SITE-01", FloorNumber: 0, IsActive: true },
  { LevelName: "Floor 1", bl_id: "BL-ESOC-002", SiteId: "SITE-01", FloorNumber: 1, IsActive: true },
  { LevelName: "Floor 2", bl_id: "BL-ESOC-002", SiteId: "SITE-01", FloorNumber: 2, IsActive: true },
];

export const ESOC_ROOMS: Room[] = [
  // BL-ESOC-001 - Ground Floor
  { RoomCode: "GF-HVAC-001", Name: "HVAC Central", bl_id: "BL-ESOC-001", LevelName: "Ground Floor", SiteId: "SITE-01", NetAreaM2: 45, IsDeskReservable: false, IsActive: true },
  { RoomCode: "GF-ELEC-001", Name: "Main Electrical Room", bl_id: "BL-ESOC-001", LevelName: "Ground Floor", SiteId: "SITE-01", NetAreaM2: 35, IsDeskReservable: false, IsActive: true },
  { RoomCode: "GF-LOBBY-001", Name: "Reception Lobby", bl_id: "BL-ESOC-001", LevelName: "Ground Floor", SiteId: "SITE-01", NetAreaM2: 80, IsDeskReservable: false, IsActive: true },
  // BL-ESOC-001 - Floor 1
  { RoomCode: "F1-OFFICE-001", Name: "Project Office A", bl_id: "BL-ESOC-001", LevelName: "Floor 1", SiteId: "SITE-01", NetAreaM2: 50, IsDeskReservable: true, IsActive: true },
  { RoomCode: "F1-OFFICE-002", Name: "Project Office B", bl_id: "BL-ESOC-001", LevelName: "Floor 1", SiteId: "SITE-01", NetAreaM2: 45, IsDeskReservable: true, IsActive: true },
  // BL-ESOC-001 - Floor 3
  { RoomCode: "F3-HVAC-001", Name: "HVAC Room Floor 3", bl_id: "BL-ESOC-001", LevelName: "Floor 3", SiteId: "SITE-01", NetAreaM2: 30, IsDeskReservable: false, IsActive: true },
  // BL-ESOC-002 - Ground Floor
  { RoomCode: "GF-LAB-001", Name: "Engineering Lab", bl_id: "BL-ESOC-002", LevelName: "Ground Floor", SiteId: "SITE-01", NetAreaM2: 120, IsDeskReservable: false, IsActive: true },
  { RoomCode: "GF-TEST-001", Name: "Test Room", bl_id: "BL-ESOC-002", LevelName: "Ground Floor", SiteId: "SITE-01", NetAreaM2: 90, IsDeskReservable: false, IsActive: true },
];

export const ESOC_EQUIPMENT: Equipment[] = [
  { EquipmentCode: "HVAC-ESA-001", EquipmentName: "HVAC Unit Main", bl_id: "BL-ESOC-001", LevelName: "Ground Floor", RoomCode: "GF-HVAC-001", SiteId: "SITE-01", SerialNumber: "HV-2022-001", IsInstallation: true, Status: "In Service", TechnicalSpecifications: {} },
  { EquipmentCode: "ELEC-ESA-001", EquipmentName: "Main Distribution Panel", bl_id: "BL-ESOC-001", LevelName: "Ground Floor", RoomCode: "GF-ELEC-001", SiteId: "SITE-01", SerialNumber: "EP-2020-001", IsInstallation: true, Status: "In Service", TechnicalSpecifications: {} },
  { EquipmentCode: "DOOR-ESA-001", EquipmentName: "Security Door 1", bl_id: "BL-ESOC-001", LevelName: "Ground Floor", RoomCode: "GF-LOBBY-001", SiteId: "SITE-01", SerialNumber: "SD-2019-001", IsInstallation: false, Status: "In Service", TechnicalSpecifications: {} },
  { EquipmentCode: "HVAC-ESA-002", EquipmentName: "HVAC Unit Floor 3", bl_id: "BL-ESOC-001", LevelName: "Floor 3", RoomCode: "F3-HVAC-001", SiteId: "SITE-01", SerialNumber: "HV-2022-002", IsInstallation: true, Status: "In Service", TechnicalSpecifications: {} },
];

// SITE-02: ESTEC Noordwijk
export const ESTEC_BUILDINGS: Building[] = [
  {
    bl_id: "BL-ESTEC-001",
    Name: "ESTEC Technical Center",
    Address: "Keplerlaan 1, 2201 AZ Noordwijk",
    SiteId: "SITE-02",
    IsActive: true,
  },
  {
    bl_id: "BL-ESTEC-002",
    Name: "ESTEC Training Facility",
    Address: "Keplerlaan 2, 2201 AZ Noordwijk",
    SiteId: "SITE-02",
    IsActive: true,
  },
];

export const ESTEC_FLOORS: Floor[] = [
  { LevelName: "Basement", bl_id: "BL-ESTEC-001", SiteId: "SITE-02", FloorNumber: -1, IsActive: true },
  { LevelName: "Ground Floor", bl_id: "BL-ESTEC-001", SiteId: "SITE-02", FloorNumber: 0, IsActive: true },
  { LevelName: "Floor 1", bl_id: "BL-ESTEC-001", SiteId: "SITE-02", FloorNumber: 1, IsActive: true },
  { LevelName: "Floor 2", bl_id: "BL-ESTEC-001", SiteId: "SITE-02", FloorNumber: 2, IsActive: true },
  { LevelName: "Ground Floor", bl_id: "BL-ESTEC-002", SiteId: "SITE-02", FloorNumber: 0, IsActive: true },
  { LevelName: "Floor 1", bl_id: "BL-ESTEC-002", SiteId: "SITE-02", FloorNumber: 1, IsActive: true },
];

export const ESTEC_ROOMS: Room[] = [
  { RoomCode: "GF-HVAC-001", Name: "HVAC Central", bl_id: "BL-ESTEC-001", LevelName: "Ground Floor", SiteId: "SITE-02", NetAreaM2: 50, IsDeskReservable: false, IsActive: true },
  { RoomCode: "GF-ELEC-001", Name: "Electrical Room", bl_id: "BL-ESTEC-001", LevelName: "Ground Floor", SiteId: "SITE-02", NetAreaM2: 40, IsDeskReservable: false, IsActive: true },
  { RoomCode: "GF-REC-001", Name: "Reception", bl_id: "BL-ESTEC-001", LevelName: "Ground Floor", SiteId: "SITE-02", NetAreaM2: 70, IsDeskReservable: false, IsActive: true },
  { RoomCode: "F1-CLASS-001", Name: "Classroom 1", bl_id: "BL-ESTEC-002", LevelName: "Floor 1", SiteId: "SITE-02", NetAreaM2: 60, IsDeskReservable: true, IsActive: true },
  { RoomCode: "F1-CLASS-002", Name: "Classroom 2", bl_id: "BL-ESTEC-002", LevelName: "Floor 1", SiteId: "SITE-02", NetAreaM2: 60, IsDeskReservable: true, IsActive: true },
];

export const ESTEC_EQUIPMENT: Equipment[] = [
  { EquipmentCode: "HVAC-EST-001", EquipmentName: "Central HVAC System", bl_id: "BL-ESTEC-001", LevelName: "Ground Floor", RoomCode: "GF-HVAC-001", SiteId: "SITE-02", SerialNumber: "HV-2023-001", IsInstallation: true, Status: "In Service", TechnicalSpecifications: {} },
  { EquipmentCode: "ELEC-EST-001", EquipmentName: "Main Panel", bl_id: "BL-ESTEC-001", LevelName: "Ground Floor", RoomCode: "GF-ELEC-001", SiteId: "SITE-02", SerialNumber: "EP-2023-001", IsInstallation: true, Status: "In Service", TechnicalSpecifications: {} },
  { EquipmentCode: "DOOR-EST-001", EquipmentName: "Door 1", bl_id: "BL-ESTEC-001", LevelName: "Ground Floor", RoomCode: "GF-REC-001", SiteId: "SITE-02", SerialNumber: "SD-2023-001", IsInstallation: false, Status: "In Service", TechnicalSpecifications: {} },
];

// SITE-03: ESRIN Frascati
export const ESRIN_BUILDINGS: Building[] = [
  {
    bl_id: "BL-ESRIN-001",
    Name: "ESRIN Main Building",
    Address: "Via Galileo Galilei, 00044 Frascati",
    SiteId: "SITE-03",
    IsActive: true,
  },
];

export const ESRIN_FLOORS: Floor[] = [
  { LevelName: "Basement", bl_id: "BL-ESRIN-001", SiteId: "SITE-03", FloorNumber: -1, IsActive: true },
  { LevelName: "Ground Floor", bl_id: "BL-ESRIN-001", SiteId: "SITE-03", FloorNumber: 0, IsActive: true },
  { LevelName: "Floor 1", bl_id: "BL-ESRIN-001", SiteId: "SITE-03", FloorNumber: 1, IsActive: true },
  { LevelName: "Floor 2", bl_id: "BL-ESRIN-001", SiteId: "SITE-03", FloorNumber: 2, IsActive: true },
];

export const ESRIN_ROOMS: Room[] = [
  { RoomCode: "B1-ELEC-001", Name: "Main Electrical", bl_id: "BL-ESRIN-001", LevelName: "Basement", SiteId: "SITE-03", NetAreaM2: 60, IsDeskReservable: false, IsActive: true },
  { RoomCode: "GF-HVAC-001", Name: "HVAC Central", bl_id: "BL-ESRIN-001", LevelName: "Ground Floor", SiteId: "SITE-03", NetAreaM2: 55, IsDeskReservable: false, IsActive: true },
  { RoomCode: "GF-OFFICE-001", Name: "Main Office", bl_id: "BL-ESRIN-001", LevelName: "Ground Floor", SiteId: "SITE-03", NetAreaM2: 100, IsDeskReservable: true, IsActive: true },
  { RoomCode: "F1-SERVER-001", Name: "Server Room", bl_id: "BL-ESRIN-001", LevelName: "Floor 1", SiteId: "SITE-03", NetAreaM2: 40, IsDeskReservable: false, IsActive: true },
];

export const ESRIN_EQUIPMENT: Equipment[] = [
  { EquipmentCode: "ELEC-ERI-001", EquipmentName: "Transformer Unit", bl_id: "BL-ESRIN-001", LevelName: "Basement", RoomCode: "B1-ELEC-001", SiteId: "SITE-03", SerialNumber: "TU-2023-001", IsInstallation: true, Status: "In Service", TechnicalSpecifications: {} },
  { EquipmentCode: "HVAC-ERI-001", EquipmentName: "HVAC Main", bl_id: "BL-ESRIN-001", LevelName: "Ground Floor", RoomCode: "GF-HVAC-001", SiteId: "SITE-03", SerialNumber: "HV-2023-001", IsInstallation: true, Status: "In Service", TechnicalSpecifications: {} },
  { EquipmentCode: "SERVER-ERI-001", EquipmentName: "Server Cabinet 1", bl_id: "BL-ESRIN-001", LevelName: "Floor 1", RoomCode: "F1-SERVER-001", SiteId: "SITE-03", SerialNumber: "SC-2022-001", IsInstallation: false, Status: "In Service", TechnicalSpecifications: {} },
];

// Sample Work Requests across sites
export const SAMPLE_WORK_REQUESTS: BaseWorkRequest[] = [
  {
    WR_ID: "LJ-ESOC-001",
    WR_Type: "LJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "Complete HVAC System Overhaul - ESOC Building A",
    ProblemLocation: "Ground Floor - HVAC Central",
    EstimatedCostEur: 3500,
    CreatedDate: "2026-11-01",
    StartDate: "2026-11-15",
    DueDate: "2026-12-30",
    WorkRequestStatus: "Requested",
    WorkRequestSubstatus: "New Request for Quotation",
    Percentage: 0,
    SiteId: "SITE-01",
    bl_id: "BL-ESOC-001",
    LevelName: "Ground Floor",
    RoomCode: "GF-HVAC-001",
    TradeId: "T-HVAC-001",
    TradeName: "HVAC Specialists",
    EquipmentCodes: ["HVAC-ESA-001"],
    AssignedCraftpersonIds: [],
    AssignedUserIds: ["user-001"],
    CreatedBy: "user-001",
    IsFrozen: false,
    TotalTimeMinutes: 0,
    StartDateTBD: false,
    RequiresSAT: true,
    RequiresDrawingUpdate: true,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
  },
  {
    WR_ID: "FJ-ESTEC-001",
    WR_Type: "FJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "Door Lock Repair - Reception",
    ProblemLocation: "Ground Floor - Reception",
    EstimatedCostEur: 350,
    CreatedDate: "2026-10-15",
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued",
    Percentage: 50,
    SiteId: "SITE-02",
    bl_id: "BL-ESTEC-001",
    LevelName: "Ground Floor",
    RoomCode: "GF-REC-001",
    EquipmentCodes: ["DOOR-EST-001"],
    AssignedCraftpersonIds: [],
    AssignedUserIds: ["user-002"],
    CreatedBy: "user-002",
    IsFrozen: false,
    TotalTimeMinutes: 0,
    StartDateTBD: false,
    RequiresSAT: false,
    RequiresDrawingUpdate: false,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
  },
];

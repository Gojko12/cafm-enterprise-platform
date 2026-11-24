/**
 * V68 (MASTER_SPEC Section 118): the remote ESA ground stations "logical DB".
 *
 * A read-only, typed catalogue of ESA's ESTRACK core stations (researched
 * from ESA/ESOC public material, November 2026): coordinates, antennas and
 * the STANDARD STATION KIT the platform tracks at every such site - a small
 * technical building (max 5 rooms), the antenna(s), backup power (UPS +
 * diesel generator), ops computers, KaBa door access, fire + intruder
 * alarms, CCTV and the perimeter fence. All stations are managed by the
 * ESTRACK Network Operations Centre at ESOC; most are unstaffed day to day
 * and visited only by selected technicians, so the same kit at every
 * station keeps travel maintenance plannable (PM-ready). The commercial
 * "augmented network" partner stations (KSAT, SSC, Goonhilly, ...) run by
 * contract and are deliberately NOT catalogued here.
 *
 * Promotion of a station to a full CAFM site partition (site switcher,
 * rooms, equipment, work requests) is deliberately V69+ work: this catalogue
 * is the management-demo foundation for the Gaussian-splats plan (splat
 * captures instead of BIM models at small sites).
 */

export type StationSystemCategoryId = "antenna" | "power" | "it" | "security" | "building";

export interface StationSystemCategory {
  id: StationSystemCategoryId;
  label: string;
}

export interface StationSystem {
  id: string;
  category: StationSystemCategoryId;
  label: string;
  description?: string;
}

export interface StationAntenna {
  id: string;
  diameterM: number;
  bands: string;
  since: number;
  note?: string;
}

export interface RemoteStation {
  /** ESTRACK station code: KRU, SMA, KIR, RED, CEB, MLG, NNO. */
  code: string;
  name: string;
  country: string;
  region: string;
  lat: number;
  lon: number;
  /** IANA timezone name. */
  timezone: string;
  kind: "dsa" | "ttc" | "campus";
  /** Year the first antenna entered service. */
  commissioned: number;
  antennas: StationAntenna[];
  /** The technical building's rooms, max 5. */
  rooms: string[];
  /** null = to confirm with ESOC before go-live. */
  helipad: boolean | null;
  /** StationSystem ids present at this station (the standard kit by default). */
  systems: string[];
  managedBy: string;
  notes?: string;
}

export const STATION_SYSTEM_CATEGORIES: StationSystemCategory[] = [
  { id: "antenna", label: "Antenna & RF" },
  { id: "power", label: "Backup power" },
  { id: "it", label: "Compute & ops IT" },
  { id: "security", label: "Security & safety" },
  { id: "building", label: "Building & site" },
];

export const STATION_SYSTEM_CATALOG: StationSystem[] = [
  { id: "antennaDish", category: "antenna", label: "Antenna dish, mount & drive" },
  { id: "antennaRf", category: "antenna", label: "RF chain (HPA / LNA / feeds)" },
  { id: "antennaTiming", category: "antenna", label: "Baseband, timing & frequency" },
  { id: "ups", category: "power", label: "UPS / battery bank" },
  { id: "generator", category: "power", label: "Backup diesel generator + fuel tank" },
  { id: "powerDistribution", category: "power", label: "Site power distribution (transformer / AVR)" },
  { id: "opsComputers", category: "it", label: "Ops computers & servers" },
  { id: "commsLinks", category: "it", label: "WAN / comms links back to ESOC" },
  { id: "kabaAccess", category: "security", label: "KaBa door access system" },
  { id: "fireAlarm", category: "security", label: "Fire detection & alarm" },
  { id: "intruderAlarm", category: "security", label: "Intruder (burglar) alarm" },
  { id: "cctv", category: "security", label: "CCTV / site cameras" },
  { id: "hvac", category: "building", label: "Precision cooling / HVAC" },
  { id: "fence", category: "building", label: "Perimeter fence & gates" },
  { id: "lightningProtection", category: "building", label: "Lightning protection & earthing" },
];

export const STATION_SYSTEMS_BY_ID: Record<string, StationSystem> =
  Object.fromEntries(STATION_SYSTEM_CATALOG.map((system) => [system.id, system]));

/** The standard kit every remote station carries, regardless of antenna size. */
const STANDARD_KIT = STATION_SYSTEM_CATALOG.map((system) => system.id);

const STANDARD_ROOMS = ["Equipment hall", "Control / computer room", "UPS & battery room", "Generator room", "Workshop & storage"];

export const REMOTE_STATIONS: RemoteStation[] = [
  {
    code: "KRU",
    name: "Kourou Station",
    country: "French Guiana",
    region: "South America, next to ESA's Spaceport",
    lat: 5.251,
    lon: -52.805,
    timezone: "America/Cayenne",
    kind: "ttc",
    commissioned: 1992,
    antennas: [
      { id: "KRU", diameterM: 15, bands: "S / X up- and downlink", since: 1992, note: "Near-Earth TT&C" },
      { id: "KRU-ACQ", diameterM: 1.3, bands: "X-band receive", since: 1992, note: "Spacecraft acquisition when the position is not accurately known" },
    ],
    rooms: STANDARD_ROOMS,
    helipad: false,
    systems: STANDARD_KIT,
    managedBy: "02-ESOC (ESTRACK Network Operations Centre)",
    notes: "Tracks Ariane and Vega launches from the nearby Spaceport.",
  },
  {
    code: "SMA",
    name: "Santa Maria Station",
    country: "Portugal",
    region: "Azores, Santa Maria island",
    lat: 36.99,
    lon: -25.17,
    timezone: "Atlantic/Azores",
    kind: "ttc",
    commissioned: 2008,
    antennas: [
      { id: "SMA", diameterM: 5.5, bands: "S receive, X receive", since: 2008, note: "Launcher tracking (Ariane, Vega, Soyuz)" },
    ],
    rooms: ["Equipment room", "Control / computer room", "UPS & battery room", "Generator room", "Storage"],
    helipad: false,
    systems: STANDARD_KIT,
    managedBy: "02-ESOC (ESTRACK Network Operations Centre)",
    notes: "The smallest station of the core network, co-located with Santa Maria airport.",
  },
  {
    code: "KIR",
    name: "Kiruna Station",
    country: "Sweden",
    region: "Lapland, near Esrange",
    lat: 67.857,
    lon: 20.964,
    timezone: "Europe/Stockholm",
    kind: "ttc",
    commissioned: 1990,
    antennas: [
      { id: "KI1", diameterM: 15, bands: "S up- and downlink", since: 1990, note: "Polar-orbiting satellites" },
      { id: "KI2", diameterM: 13, bands: "S up- and downlink", since: 2000, note: "Polar-orbiting satellites" },
    ],
    rooms: STANDARD_ROOMS,
    helipad: null,
    systems: STANDARD_KIT,
    managedBy: "02-ESOC (ESTRACK Network Operations Centre)",
    notes: "Built 1990 for polar missions; ESOC remote operations.",
  },
  {
    code: "RED",
    name: "ESEC Redu Station",
    country: "Belgium",
    region: "Wallonia, Redu village",
    lat: 50.24,
    lon: 5.5,
    timezone: "Europe/Brussels",
    kind: "campus",
    commissioned: 1967,
    antennas: [
      { id: "RED", diameterM: 15, bands: "S-band", since: 1995, note: "Galileo TT&C" },
    ],
    rooms: ["Station technical building", "Terminal antenna field", "Education & training Facilities", "Workshop", "Storage"],
    helipad: false,
    systems: STANDARD_KIT,
    managedBy: "02-ESOC (ESTRACK Network Operations Centre)",
    notes: "A full ESA centre (European Space Security and Education Centre) hosting 40+ antennas; part of ESTRACK since the beginning.",
  },
  {
    code: "CEB",
    name: "Cebreros Station (DSA 2)",
    country: "Spain",
    region: "Avila province",
    lat: 40.453,
    lon: -4.368,
    timezone: "Europe/Madrid",
    kind: "dsa",
    commissioned: 2005,
    antennas: [
      { id: "CEB", diameterM: 35, bands: "X up; X, K, Ka down", since: 2005, note: "Deep Space Antenna 2" },
    ],
    rooms: STANDARD_ROOMS,
    helipad: null,
    systems: STANDARD_KIT,
    managedBy: "02-ESOC (ESTRACK Network Operations Centre)",
    notes: "Deep-space missions; unstaffed day to day, maintained by local caretaker and visiting ESOC teams.",
  },
  {
    code: "MLG",
    name: "Malargüe Station (DSA 3)",
    country: "Argentina",
    region: "Mendoza province, south of Malargüe",
    lat: -35.776,
    lon: -69.398,
    timezone: "America/Argentina/Mendoza",
    kind: "dsa",
    commissioned: 2012,
    antennas: [
      { id: "MLG", diameterM: 35, bands: "X up; X, K, Ka down", since: 2012, note: "Deep Space Antenna 3" },
    ],
    rooms: STANDARD_ROOMS,
    helipad: null,
    systems: STANDARD_KIT,
    managedBy: "02-ESOC (ESTRACK Network Operations Centre)",
    notes: "Southern-hemisphere deep space; complements NASA and JAXA networks.",
  },
  {
    code: "NNO",
    name: "New Norcia Station (DSA 1 / DSA 4)",
    country: "Australia",
    region: "Western Australia, north of Perth",
    lat: -31.048,
    lon: 116.192,
    timezone: "Australia/Perth",
    kind: "dsa",
    commissioned: 2002,
    antennas: [
      { id: "NNO1", diameterM: 35, bands: "S, X up; S, X down", since: 2002, note: "ESA's first Deep Space Antenna" },
      { id: "NNO2", diameterM: 4.5, bands: "X up; S, X down", since: 2015, note: "Launch and Early Orbit Phase tracker" },
      { id: "NNO3", diameterM: 35, bands: "X up; X, K, Ka down", since: 2025, note: "Deep Space Antenna 4; entering service 2026" },
    ],
    rooms: STANDARD_ROOMS,
    helipad: null,
    systems: STANDARD_KIT,
    managedBy: "02-ESOC (ESTRACK Network Operations Centre)",
    notes: "Three antennas on one site; LEOP support for launches from Kourou.",
  },
];

export const remoteStationByCode = (code: string): RemoteStation | undefined =>
  REMOTE_STATIONS.find((station) => station.code === code);

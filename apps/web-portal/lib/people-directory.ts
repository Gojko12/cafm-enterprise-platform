import type { LJRole, SiteId, UserRole } from "@cafm/shared-schema";
import { PLATFORM_SITE_IDS } from "@cafm/shared-schema";

export interface DirectoryPerson {
  personName: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  department: string;
  systemRole: UserRole;
  ljRoles: LJRole[];
  sites: SiteId[];
  siteAdminOf: SiteId[];
  superAdmin?: boolean;
  preset: "FullAdmin" | "TeamLeader" | "QAInspector" | "PMEngineer" | "Helpdesk";
}

const ALL: SiteId[] = [...PLATFORM_SITE_IDS];
const person = (personName: string, fullName: string, systemRole: UserRole, phone: string, department: string, rest: Partial<DirectoryPerson> = {}): DirectoryPerson => {
  const [first, ...rest2] = fullName.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/);
  const username = rest2.length ? `${first}.${rest2.join("")}` : first;
  return { personName, fullName, username, email: `${username}@esa.example`, phone, department, systemRole, ljRoles: [], sites: ALL, siteAdminOf: [], preset: "PMEngineer", ...rest };
};

export const PEOPLE_DIRECTORY: DirectoryPerson[] = [
  person("Mark", "Mark Meyer", "SiteAdministrator", "+49 6151 90 2101", "Facility Management", { ljRoles: ["ESA_TM"], superAdmin: true, preset: "FullAdmin" }),
  person("Gregor", "Gregor Kovac", "SiteAdministrator", "+49 6151 90 2102", "Facility Management", { ljRoles: ["ESA_LJM", "ESA_CCM"], superAdmin: true, preset: "FullAdmin" }),
  person("Yvonne", "Yvonne Becker", "ESA_TM", "+49 6151 90 2110", "Technical Management", { ljRoles: ["ESA_TM"], preset: "QAInspector" }),
  person("Claudia", "Claudia Fischer", "TRADE_TM", "+49 6151 90 2120", "Contractor Trade Management", { ljRoles: ["TRADE_TM"], preset: "TeamLeader" }),
  person("Bastian", "Bastian Keller", "SiteAdministrator", "+49 6151 90 2121", "Contractor Trade Management", { ljRoles: ["TRADE_TM"], siteAdminOf: ["02-ESOC"], preset: "FullAdmin" }),
  person("Thomas", "Thomas Wagner", "ESA_TO", "+49 6151 90 2130", "Technical Office", { ljRoles: ["ESA_TO"], preset: "QAInspector" }),
  person("Lidija", "Lidija Novak", "ESA_CCM", "+49 6151 90 2140", "Cost Centre Management", { ljRoles: ["ESA_CCM"], preset: "QAInspector" }),
  person("Stefan", "Stefan Hoffmann", "TRADE_CM", "+49 6151 90 2150", "Contract Management", { ljRoles: ["TRADE_CM"] }),
  person("Petra Lang", "Petra Lang", "ESA_DO", "+49 6151 90 2160", "Drawing Office", { ljRoles: ["ESA_DO"] }),
  person("Ivan Horvat", "Ivan Horvat", "ESA_IM", "+49 6151 90 2170", "CIFM Inventory", { ljRoles: ["ESA_IM"] }),
  person("Elena Schmidt", "Elena Schmidt", "HELPDESK", "+49 6151 90 2001", "Helpdesk", { sites: ["02-ESOC", "01-ESTEC"], preset: "Helpdesk" }),
  person("Lukas Weber", "Lukas Weber", "TeamLeader", "+49 6151 90 2180", "Mechanical Team", { sites: ["02-ESOC"], preset: "TeamLeader" }),
  person("Jan de Vries", "Jan de Vries", "SiteAdministrator", "+31 71 565 2201", "Facility Management", { sites: ["01-ESTEC", "02-ESOC"], siteAdminOf: ["01-ESTEC"], preset: "FullAdmin" }),
  person("Sophie Laurent", "Sophie Laurent", "SiteAdministrator", "+33 1 5369 7201", "Facility Management", { sites: ["03-HQ"], siteAdminOf: ["03-HQ"], preset: "FullAdmin" }),
  person("Marco Rossi", "Marco Rossi", "SiteAdministrator", "+39 06 9418 0201", "Facility Management", { sites: ["04-ESRIN"], siteAdminOf: ["04-ESRIN"], preset: "FullAdmin" }),
  person("Carlos Navarro", "Carlos Navarro", "SiteAdministrator", "+34 91 813 1201", "Facility Management", { sites: ["05-ESAC"], siteAdminOf: ["05-ESAC"], preset: "FullAdmin" }),
];

export const ROLE_MAIN_PERSON: Record<string, string> = {
  ESA_TM: "Yvonne", TRADE_TM: "Claudia", ESA_CCM: "Gregor", TRADE_CM: "Stefan", ESA_TO: "Thomas",
  ESA_LJM: "Gregor", ESA_DO: "Petra Lang", ESA_IM: "Ivan Horvat", ESA_LONG_JOB: "Thomas", TRADE_LONG_JOB: "Claudia",
};
export const LEGACY_PERSON_NAMES: Record<string, string> = { Draftsman: "Petra Lang", "Inventory Admin": "Ivan Horvat" };

export function directoryPerson(name: string): DirectoryPerson | undefined {
  return PEOPLE_DIRECTORY.find((item) => item.personName === name || item.fullName === name || item.username === name);
}
export const usernameForRole = (role: string): string => directoryPerson(ROLE_MAIN_PERSON[role] ?? "")?.username ?? "";

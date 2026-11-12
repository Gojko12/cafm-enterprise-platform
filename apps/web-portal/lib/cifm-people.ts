import type { CifmPerson, Room, SiteId } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { ALL_SITES, assignRoles, defaultRoleDefinitions, directoryProfile } from "./access-profiles";
import { PEOPLE_DIRECTORY } from "./people-directory";

type NonFmSeed = { name: string; team: string; site: SiteId; room: string | number; phone: string };

const NON_FM_SEED: NonFmSeed[] = [
  { name: "Anna Richter", team: "Flight Dynamics (OPS-GF)", site: "02-ESOC", room: "H001", phone: "+49 6151 90 3101" },
  { name: "Dirk Neumann", team: "Flight Dynamics (OPS-GF)", site: "02-ESOC", room: 1, phone: "+49 6151 90 3102" },
  { name: "Katja Brandt", team: "Mission Operations (OCC)", site: "02-ESOC", room: 2, phone: "+49 6151 90 3103" },
  { name: "Oliver Haas", team: "Spacecraft Operations", site: "02-ESOC", room: 3, phone: "+49 6151 90 3104" },
  { name: "Nina Vogel", team: "Ground Station Eng.", site: "02-ESOC", room: 4, phone: "+49 6151 90 3105" },
  { name: "Felix Sommer", team: "ESA IT", site: "02-ESOC", room: 5, phone: "+49 6151 90 3106" },
  { name: "Marta Kruger", team: "Corporate HR & Admin", site: "02-ESOC", room: 6, phone: "+49 6151 90 3107" },
  { name: "Pieter van Dijk", team: "Solar System Science", site: "01-ESTEC", room: 0, phone: "+31 71 565 3101" },
  { name: "Sanne Bakker", team: "Spacecraft Operations", site: "01-ESTEC", room: 1, phone: "+31 71 565 3102" },
  { name: "Joris Smit", team: "Procurement", site: "01-ESTEC", room: 2, phone: "+31 71 565 3103" },
  { name: "Femke de Boer", team: "Finance", site: "01-ESTEC", room: 3, phone: "+31 71 565 3104" },
  { name: "Rik Hendriks", team: "ESA Security", site: "01-ESTEC", room: 4, phone: "+31 71 565 3105" },
  { name: "Camille Dubois", team: "Navigation Office", site: "03-HQ", room: 0, phone: "+33 1 5369 3101" },
  { name: "Laurent Moreau", team: "Procurement", site: "03-HQ", room: 1, phone: "+33 1 5369 3102" },
  { name: "Isabelle Girard", team: "Finance", site: "03-HQ", room: 2, phone: "+33 1 5369 3103" },
  { name: "Hugo Lefevre", team: "Corporate HR & Admin", site: "03-HQ", room: 3, phone: "+33 1 5369 3104" },
  { name: "Chloe Bernard", team: "Canteen Services", site: "03-HQ", room: 4, phone: "+33 1 5369 3105" },
  { name: "Giulia Bianchi", team: "Earth Observation", site: "04-ESRIN", room: 0, phone: "+39 06 9418 3101" },
  { name: "Matteo Conti", team: "Earth Observation", site: "04-ESRIN", room: 1, phone: "+39 06 9418 3102" },
  { name: "Chiara Ferri", team: "ESA IT", site: "04-ESRIN", room: 2, phone: "+39 06 9418 3103" },
  { name: "Paolo Greco", team: "ESA Security", site: "04-ESRIN", room: 3, phone: "+39 06 9418 3104" },
  { name: "Lucia Romano", team: "Canteen Services", site: "04-ESRIN", room: 4, phone: "+39 06 9418 3105" },
  { name: "Alvaro Castillo", team: "Solar System Science", site: "05-ESAC", room: 0, phone: "+34 91 813 3101" },
  { name: "Lucia Ortega", team: "Navigation Office", site: "05-ESAC", room: 1, phone: "+34 91 813 3102" },
  { name: "Diego Herrera", team: "Spacecraft Operations", site: "05-ESAC", room: 2, phone: "+34 91 813 3103" },
  { name: "Marta Iglesias", team: "Finance", site: "05-ESAC", room: 3, phone: "+34 91 813 3104" },
  { name: "Sergio Molina", team: "ESA Security", site: "05-ESAC", room: 4, phone: "+34 91 813 3105" },
];

export function cifmUsername(name: string): string {
  const [first, ...rest] = name.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/);
  return rest.length ? `${first}.${rest.join("")}` : first;
}

function resolveRoom(rooms: Room[], site: SiteId, spec: string | number): Room | undefined {
  const siteRooms = rooms.filter((room) => room.SiteId === site).sort((a, b) => a.RoomCode.localeCompare(b.RoomCode));
  if (typeof spec === "string") return siteRooms.find((room) => room.RoomCode === spec) ?? siteRooms[0];
  const regular = siteRooms.filter((room) => room.RoomCode !== "H001");
  return regular.length ? regular[spec % regular.length] : siteRooms[0];
}

function station(rooms: Room[], site: SiteId, spec: string | number): Pick<CifmPerson, "stationedBuildingId" | "stationedFloorId" | "stationedRoomId"> {
  const room = resolveRoom(rooms, site, spec);
  return { stationedBuildingId: room?.bl_id ?? "", stationedFloorId: room?.LevelName ?? "", stationedRoomId: room?.RoomCode ?? "" };
}

const code = (index: number) => `EMP-${String(2041 + index * 7).padStart(5, "0")}`;

// Idempotent: adds missing non-FM employees and FM personnel, never removes or overwrites existing entries.
export function seedCifmPeople(data: DemoData): CifmPerson[] {
  const existing = [...(data.cifmPeople ?? [])];
  const ids = new Set(existing.map((item) => item.id));
  const fmUsernames = new Set(existing.filter((item) => item.isFmStaff).map((item) => item.username ?? cifmUsername(item.displayName)));
  let counter = existing.length;
  for (const seed of NON_FM_SEED) {
    const username = cifmUsername(seed.name);
    const id = `cifm-${username}`;
    if (ids.has(id)) continue;
    ids.add(id);
    existing.push({
      id, employeeCode: code(counter++), displayName: seed.name, email: `${username}@esa.example`, phone: seed.phone, departmentTeam: seed.team,
      stationedSiteId: seed.site, ...station(data.rooms, seed.site, seed.room), isFmStaff: false, username,
    });
  }
  const addFm = (person: Omit<CifmPerson, "id" | "employeeCode" | "isFmStaff"> & { username: string }) => {
    if (fmUsernames.has(person.username)) return;
    fmUsernames.add(person.username);
    const id = `cifm-fm-${person.username}`;
    if (ids.has(id)) return;
    ids.add(id);
    existing.push({ ...person, id, employeeCode: code(counter++), isFmStaff: person.systemRole !== "HR_ADMIN" });
  };
  for (const entry of PEOPLE_DIRECTORY) {
    const home = entry.sites[0] ?? "02-ESOC";
    addFm({
      username: entry.username, displayName: entry.fullName, email: entry.email, phone: entry.phone, departmentTeam: entry.department,
      stationedSiteId: home, ...station(data.rooms, home, 0), systemRole: entry.systemRole, assignedSiteIds: [...entry.sites],
      siteAdminSiteIds: entry.superAdmin ? [...ALL_SITES] : [...entry.siteAdminOf], tradeAccess: [], auditTrades: [], ljRoles: [...entry.ljRoles],
    });
  }
  const known = new Set(existing.map((item) => item.displayName.toLowerCase()));
  for (const profile of data.userAccessProfiles) {
    const name = profile.fullName || profile.personName;
    if (!name || known.has(name.toLowerCase())) continue;
    known.add(name.toLowerCase());
    const username = profile.username ?? cifmUsername(name);
    addFm({
      username, displayName: name, email: profile.email ?? `${username}@esa.example`, phone: profile.phone ?? "", departmentTeam: profile.department ?? "Facility Management",
      stationedSiteId: profile.siteId, ...station(data.rooms, profile.siteId, 0), systemRole: profile.primaryRole,
      assignedSiteIds: profile.siteAccess?.length ? [...profile.siteAccess] : [profile.siteId], siteAdminSiteIds: profile.isSiteAdmin ? [profile.siteId] : [],
      tradeAccess: [...(profile.vpaTrades ?? [])], auditTrades: [], ljRoles: [],
    });
  }
  for (const craft of data.craftspeople) {
    const name = `${craft.Name} ${craft.LastName}`.trim();
    if (known.has(name.toLowerCase())) continue;
    known.add(name.toLowerCase());
    const username = craft.username ?? cifmUsername(name);
    addFm({
      username, displayName: name, email: `${username}@esa.example`, phone: "", departmentTeam: `${craft.Trade} Team`,
      stationedSiteId: craft.SiteId, ...station(data.rooms, craft.SiteId, 0), systemRole: "Craftsperson", assignedSiteIds: [craft.SiteId],
      siteAdminSiteIds: [], tradeAccess: [craft.Trade, ...(craft.secondaryTradeIds ?? [])], auditTrades: [], ljRoles: [],
    });
  }
  return existing;
}

// Projects directory site-admin assignments onto the per-site access profiles so every site honours them.
function applySiteAdminOverlay(data: DemoData, people: CifmPerson[]): DemoData {
  const roles = data.roleDefinitions ?? defaultRoleDefinitions();
  let profiles = [...data.userAccessProfiles];
  for (const person of people) {
    if (!person.isFmStaff || !person.siteAdminSiteIds) continue;
    const username = person.username ?? cifmUsername(person.displayName);
    const entry = PEOPLE_DIRECTORY.find((item) => item.username === username);
    for (const site of data.sites) {
      if (entry?.superAdmin) continue;
      const want = person.siteAdminSiteIds.includes(site);
      const index = profiles.findIndex((item) => item.siteId === site && (item.username === username || item.fullName === person.displayName || item.personName === person.displayName));
      if (index < 0) {
        if (!want || !entry) continue;
        const created = directoryProfile({ ...entry, sites: Array.from(new Set([...entry.sites, site])), siteAdminOf: [site] }, site);
        profiles.push(created);
        continue;
      }
      const profile = profiles[index];
      if (profile.isSuperAdmin || !!profile.isSiteAdmin === want) continue;
      const base = (profile.assignedRoleIds ?? []).filter((id) => id !== "site-admin");
      const ids = want ? [...base, "site-admin"] : (base.length ? base : [profile.isCraftperson ? "craftperson" : "team-leader"]);
      profiles = profiles.map((item, i) => i === index ? { ...assignRoles({ ...profile, siteAccess: Array.from(new Set([...(profile.siteAccess ?? []), site])) }, ids, roles) } : item);
    }
  }
  return { ...data, userAccessProfiles: profiles };
}

export function withCifmDirectory(data: DemoData): DemoData {
  const cifmPeople = seedCifmPeople(data);
  return applySiteAdminOverlay({ ...data, cifmPeople }, cifmPeople);
}

export function cifmRoomLabel(person: CifmPerson): string {
  return [person.stationedSiteId, person.stationedBuildingId, person.stationedFloorId, person.stationedRoomId].filter(Boolean).join(" · ");
}

import type { CifmPerson, OnboardingRequest, SiteId, UserAccess, UserAccessProfile, UserRole } from "@cafm/shared-schema";
import { CLASSICAL_TRADES, PLATFORM_SITE_IDS } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { assignRoles, defaultRoleDefinitions, directoryProfile, type AccessPreset } from "./access-profiles";
import { cifmUsername } from "./cifm-people";

export const ONBOARDING_FM_ROLES: [string, string][] = [
  ["Craftsperson", "Craftsperson"], ["Helpdesk", "Helpdesk Specialist"], ["TeamLeader", "Team Leader"], ["QAInspector", "QA Inspector"],
  ["PM_Planner", "Planner"], ["TechnicalOfficer", "Technical Officer"], ["TRADE_TM", "Trade Manager (TRADE_TM)"], ["ESA_TM", "ESA Trade Manager (ESA_TM)"],
  ["SiteAdministrator", "Site Administrator"],
];

const SYSTEM_ROLE: Record<string, UserRole> = {
  Craftsperson: "MobileTechnician", Helpdesk: "HELPDESK", HELPDESK: "HELPDESK", TeamLeader: "TeamLeader", QAInspector: "QA_Inspector",
  PM_Planner: "PM_Planner", TechnicalOfficer: "ESA_TO", TRADE_TM: "TRADE_TM", ESA_TM: "ESA_TM", SiteAdministrator: "SiteAdministrator",
};
const PRESET: Record<string, AccessPreset> = {
  Craftsperson: "Craftperson", Helpdesk: "Helpdesk", TeamLeader: "TeamLeader", QAInspector: "QAInspector", PM_Planner: "PMEngineer",
  TechnicalOfficer: "PMEngineer", TRADE_TM: "TeamLeader", ESA_TM: "PMEngineer", SiteAdministrator: "FullAdmin",
};
const PRESET_ROLE_ID: Record<AccessPreset, string> = {
  Craftperson: "craftperson", Helpdesk: "helpdesk", TeamLeader: "team-leader", QAInspector: "qa-inspector", PMEngineer: "pm-engineer",
  FullAdmin: "site-admin", HRAdmin: "hr-admin",
};

export const pad2 = (value: number) => String(value).padStart(2, "0");
export const formatDdMmYyyy = (date: Date) => `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
export const isDdMmYyyy = (value: string) => /^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(value);

export interface OnboardingActor { name: string; profile?: UserAccessProfile }

const managesSite = (profile: UserAccessProfile, site: string) => !!profile.isSuperAdmin ||
  (!!profile.isSiteAdmin && (profile.managedSiteIds?.length ? profile.managedSiteIds.includes(site as SiteId) : profile.siteId === site));
export const isHrActor = (profile?: UserAccessProfile) => !!profile && (!!profile.isSuperAdmin || !!profile.isHrAdmin || profile.primaryRole === "HRAdmin");
export const canInitiateOnboarding = (profile?: UserAccessProfile) => !!profile && (isHrActor(profile) || !!profile.isSiteAdmin || profile.primaryRole === "TeamLeader" ||
  !!profile.isTeamLeader || profile.primaryRole === "TechnicalOfficer");
export const canApproveAsTeamLeader = (profile: UserAccessProfile | undefined, request: OnboardingRequest) => !!profile &&
  (!!profile.isSuperAdmin || (profile.primaryRole === "TeamLeader" && (profile.siteAccess ?? [profile.siteId]).includes(request.stationedSiteId as SiteId) &&
    (!request.primaryTrade || !profile.vpaTrades.length || profile.vpaTrades.some((trade) => trade === request.primaryTrade))));
export const canApproveAsSiteAdmin = (profile: UserAccessProfile | undefined, request: OnboardingRequest) => !!profile && managesSite(profile, request.stationedSiteId);

export const pendingOnboardingCount = (requests: OnboardingRequest[] | undefined) =>
  (requests ?? []).filter((item) => item.status === "Pending_Approvals" || item.status === "Pending_HR" || item.status === "Changes_Requested").length;

const nowIso = () => new Date().toISOString();

export function blankOnboardingDraft(site: SiteId, submittedBy: string, track: OnboardingRequest["track"]): OnboardingRequest {
  const base: OnboardingRequest = {
    id: "", track, fullName: "", email: "", phone: "", employeeCode: "", organization: track === "FM_STAFF" ? "Contractor" : "ESA", departmentTeam: "",
    stationedSiteId: site, stationedBuildingId: "", stationedFloorId: "", stationedRoomId: "", startDate: formatDdMmYyyy(new Date()),
    submittedBy, submittedAt: nowIso(), notes: "", status: track === "FM_STAFF" ? "Pending_Approvals" : "Pending_HR",
  };
  return track === "FM_STAFF" ? {
    ...base, fmSystemRole: "Craftsperson", primaryTrade: "Mechanical", allowedTrades: ["Mechanical"], assignedSiteIds: [site], weeklyHoursCapacity: 40,
    teamLeaderApproval: { status: "Pending" }, siteAdminApproval: { status: "Pending" },
  } : { ...base, hrApproval: { status: "Pending_HR" } };
}

export function validateOnboardingDraft(draft: OnboardingRequest): string {
  if (!draft.fullName.trim()) return "Full name is required.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) return "A valid email address is required.";
  if (!isDdMmYyyy(draft.startDate)) return "Start date must use DD-MM-YYYY.";
  if (!draft.departmentTeam.trim()) return "Department / team is required.";
  if (draft.track === "FM_STAFF") {
    if (!draft.fmSystemRole) return "FM system role is required.";
    if (!draft.primaryTrade) return "Primary trade is required.";
    if (!draft.assignedSiteIds?.length) return "Select at least one site.";
  }
  return "";
}

function nextEmployeeCode(people: CifmPerson[]) {
  const next = people.reduce((max, item) => Math.max(max, Number(item.employeeCode.replace(/\D/g, "")) || 0), 2040) + 1;
  return `EMP-${String(next).padStart(5, "0")}`;
}

function uniqueUsername(data: DemoData, fullName: string, suffix: string) {
  const base = cifmUsername(fullName);
  const taken = new Set([...(data.cifmPeople ?? []).map((item) => item.username ?? cifmUsername(item.displayName)), ...data.users.map((item) => item.UserId)]);
  return taken.has(base) ? `${base}.${suffix}` : base;
}

// Creates the directory person, login, access profile and (for craftspeople) the schedulable craftsperson record.
function activate(data: DemoData, request: OnboardingRequest, actor: OnboardingActor): DemoData {
  const fm = request.track === "FM_STAFF";
  const people = data.cifmPeople ?? [];
  const username = uniqueUsername(data, request.fullName, fm ? "fm" : "emp");
  const id = fm ? `cifm-fm-${username}` : `cifm-${username}`;
  const sites = (request.assignedSiteIds?.length ? request.assignedSiteIds : [request.stationedSiteId]) as SiteId[];
  const role = request.fmSystemRole ?? "Craftsperson";
  const person: CifmPerson = {
    id, employeeCode: request.employeeCode || nextEmployeeCode(people), displayName: request.fullName.trim(), email: request.email.trim(), phone: request.phone,
    departmentTeam: request.departmentTeam, stationedSiteId: request.stationedSiteId as SiteId, stationedBuildingId: request.stationedBuildingId,
    stationedFloorId: request.stationedFloorId, stationedRoomId: request.stationedRoomId, isFmStaff: fm, username,
    ...(fm ? {
      systemRole: role, assignedSiteIds: sites, siteAdminSiteIds: role === "SiteAdministrator" ? sites : [],
      tradeAccess: (request.allowedTrades ?? []).filter((trade) => (CLASSICAL_TRADES as readonly string[]).includes(trade)) as CifmPerson["tradeAccess"],
      auditTrades: [], ljRoles: role === "TRADE_TM" || role === "ESA_TM" ? [role] : [],
    } : {}),
  };
  let next: DemoData = { ...data, cifmPeople: [...people, person] };
  if (fm) {
    const preset = PRESET[role] ?? "Craftperson";
    const user: UserAccess = {
      UserId: username, DisplayName: request.fullName.trim(), SystemRole: SYSTEM_ROLE[role] ?? "MobileTechnician", AssignedSiteIds: sites,
      LJRoles: role === "TRADE_TM" || role === "ESA_TM" ? [role] : [], Trades: [...(request.allowedTrades ?? [])], CanAccessAll: false,
    };
    const craftId = role === "Craftsperson" && data.sites.includes(request.stationedSiteId as SiteId) ? `${request.stationedSiteId}-C-${username}` : undefined;
    const roles = data.roleDefinitions ?? defaultRoleDefinitions();
    const profiles = data.sites.filter((site) => sites.includes(site)).map((site) => {
      const entry = { personName: request.fullName.trim(), fullName: request.fullName.trim(), username, email: request.email.trim(), phone: request.phone,
        department: request.departmentTeam, systemRole: SYSTEM_ROLE[role] ?? "MobileTechnician", ljRoles: user.LJRoles as never, sites,
        siteAdminOf: role === "SiteAdministrator" ? sites : [], preset: preset === "Craftperson" ? "PMEngineer" as const : preset as never };
      const base = { ...directoryProfile(entry, site), vpaTrades: [...(request.allowedTrades ?? [])] as UserAccessProfile["vpaTrades"], ...(craftId ? { linkedCraftpersonId: craftId } : {}) };
      return assignRoles(base, [PRESET_ROLE_ID[preset]], roles);
    });
    const [first, ...rest] = request.fullName.trim().split(/\s+/);
    next = {
      ...next,
      users: [...data.users, user],
      userAccessProfiles: [...data.userAccessProfiles.filter((item) => !profiles.some((profile) => profile.id === item.id)), ...profiles],
      craftspeople: craftId ? [...data.craftspeople, {
        id: craftId, Name: first, LastName: rest.join(" ") || first, username, Trade: request.primaryTrade ?? "Mechanical", HourlyRate: 42,
        ShiftHours: Math.round(((request.weeklyHoursCapacity ?? 40) / 5) * 10) / 10, SiteId: request.stationedSiteId as SiteId, SkillLevel: 2,
        secondaryTradeIds: (request.allowedTrades ?? []).filter((trade) => trade !== request.primaryTrade),
      }] : data.craftspeople,
    };
  }
  const decidedAt = nowIso();
  return {
    ...next,
    onboardingRequests: (data.onboardingRequests ?? []).map((item) => item.id !== request.id ? item : {
      ...request, status: "Completed_Onboarded", completedAt: decidedAt, completedPersonId: id, employeeCode: person.employeeCode,
      ...(fm ? {} : { hrApproval: { status: "Completed_By_HR" as const, actorName: actor.name, actorId: actor.profile?.id, decidedAt, comment: request.hrApproval?.comment } }),
    }),
  };
}

export function submitOnboarding(data: DemoData, draft: OnboardingRequest, actor: OnboardingActor): { data: DemoData; request: OnboardingRequest } {
  const existing = data.onboardingRequests ?? [];
  const request: OnboardingRequest = { ...draft, id: `onb-${Date.now().toString(36)}-${existing.length + 1}`, submittedBy: actor.name, submittedAt: nowIso(), fullName: draft.fullName.trim() };
  const withRequest: DemoData = { ...data, onboardingRequests: [...existing, request] };
  if (request.track === "NON_FM_EMPLOYEE" && isHrActor(actor.profile)) return { data: activate(withRequest, request, actor), request };
  return { data: withRequest, request };
}

export function completeByHr(data: DemoData, id: string, actor: OnboardingActor): DemoData {
  const request = (data.onboardingRequests ?? []).find((item) => item.id === id);
  if (!request || request.track !== "NON_FM_EMPLOYEE" || request.status === "Completed_Onboarded" || !isHrActor(actor.profile)) return data;
  return activate(data, request, actor);
}

export type ApprovalStep = "teamLeader" | "siteAdmin";
export type ApprovalDecision = "Approved" | "Changes_Requested" | "Rejected";

export function decideOnboarding(data: DemoData, id: string, step: ApprovalStep, decision: ApprovalDecision, actor: OnboardingActor, comment: string,
  patch: Partial<Pick<OnboardingRequest, "primaryTrade" | "allowedTrades" | "weeklyHoursCapacity" | "fmSystemRole" | "assignedSiteIds">> = {}): DemoData {
  const request = (data.onboardingRequests ?? []).find((item) => item.id === id);
  if (!request || request.track !== "FM_STAFF" || request.status === "Completed_Onboarded" || request.status === "Rejected") return data;
  const allowed = step === "teamLeader" ? canApproveAsTeamLeader(actor.profile, request) : canApproveAsSiteAdmin(actor.profile, request);
  if (!allowed) return data;
  const approval = { status: decision, actorName: actor.name, actorId: actor.profile?.id, decidedAt: nowIso(), comment: comment.trim() || undefined };
  const allowedPatch = step === "teamLeader"
    ? { primaryTrade: patch.primaryTrade, allowedTrades: patch.allowedTrades, weeklyHoursCapacity: patch.weeklyHoursCapacity }
    : { fmSystemRole: patch.fmSystemRole, assignedSiteIds: patch.assignedSiteIds };
  const cleaned = Object.fromEntries(Object.entries(allowedPatch).filter(([, value]) => value !== undefined));
  const updated: OnboardingRequest = {
    ...request, ...cleaned, ...(step === "teamLeader" ? { teamLeaderApproval: approval } : { siteAdminApproval: approval }),
    status: decision === "Rejected" ? "Rejected" : decision === "Changes_Requested" ? "Changes_Requested" : request.status === "Changes_Requested" ? "Pending_Approvals" : request.status,
  };
  const both = updated.teamLeaderApproval?.status === "Approved" && updated.siteAdminApproval?.status === "Approved";
  const replaced: DemoData = { ...data, onboardingRequests: (data.onboardingRequests ?? []).map((item) => item.id === id ? updated : item) };
  return both ? activate(replaced, updated, actor) : replaced;
}

const SEED_PREFIX = "onb-seed-";

// Idempotent: adds the demo onboarding requests once; never overwrites decisions made afterwards.
export function withOnboardingSeed(data: DemoData): DemoData {
  const existing = data.onboardingRequests ?? [];
  const have = new Set(existing.map((item) => item.id));
  const esoc = data.rooms.filter((room) => room.SiteId === "02-ESOC");
  const room = (code: string) => esoc.find((item) => item.RoomCode === code) ?? esoc[0];
  const day = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return date; };
  const place = (code: string) => ({ stationedBuildingId: room(code)?.bl_id ?? "", stationedFloorId: room(code)?.LevelName ?? "", stationedRoomId: room(code)?.RoomCode ?? code });
  const site: SiteId = "02-ESOC";
  const common = { stationedSiteId: site, notes: "", phone: "" } as const;
  const seeds: OnboardingRequest[] = [
    { ...common, id: `${SEED_PREFIX}matteo-conti`, track: "FM_STAFF", fullName: "Matteo Conti", email: "matteo.conti@mechserv.example", phone: "+49 6151 90 4411", employeeCode: "",
      organization: "Contractor", departmentTeam: "Mechanical Team", ...place("202"), startDate: formatDdMmYyyy(day(7)), submittedBy: "Lukas Weber", submittedAt: day(-2).toISOString(),
      notes: "New HVAC mechanic joining the day shift.", status: "Pending_Approvals", fmSystemRole: "Craftsperson", primaryTrade: "Mechanical", allowedTrades: ["Mechanical"],
      assignedSiteIds: [site], weeklyHoursCapacity: 40, assignedTeamLeaderId: "lukas.weber",
      teamLeaderApproval: { status: "Approved", actorName: "Claudia Fischer", decidedAt: day(-1).toISOString(), comment: "Trade skills verified." }, siteAdminApproval: { status: "Pending" } },
    { ...common, id: `${SEED_PREFIX}sven-lindqvist`, track: "FM_STAFF", fullName: "Sven Lindqvist", email: "sven.lindqvist@elektro.example", phone: "+49 6151 90 4412", employeeCode: "",
      organization: "Contractor", departmentTeam: "Helpdesk", ...place("H001"), startDate: formatDdMmYyyy(day(10)), submittedBy: "Claudia Fischer", submittedAt: day(-1).toISOString(),
      notes: "Electrical specialist covering the helpdesk during late shifts.", status: "Pending_Approvals", fmSystemRole: "Helpdesk", primaryTrade: "Electrical", allowedTrades: ["Electrical"],
      assignedSiteIds: [site], weeklyHoursCapacity: 40, teamLeaderApproval: { status: "Pending" }, siteAdminApproval: { status: "Pending" } },
    { ...common, id: `${SEED_PREFIX}claire-moreau`, track: "NON_FM_EMPLOYEE", fullName: "Dr. Claire Moreau", email: "claire.moreau@esa.example", phone: "+49 6151 90 3120", employeeCode: "",
      organization: "ESA", departmentTeam: "Flight Dynamics (OPS-GF)", ...place("H001"), startDate: formatDdMmYyyy(day(5)), submittedBy: "Lukas Weber", submittedAt: day(-1).toISOString(),
      notes: "Visiting flight dynamics analyst, desk in H001.", status: "Pending_HR", hrApproval: { status: "Pending_HR", comment: "Awaiting Hannah Weber (Corporate HR)." } },
    { ...common, id: `${SEED_PREFIX}history-marta-kruger`, track: "NON_FM_EMPLOYEE", fullName: "Marta Kruger", email: "marta.kruger@esa.example", phone: "+49 6151 90 3107", employeeCode: "",
      organization: "ESA", departmentTeam: "Corporate HR & Admin", ...place("H001"), startDate: "12-01-2026", submittedBy: "Hannah Weber", submittedAt: "2026-01-05T09:00:00.000Z",
      notes: "Historical onboarding.", status: "Completed_Onboarded", completedAt: "2026-01-12T08:30:00.000Z", completedPersonId: "cifm-marta.kruger",
      hrApproval: { status: "Completed_By_HR", actorName: "Hannah Weber", decidedAt: "2026-01-12T08:30:00.000Z", comment: "Completed on start date." } },
  ];
  const additions = seeds.filter((item) => !have.has(item.id));
  return additions.length ? { ...data, onboardingRequests: [...existing, ...additions] } : data;
}

export const ALL_ONBOARDING_SITES: SiteId[] = [...PLATFORM_SITE_IDS];

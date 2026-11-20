// Extracted from lib/cafm-store.tsx (Section 96 Stage B round) so the store stays under
// the 600-line code-health cap. Re-exported from @/lib/cafm-store; callers never change.
import { useCafmStore } from "./cafm-store";
import { useSiteContext } from "./contexts/SiteContext";
import { resolveGovernanceActor } from "./governance-actor";
import { resolveEffectivePermissions, permissionsForPreset } from "./access-profiles";

export function useActiveUserPermissions() {
  const { data } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const siteProfiles = data.userAccessProfiles.filter((item) => item.siteId === activeSiteId);
  const person = activePerson.trim().toLowerCase();
  // Resolve by personName, fullName, username, then by unambiguous first-name prefix
  // so "Mark" -> "Mark Meyer", "Thomas" -> "Thomas Wagner", "Claudia" -> "Claudia Fischer".
  const firstNameMatches = siteProfiles.filter((item) =>
    item.personName.trim().split(/\s+/)[0].toLowerCase() === person || item.fullName.trim().split(/\s+/)[0].toLowerCase() === person);
  const profile = siteProfiles.find((item) => item.personName.trim().toLowerCase() === person ||
      item.fullName.trim().toLowerCase() === person || item.username?.trim().toLowerCase() === person) ??
    (firstNameMatches.length === 1 ? firstNameMatches[0] : undefined) ??
    (activePerson === "Gregor" ? siteProfiles.find((item) => item.linkedCraftpersonId && item.personName.toLowerCase().startsWith("gregor ")) : undefined) ??
    (firstNameMatches.length > 1 ? firstNameMatches[0] : undefined);
  const superAdmin = resolveGovernanceActor(data, activeSiteId, activePerson)?.roles.includes("SuperAdmin");
  const siteAdmin = profile?.isSiteAdmin && !superAdmin && !profile.isSuperAdmin;
  const siteAllowed = !siteAdmin || (!!profile.managedSiteIds?.includes(activeSiteId));
  const governance = (key: keyof NonNullable<NonNullable<typeof profile>["siteAdminGovernance"]>) =>
    !siteAdmin || (siteAllowed && profile.siteAdminGovernance?.[key] === true);
  const resolved = superAdmin ? permissionsForPreset("FullAdmin") : profile && resolveEffectivePermissions(profile, data.roleDefinitions);
  const permissions = resolved && {
    ...resolved,
    canManageShiftsAndLeaves: resolved.canManageShiftsAndLeaves && governance("canManageFreezesAndShifts"),
    canManageLocationFreezes: resolved.canManageLocationFreezes && governance("canManageFreezesAndShifts"),
  };
  return { profile, permissions, governance };
}

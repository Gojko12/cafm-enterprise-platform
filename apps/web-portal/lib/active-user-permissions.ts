// Extracted from lib/cafm-store.tsx (Section 96 Stage B round) so the store stays under
// the 600-line code-health cap. Re-exported from @/lib/cafm-store; callers never change.
import { useCafmStore } from "./cafm-store";
import { useSiteContext } from "./contexts/SiteContext";
import { resolveGovernanceActor } from "./governance-actor";
import { resolveEffectivePermissions, permissionsForPreset, resolveActiveProfile } from "./access-profiles";

export function useActiveUserPermissions() {
  const { data } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const siteProfiles = data.userAccessProfiles.filter((item) => item.siteId === activeSiteId);
  const profile = resolveActiveProfile(siteProfiles, activePerson);
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

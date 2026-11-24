/**
 * V66 (Section 116): the module-catalog used by the per-person permission
 * exceptions. A person whose exceptions revoke `module.<key>` loses the
 * sidebar entry and the page itself shows a "no access" card (Super Admins
 * are never restricted; role-based access is untouched otherwise). Pages in
 * the Administration section are deliberately NOT revocable here: they stay
 * governed by the role system.
 */
export const PERSON_MODULE_CATALOG: Array<{ key: string; label: string; href: string }> = [
  { key: "locations", label: "Locations", href: "/locations" },
  { key: "floorPlans", label: "Floor Plans", href: "/floor-plans" },
  { key: "bimViewer", label: "3D BIM Viewer", href: "/bim-viewer" },
  { key: "groundStations", label: "Ground Stations", href: "/ground-stations" },
  { key: "equipment", label: "Equipment Registry", href: "/equipment" },
  { key: "deskReservations", label: "Desk Reservations", href: "/desk-reservations" },
  { key: "preventiveMaintenance", label: "Preventive Maintenance", href: "/preventive-maintenance" },
  { key: "fastJobs", label: "Fast Jobs", href: "/fast-jobs" },
  { key: "longJobs", label: "Long Jobs", href: "/long-jobs" },
  { key: "smartPm", label: "SmartPM", href: "/smart-pm" },
  { key: "technicalAudits", label: "Technical Audits", href: "/technical-audits" },
  { key: "auditAssurance", label: "Audit & Assurance", href: "/audit-assurance" },
  { key: "scheduler", label: "Scheduler", href: "/scheduler" },
  { key: "missionControl", label: "Mission Control", href: "/mission-control" },
  { key: "importExport", label: "Import/Export", href: "/import-export" },
  { key: "analytics", label: "Analytics", href: "/analytics" },
];

/** The module key for a route (undefined when the route cannot be revoked). */
export const moduleKeyForRoute = (href: string): string | undefined =>
  PERSON_MODULE_CATALOG.find((module) => module.href === href)?.key;

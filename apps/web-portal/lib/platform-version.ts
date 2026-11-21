// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V53 = Location renames: building codes, floor level names and room codes become editable; a rename cascades through every
// referencing record (floors, rooms, desks, equipment, work requests, PM schedules, suppressed occurrences, freezes, mission
// events, audit sheets, BIM links) in one atomic save. lib/location-rename.ts + governance exception isPmLocationKeyChange
// for terminal PMs. MASTER_SPEC Section 103.
export const PLATFORM_VERSION = "V53";

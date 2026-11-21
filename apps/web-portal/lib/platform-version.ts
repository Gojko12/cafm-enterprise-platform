// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V54 = Stuck-change guard: a push that can never succeed on retry (governance / permission /
// schema rejection or an unresolvable merge conflict) pauses saving and shows a banner with a
// discard action instead of retrying forever and silently blocking every later edit from that
// browser. lib/stuck-change.ts classifies failures, components/common/StuckChangeAlert.tsx is
// the pause banner, cafm-store.tsx gates the push loop behind the discard decision.
// MASTER_SPEC Section 104.
export const PLATFORM_VERSION = "V54";

import { StateRequestError } from "./cafm-state-request";

// V54 (Section 104): push failures that can never succeed by retrying.
// 400/401/403/422 = the server examined the payload and refused it (schema
// validation, governance rejection, permission). The local merge conflicts
// ("changed elsewhere", "require conflict resolution") are deterministic
// refusals too: the local edit, the acknowledged baseline and the newer server
// copy disagree, so every retry reproduces the exact same throw. 409 revision
// races, 503 and network/timeout errors stay in the normal retry loop.
// Without this classification a single unacceptable record wedges the session:
// pushes are atomic deltas, so the rejected record blocked every later edit
// and the app only healed after a manual DevTools local-storage clear.
export function permanentPushFailure(error: unknown): boolean {
  if (error instanceof StateRequestError) return [400, 401, 403, 422].includes(error.status);
  return error instanceof Error && /require conflict resolution|changed elsewhere/i.test(error.message);
}

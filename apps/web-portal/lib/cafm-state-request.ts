import type { SiteId } from "@cafm/shared-schema";

export async function stateRequest(site: SiteId, person: string, method: "GET" | "POST", body?: unknown, actorId = person) {
  const token = process.env.NEXT_PUBLIC_CAFM_SYNC_TOKEN;
  const response = await fetch("/api/cafm-state", {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "X-CAFM-Site-Id": site, "X-CAFM-Person": person, "X-CAFM-Actor-Id": actorId, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const body = result && typeof result === "object" ? result as Record<string, unknown> : {};
    const message = typeof body.error === "string" && body.error ? body.error : `HTTP ${response.status}`;
    throw new StateRequestError(message, response.status, body.details);
  }
  if (!result || typeof result !== "object" || !("revision" in result) || typeof result.revision !== "number" || !("state" in result)) {
    throw new Error("Invalid state response.");
  }
  return { revision: result.revision, state: result.state };
}

export class StateRequestError extends Error {
  // `details` carries the server's structured debug context (site, actor, revision, timestamp) when provided.
  constructor(message: string, readonly status: number, readonly details?: unknown) { super(message); }
}

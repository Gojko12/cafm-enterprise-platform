"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy compatibility redirector: `/work-requests#FJ` / `?type=FJ` -> `/fast-jobs`,
 * `#LJ` / `?type=LJ` -> `/long-jobs`, default / `#PM` -> `/preventive-maintenance`.
 * Query parameters (e.g. `?wr=...`, `?view=hub`) are preserved.
 */
export default function WorkRequestsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace("#", "").toUpperCase();
    const type = (params.get("type") ?? hash).toUpperCase();
    params.delete("type");
    const route = type === "FJ" ? "/fast-jobs" : type === "LJ" ? "/long-jobs" : "/preventive-maintenance";
    const query = params.toString();
    router.replace(query ? `${route}?${query}` : route);
  }, [router]);
  return (
    <div className="p-6 text-sm text-slate-600" role="status">
      Redirecting to the dedicated work request queue…
    </div>
  );
}

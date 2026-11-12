"use client";

import React, { useMemo } from "react";
import type { Permission, UserRole } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import {
  FEATURE_GROUPS, FEATURE_ROLES, LJ_ROLE_DISPLAY, LJ_STAGES, LJ_STAGE_ROLES, defaultStageMatrix, featureKey, nextStageAccess,
  resolveStageMatrix, roleHasPermission, stageKey, type StageAccess,
} from "@/lib/rbac-matrix";

const ACCESS_PILL: Record<StageAccess, { label: string; className: string }> = {
  act: { label: "✓ Can Act", className: "bg-emerald-100 text-emerald-800" },
  notify: { label: "👁 Notify / View", className: "bg-amber-100 text-amber-800" },
  none: { label: "—", className: "bg-gray-100 text-gray-400" },
};

function RoleHeader({ role }: { role: string }) {
  return (
    <th className="text-center px-2 py-2 font-semibold text-gray-700 min-w-[96px]">
      <div className="leading-tight">{LJ_ROLE_DISPLAY[role] ?? role}</div>
      <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-gray-200 text-[10px] font-mono text-gray-700">{role}</span>
    </th>
  );
}

function LockNote({ canEdit }: { canEdit: boolean }) {
  return canEdit ? null : (
    <p className="mt-2 text-xs text-amber-700">🔒 Read-only. Only Site Administrators and Super Admins can change this matrix.</p>
  );
}

export function LJRoleActionMatrix({ canEdit }: { canEdit: boolean }) {
  const { data, setData } = useCafmStore();
  const matrix = useMemo(() => resolveStageMatrix(data.ljStageMatrix), [data.ljStageMatrix]);

  const cycle = (percentage: number, role: string) => {
    if (!canEdit) return;
    const key = stageKey(percentage, role);
    setData((current) => {
      const resolved = resolveStageMatrix(current.ljStageMatrix);
      return { ...current, ljStageMatrix: { ...resolved, [key]: nextStageAccess(resolved[key] ?? "none") } };
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Long Job Stage Matrix (0%–100%)</h3>
          <p className="text-sm text-gray-600 mt-1">
            Who can act at each Long Job stage. <strong>✓ Can Act</strong> edits and advances the stage,{" "}
            <strong>👁 Notify / View</strong> reads and receives notifications, <strong>—</strong> has no stage action.
            {canEdit && " Click a cell to cycle Can Act → Notify / View → No Action."}
          </p>
          <LockNote canEdit={canEdit} />
        </div>
        {canEdit && (
          <button
            onClick={() => setData((current) => ({ ...current, ljStageMatrix: defaultStageMatrix() }))}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            ↺ Reset Matrix to Defaults
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-700 w-44">Stage</th>
              {LJ_STAGE_ROLES.map((role) => <RoleHeader key={role} role={role} />)}
            </tr>
          </thead>
          <tbody>
            {LJ_STAGES.map((stage) => (
              <tr
                key={stage.percentage}
                className={`border-b border-gray-200 hover:bg-gray-50 ${
                  stage.track === "RFQ" ? "bg-blue-50/40" : stage.track === "Acceptance" ? "bg-yellow-50/60" : stage.track === "RFW" ? "bg-green-50/40" : ""
                }`}
              >
                <td className="text-left px-3 py-2 font-medium text-gray-900">{stage.percentage}% · {stage.name}</td>
                {LJ_STAGE_ROLES.map((role) => {
                  const pill = ACCESS_PILL[matrix[stageKey(stage.percentage, role)] ?? "none"];
                  return (
                    <td key={role} className="text-center px-1 py-1.5">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => cycle(stage.percentage, role)}
                        className={`inline-block px-2 py-1 rounded font-medium whitespace-nowrap ${pill.className} ${canEdit ? "cursor-pointer hover:ring-2 hover:ring-blue-300" : "cursor-default"}`}
                      >
                        {pill.label}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        <strong>Row colours:</strong> Blue = RFQ quoting (0%–25%), Green = RFW execution (30%–50%), Yellow = acceptance gates (78%–94%).
      </div>
    </div>
  );
}

export function FeaturePermissionMatrix({ canEdit }: { canEdit: boolean }) {
  const { data, setData } = useCafmStore();
  const overrides = data.featurePermissionOverrides;

  const toggle = (role: UserRole, permission: Permission) => {
    if (!canEdit) return;
    const key = featureKey(role, permission);
    setData((current) => {
      const allowed = roleHasPermission(role, permission, current.featurePermissionOverrides);
      return { ...current, featurePermissionOverrides: { ...current.featurePermissionOverrides, [key]: !allowed } };
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Feature Permissions</h3>
          <p className="text-sm text-gray-600 mt-1">
            What each role is allowed to do. {canEdit && "Click a cell to switch between ✓ Allowed and ✕ Restricted."}
          </p>
          <LockNote canEdit={canEdit} />
        </div>
        {canEdit && (
          <button
            onClick={() => setData((current) => ({ ...current, featurePermissionOverrides: {} }))}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            ↺ Reset Matrix to Defaults
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">Feature</th>
              {FEATURE_ROLES.map((role) => <RoleHeader key={role} role={role} />)}
            </tr>
          </thead>
          <tbody>
            {FEATURE_GROUPS.map((group) => (
              <React.Fragment key={group.title}>
                <tr className="bg-gray-100">
                  <td colSpan={FEATURE_ROLES.length + 1} className="px-4 py-1.5 font-semibold text-gray-700 uppercase tracking-wide">{group.title}</td>
                </tr>
                {group.items.map(([permission, label]) => (
                  <tr key={permission} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="text-left px-4 py-2 font-medium text-gray-900">{label}</td>
                    {FEATURE_ROLES.map((role) => {
                      const allowed = roleHasPermission(role, permission, overrides);
                      const changed = overrides?.[featureKey(role, permission)] !== undefined;
                      return (
                        <td key={role} className="text-center px-1 py-1.5">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => toggle(role, permission)}
                            className={`inline-block px-2 py-1 rounded font-medium whitespace-nowrap ${allowed ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-400"} ${changed ? "ring-1 ring-blue-400" : ""} ${canEdit ? "cursor-pointer hover:ring-2 hover:ring-blue-300" : "cursor-default"}`}
                          >
                            {allowed ? "✓ Allowed" : "✕ Restricted"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

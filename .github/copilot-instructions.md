# Enterprise CAFM, SmartPM & Workplace Platform — AI Engineering Laws

## Source of truth
- Read `docs/MASTER_SPEC.md` before designing schemas, UI views, or backend functions.
- No placeholder `// TODO` logic or mock calculations; write complete, production-grade code.

## Workspaces
- `apps/web-portal`: Next.js portal (App Router, Tailwind) with `/api/cafm-state` and `/api/bim-models`.
- `apps/mobile-app`: Vite/React offline PWA, exported into `apps/web-portal/public/mobile` by `node scripts/build-cloud.cjs`.
- `packages/shared-schema`: shared TypeScript/Zod schemas (consumed from `dist/`; run `npm run build` there after schema changes).
- `services/functions-core` (Cloud Functions) and `services/cad-bim-parser` (Python DXF/DWG parser).

## Sites
Official ESA sites: `01-ESTEC`, `02-ESOC` (flagship BIM & 2026 history), `03-HQ`, `04-ESRIN`, `05-ESAC`.

## Domain invariants
1. Location hierarchy `Building (bl_id)` -> `Floor (LevelName)` -> `Room (RoomCode)`; picking a Room/Floor resolves parent IDs.
2. Status changes validate against central `WR_Statuses` (`50%` Issued, `78%` Technically Completed, `100%` Closed).
3. SmartPM: no duplicate cycle WRs, auto-resolve Equipment -> Room -> Floor -> Building, start at `50% Issued`, log every step change.

## Formatting & UX
- Dates are strictly `DD-MM-YYYY` in all UI and exports.
- Modals use a `max-h-[85vh]` flex-column card so 100% browser zoom never overflows.
- Newly created Fast Jobs start at `50%` Issued.

## Modular file cap
Keep `.ts`/`.tsx` files under ~500 lines. `node scripts/check-code-health.cjs` enforces hard limits:
`BIMViewer.tsx` ≤ 800 lines, every file in the module directories below ≤ 550 lines, any new `.ts`/`.tsx`
file ≤ 600 lines, and known legacy large files may grow at most +60 lines above their recorded baseline.

Module map (place new code here, splitting instead of growing monoliths):
- BIM UI/helpers: `apps/web-portal/components/modules/bim/` or `apps/web-portal/lib/bim/`.
- Analytics calculators: `apps/web-portal/lib/analytics/` or `components/modules/analytics/`.
- PM popup sub-panels: `apps/web-portal/components/modules/pm/`.
- Split modules keep their original path as a facade so callers never change.

## Encoding & verification
- Never pipe UTF-8 source through PowerShell stdin; use file-editing tools.
- Never leave temporary scratch scripts (`_*.cjs`, `_*.mjs`, `_*.js`, `_*.ts`, `_*.py`) or `*.bak` files in the repo; `check-code-health` fails the build if any exist.
- Verify with `node scripts/check-code-health.cjs`, `npx tsc --noEmit` (web-portal, mobile-app, shared-schema), and `node scripts/build-cloud.cjs` (which runs the health check first).
- Bump `apps/mobile-app/src/version.ts` and the `public/sw.js` cache prefix whenever `apps/mobile-app` changes.

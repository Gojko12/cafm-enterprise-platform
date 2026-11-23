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
- Verify with `node scripts/check-code-health.cjs`, `npm run typecheck` (run inside `apps/web-portal`; NEVER a bare `npx tsc` or root-level `tsc --noEmit`, it uses the wrong tsconfig and floods you with misleading cascade errors), and `node scripts/build-cloud.cjs` (which runs the health check first).
- Bump `apps/mobile-app/src/version.ts` and the `public/sw.js` cache prefix whenever `apps/mobile-app` changes.

## Database & Supabase laws (lessons V49 – V60)
- Record tables live in Supabase Postgres behind the `cafm_blocks` security_invoker view and are saved through `cafm_save_state`; every row keeps `site_id`, `seq` and the complete `data` jsonb as the load-side source of truth, so API payloads must never change.
- NO hard foreign keys anywhere (V54 lesson: they wedge saves through legitimate transient states like BIM resync); integrity is the report-only function `public.cafm_integrity_report(p_site)` plus deterministic repair migrations.
- Supabase SQL is pasted manually by Gregor into the SQL editor: never run any write against Supabase yourself, never read or use `.env` files or service keys, and always propose the SQL as a reviewable file under `scripts/supabase-vXX-*.sql`.
- Every SQL file: plain SQL, idempotent, ONE single transaction, RLS on with no policies, grants to `service_role` only, rollback notes at the top, built-in verification queries (9a, 9b, ...) that run after the commit.
- Typed ARRAY columns from the V55 – V58 DDLs are `jsonb`, not `text[]`: never compare with `array[...]` or call `unnest`/`array_replace` on them; use `jsonb_typeof` guards + `@> '["x"]'::jsonb` and `jsonb_array_elements_text`; `to_jsonb` on a bare literal needs a `::text` cast (SQLSTATE 42P18); `create function ... language sql` does NOT parse its body at CREATE time, so body bugs explode only at first call AFTER commit: state this and favor checks that can be rehearsed offline before the paste.
- HARD BOUNDARY — offline rehearsal before every Supabase paste: whenever a session produces a Supabase migration, bring the SQL back to Gregor BEFORE it is pasted and rehearse it offline first (real local PostgreSQL with an exact reproduction of the live drift, as done for V60) — that rehearsal is what saved us from shipping a broken repair; never paste unrehearsed SQL, and remind Gregor of this at every migration step (draft, review, rehearsal, paste, verification).
- Save order matters: git push + Render deploy BEFORE the Supabase paste, then one small app edit so the revision bumps and every browser pulls the repaired state.
- If the deployed sidebar version does not match the pushed commit, suspect a stale Render build cache, not the commit: tell Gregor to use a Render Manual deploy with "Clear build cache & deploy" (V60 incident: the commit was complete, the build was stale).
- Route-chain migrations in `apps/web-portal/app/api/cafm-state/route.ts` follow the loose-record generic pattern of `lib/wr-id-migration.ts` (`<T>(input: T): T` plus runtime `isRecord` checks); never type them with strict domain schema types (V60 lesson: 102 cascade typecheck errors).

## Release conventions
- One version per commit, message `V<n> Section <mmm> <title>`; `PLATFORM_VERSION` in `apps/web-portal/lib/platform-version.ts` bumps with it and `docs/MASTER_SPEC.md` gets exactly one new section per version (110 = V60, 111 = V61, and so on).
- After a version goes live, record the ACTUAL verification results in the spec and in the migration file's comments, replacing any pre-generated predicted numbers (V60 lesson: the pre-generation probe was wrong on three counts).

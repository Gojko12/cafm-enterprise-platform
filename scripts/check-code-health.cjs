#!/usr/bin/env node
/**
 * Zero-dependency modular file-size guardrails (Section 76).
 * Runs standalone (`node scripts/check-code-health.cjs`) and at the start of
 * `scripts/build-cloud.cjs`, failing the build with a clear split instruction when:
 *   1. `BIMViewer.tsx` exceeds 800 lines,
 *   2. any file inside a module directory (components/modules/bim|pm|analytics, lib/bim, lib/analytics) exceeds 550 lines,
 *   3. any `.ts`/`.tsx` file outside the recorded legacy baselines exceeds 600 lines,
 *   4. a known legacy large file grows by more than +60 lines above its recorded baseline,
 *   5. any temporary scratch file matching `^_.*\.(cjs|mjs|js|ts|py)$` exists in the repo.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SCAN_ROOTS = ["apps", "packages", "services", "scripts"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".next-cloud", "build", ".venv", "coverage", ".git", "public"]);

const BIM_VIEWER_PATH = "apps/web-portal/components/modules/BIMViewer.tsx";
const BIM_VIEWER_MAX = 800;
const MODULE_DIR_MAX = 550;
const NEW_FILE_MAX = 600;
const GROWTH_ALLOWANCE = 60;

/** Module directories whose files must stay small and focused. */
const MODULE_DIRS = [
  "apps/web-portal/components/modules/bim",
  "apps/web-portal/components/modules/pm",
  "apps/web-portal/components/modules/analytics",
  "apps/web-portal/lib/bim",
  "apps/web-portal/lib/analytics",
];

/**
 * Legacy files already above the 600-line cap, with their recorded baselines.
 * They may grow by at most +60 lines; anything else must be split into modules.
 * Update a baseline ONLY when a file was intentionally shrunk below it.
 */
const LEGACY_BASELINES = {
  "services/functions-core/src/wr-lifecycle.ts": 1261,
  "packages/shared-schema/src/work-requests.ts": 979,
  "apps/web-portal/components/modules/long-jobs/LongJobDrawer.tsx": 806,
  "apps/web-portal/lib/ifc-cafm-bridge.ts": 782,
  "apps/web-portal/components/modules/PMWorkRequestPopup.tsx": 772,
  "apps/mobile-app/src/App.tsx": 770,
  "apps/web-portal/app/work-requests/page.tsx": 720,
};

// Single leading underscore marks a scratch script; Python dunder files (`__init__.py`) are legitimate.
const SCRATCH_PATTERN = /^_(?!_).*\.(cjs|mjs|js|ts|py)$/;

const SPLIT_HINT = "Split it into focused modules instead: BIM UI/helpers -> apps/web-portal/components/modules/bim/ or lib/bim/, " +
  "analytics calculators -> lib/analytics/ or components/modules/analytics/, PM popup sub-panels -> components/modules/pm/. " +
  "Keep the original path as a facade so callers never change.";

function lineCount(file) {
  return fs.readFileSync(file, "utf8").split("\n").length;
}

function collect(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, files);
      continue;
    }
    files.push(full);
  }
}

function runCodeHealthCheck() {
  const files = [];
  for (const scanRoot of SCAN_ROOTS) {
    const full = path.join(ROOT, scanRoot);
    if (fs.existsSync(full)) collect(full, files);
  }
  // Scratch files directly in the repository root are forbidden too.
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile()) files.push(path.join(ROOT, entry.name));
  }

  const errors = [];
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    const base = path.basename(file);
    if (SCRATCH_PATTERN.test(base)) {
      errors.push(`Scratch file '${relative}' must never be committed. Delete it; use proper modules or run code via the test suites instead.`);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(base) || base.endsWith(".d.ts")) continue;
    const lines = lineCount(file);
    if (relative === BIM_VIEWER_PATH) {
      if (lines > BIM_VIEWER_MAX) {
        errors.push(`${relative} has ${lines} lines (hard cap ${BIM_VIEWER_MAX}). ${SPLIT_HINT}`);
      }
      continue;
    }
    const moduleDir = MODULE_DIRS.find((dir) => relative.startsWith(`${dir}/`));
    if (moduleDir && lines > MODULE_DIR_MAX) {
      errors.push(`${relative} has ${lines} lines (module-directory cap ${MODULE_DIR_MAX} in ${moduleDir}/). ${SPLIT_HINT}`);
      continue;
    }
    const baseline = LEGACY_BASELINES[relative];
    if (baseline !== undefined) {
      if (lines > baseline + GROWTH_ALLOWANCE) {
        errors.push(`${relative} grew to ${lines} lines, more than +${GROWTH_ALLOWANCE} above its ${baseline}-line baseline. ${SPLIT_HINT}`);
      }
      continue;
    }
    if (lines > NEW_FILE_MAX) {
      errors.push(`${relative} has ${lines} lines (cap ${NEW_FILE_MAX} for files outside the legacy baseline). ${SPLIT_HINT}`);
    }
  }

  if (errors.length) {
    console.error("\n✖ Code health check failed:\n");
    for (const error of errors) console.error(`  - ${error}`);
    console.error("\nSee .github/copilot-instructions.md (Modular file cap) for the module map.\n");
    process.exit(1);
  }
  console.log("✔ Code health check passed: modular file-size guardrails hold and no scratch files exist.");
}

module.exports = { runCodeHealthCheck };

if (require.main === module) runCodeHealthCheck();

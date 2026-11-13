const { spawnSync } = require("node:child_process");
const { cpSync, existsSync, mkdirSync } = require("node:fs");
const path = require("node:path");
const { runCodeHealthCheck } = require("./check-code-health.cjs");

// Fail fast on modular file-size violations or leftover scratch files.
runCodeHealthCheck();

const root = path.resolve(__dirname, "..");
const mobile = path.join(root, "apps", "mobile-app");
const web = path.join(root, "apps", "web-portal");
const destination = path.join(web, "public", "mobile");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, cwd, env = {}) {
  const result = spawnSync(npm, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The 3D BIM viewer loads web-ifc's WebAssembly binaries from /wasm/ at runtime;
// copy them from node_modules so every deployment bundle can serve them statically.
function syncWebIfcWasm() {
  const candidates = [path.join(web, "node_modules", "web-ifc"), path.join(root, "node_modules", "web-ifc")];
  const source = candidates.find((candidate) => existsSync(path.join(candidate, "web-ifc.wasm")));
  if (!source) throw new Error("web-ifc.wasm was not found in node_modules; run the package install first.");
  const wasmDestination = path.join(web, "public", "wasm");
  mkdirSync(wasmDestination, { recursive: true });
  for (const file of ["web-ifc.wasm", "web-ifc-mt.wasm", "web-ifc-mt.worker.js"]) {
    const candidate = path.join(source, file);
    if (existsSync(candidate)) cpSync(candidate, path.join(wasmDestination, file));
  }
}

// When Next.js emits a standalone bundle it does not copy public/ assets; mirror the
// public folders (including /wasm and /bim) into the bundle so the viewer keeps working.
function syncStandalonePublic() {
  for (const distDir of [".next-cloud", ".next"]) {
    const standalone = path.join(web, distDir, "standalone");
    if (!existsSync(standalone)) continue;
    const bundleRoots = [path.join(standalone, "apps", "web-portal"), standalone];
    const bundleRoot = bundleRoots.find((candidate) => existsSync(path.join(candidate, "server.js"))) ?? bundleRoots[0];
    cpSync(path.join(web, "public"), path.join(bundleRoot, "public"), { recursive: true });
  }
}

run(["run", "build"], path.join(root, "packages", "shared-schema"));
run(["run", "build"], mobile, { VITE_BASE_PATH: "/mobile/" });
mkdirSync(destination, { recursive: true });
cpSync(path.join(mobile, "dist"), destination, { recursive: true });
syncWebIfcWasm();
run(["exec", "--", "next", "build"], web);
syncStandalonePublic();

const { spawnSync } = require("node:child_process");
const { cpSync, mkdirSync } = require("node:fs");
const path = require("node:path");

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

run(["run", "build"], path.join(root, "packages", "shared-schema"));
run(["run", "build"], mobile, { VITE_BASE_PATH: "/mobile/" });
mkdirSync(destination, { recursive: true });
cpSync(path.join(mobile, "dist"), destination, { recursive: true });
run(["exec", "--", "next", "build"], web);

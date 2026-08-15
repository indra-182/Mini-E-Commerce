import { spawnSync } from "node:child_process";

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const steps = [
  ["format", "format"],
  ["lint", "lint"],
  ["typecheck", "typecheck:all"],
  ["unit tests", "test:unit"],
  ["database migration and integration tests", "test:integration"],
  ["OpenAPI drift", "openapi:check"],
  ["production build", "build:production"],
  ["fresh E2E test database", "test:db:setup"],
  ["critical Playwright journeys", "e2e"],
] as const;

for (const [label, script] of steps) {
  console.log(`\n[verify] ${label}`);
  const result = spawnSync(packageManager, ["run", script], {
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\n[verify] All local verification gates passed.");

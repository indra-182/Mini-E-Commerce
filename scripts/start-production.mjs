import { spawnSync } from "node:child_process";

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(label, args) {
  console.log(`[production] ${label}`);
  const result = spawnSync(packageManager, args, {
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("Applying Prisma migrations", ["exec", "prisma", "migrate", "deploy"]);
run("Seeding empty database", ["run", "db:seed-if-empty"]);
run("Starting NestJS", ["--filter", "@mini-ecommerce/api", "start"]);

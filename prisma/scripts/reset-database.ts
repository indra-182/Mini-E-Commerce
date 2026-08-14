import { spawnSync } from "node:child_process";

const target = process.argv[2];
if (target !== "dev" && target !== "test") {
  throw new Error("Choose reset target: dev or test.");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const parsedUrl = new URL(databaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!localHosts.has(parsedUrl.hostname)) {
  throw new Error("Database reset is limited to a local PostgreSQL host.");
}

if (target === "dev") {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Development reset requires NODE_ENV=development.");
  }
  if (process.env.DEV_DATABASE_RESET_CONFIRMATION !== "I_UNDERSTAND") {
    throw new Error("Set DEV_DATABASE_RESET_CONFIRMATION=I_UNDERSTAND to confirm the destructive reset.");
  }
} else {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test reset requires NODE_ENV=test.");
  }
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
  if (!/(^|[-_])test($|[-_])/i.test(databaseName)) {
    throw new Error("Test reset requires a database name containing test.");
  }
}

process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = process.env.DIRECT_URL ?? databaseUrl;

const { PrismaClient } = await import("@prisma/client");
const client = new PrismaClient();
try {
  await client.$executeRawUnsafe('DROP SCHEMA "public" CASCADE');
  await client.$executeRawUnsafe('CREATE SCHEMA "public"');
} finally {
  await client.$disconnect();
}

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const migration = spawnSync(packageManager, ["exec", "prisma", "migrate", "deploy"], {
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32"
});
if (migration.status !== 0) {
  process.exit(migration.status ?? 1);
}

if (target === "dev") {
  const seed = spawnSync(packageManager, ["run", "db:seed-if-empty"], {
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (seed.status !== 0) {
    process.exit(seed.status ?? 1);
  }
}

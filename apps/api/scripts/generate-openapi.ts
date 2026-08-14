import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createApplication } from "../src/bootstrap.js";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(apiRoot, "../..");
const openApiPath = resolve(apiRoot, "openapi.json");
const generatedTypesPath = resolve(repositoryRoot, "packages/api-types/src/generated.ts");

const { app, document } = await createApplication({ logger: false });
try {
  await mkdir(dirname(generatedTypesPath), { recursive: true });
  await writeFile(openApiPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const generation = spawnSync(`${packageManager} exec openapi-typescript "${openApiPath}" -o "${generatedTypesPath}"`, {
    cwd: apiRoot,
    stdio: "inherit",
    shell: true
  });
  if (generation.status !== 0) {
    throw new Error("OpenAPI TypeScript generation failed.");
  }
} finally {
  await app.close();
}

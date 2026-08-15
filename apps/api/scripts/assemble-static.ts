import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exportRoot = resolve(apiRoot, "../web/out");
const publicRoot = resolve(apiRoot, "dist/public");

await mkdir(publicRoot, { recursive: true });
await cp(exportRoot, publicRoot, { recursive: true, force: true });

console.log(`Copied static frontend export to ${publicRoot}.`);

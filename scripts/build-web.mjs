import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist", "web");

await mkdir(output, { recursive: true });
await copyFile(resolve(root, "web", "index.html"), resolve(output, "index.html"));
await writeFile(resolve(output, "config.js"), "window.APP_CONFIG = { apiUrl: \"/\" };\n");

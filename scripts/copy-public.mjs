import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const publicMappings = [
  [resolve("apps", "host", "public"), resolve("apps", "host", "dist")],
];

export function copyPublicDirs() {
  for (const [sourceDir, targetDir] of publicMappings) {
    if (!existsSync(sourceDir)) {
      continue;
    }

    mkdirSync(targetDir, { recursive: true });
    cpSync(sourceDir, targetDir, { force: true, recursive: true });
  }
}

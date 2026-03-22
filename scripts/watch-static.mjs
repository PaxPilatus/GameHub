import { existsSync, watch } from "node:fs";
import { resolve } from "node:path";

import { copyPublicDirs } from "./copy-public.mjs";

const watchDirs = [resolve("apps", "host", "public")];
let debounceTimer;

function sync() {
  copyPublicDirs();
  console.log("[dev] synced static assets");
}

sync();

for (const watchDir of watchDirs) {
  if (!existsSync(watchDir)) {
    continue;
  }

  watch(
    watchDir,
    {
      recursive: true,
    },
    () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sync, 120);
    },
  );
}

process.stdin.resume();

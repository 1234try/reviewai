import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node18",
    clean: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: ["action/index.ts"],
    outDir: "action",
    format: ["esm"],
    target: "node20",
    clean: false,
  },
]);

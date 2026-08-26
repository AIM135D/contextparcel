import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  entryPoints: [fileURLToPath(new URL("../apps/cli/src/index.ts", import.meta.url))],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  outfile: fileURLToPath(new URL("../dist/contextparcel.cjs", import.meta.url))
});

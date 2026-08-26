import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@contextparcel/protocol": `${root}packages/protocol/src/index.ts`,
      "@contextparcel/git-context": `${root}packages/git-context/src/index.ts`,
      "@contextparcel/core": `${root}packages/core/src/index.ts`,
      "@contextparcel/targets": `${root}packages/target-adapters/src/index.ts`
    }
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"]
    }
  }
});

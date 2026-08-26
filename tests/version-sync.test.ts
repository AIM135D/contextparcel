import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "@contextparcel/core";
import { EXTENSION_VERSION } from "../apps/extension/src/version";

const packageFiles = [
  "../package.json",
  "../apps/cli/package.json",
  "../apps/extension/package.json",
  "../packages/core/package.json",
  "../packages/git-context/package.json",
  "../packages/protocol/package.json",
  "../packages/target-adapters/package.json"
];

describe("release version", () => {
  it("keeps workspace packages and the runtime version synchronized", async () => {
    const versions = await Promise.all(
      packageFiles.map(async (file) => {
        const value = JSON.parse(await readFile(new URL(file, import.meta.url), "utf8")) as {
          version: string;
        };
        return value.version;
      })
    );
    expect(new Set([...versions, APP_VERSION, EXTENSION_VERSION])).toEqual(new Set(["0.2.0"]));
  });
});

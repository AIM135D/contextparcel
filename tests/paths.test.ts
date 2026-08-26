import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertPathInside, isPathInside, PathSecurityError } from "@contextparcel/core";

describe("registered-root path policy", () => {
  const root = resolve("/tmp/contextparcel-project");

  it("allows generated paths below the project root", () => {
    expect(isPathInside(root, resolve(root, ".contextparcel/handoffs/id"))).toBe(true);
  });

  it("rejects traversal and prefix-confusion paths", () => {
    expect(() => assertPathInside(root, resolve(root, "../../../private"))).toThrow(
      PathSecurityError
    );
    expect(isPathInside(root, `${root}-other/secret`)).toBe(false);
  });
});

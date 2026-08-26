import { rm } from "node:fs/promises";

for (const path of [
  new URL("../dist/", import.meta.url),
  new URL("../artifacts/", import.meta.url),
  new URL("../apps/extension/dist/", import.meta.url),
  new URL("../coverage/", import.meta.url)
]) {
  await rm(path, { recursive: true, force: true });
}

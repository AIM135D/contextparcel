import { chmod } from "node:fs/promises";

await chmod(new URL("../dist/contextparcel.cjs", import.meta.url), 0o755);

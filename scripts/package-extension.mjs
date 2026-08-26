import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { ZipArchive } from "archiver";

const outputDirectory = new URL("../artifacts/", import.meta.url);
const extensionDirectory = new URL("../apps/extension/dist/", import.meta.url);
const archivePath = new URL("contextparcel-extension-v0.1.0.zip", outputDirectory);

await mkdir(outputDirectory, { recursive: true });
const archive = new ZipArchive({ zlib: { level: 9 } });
archive.directory(extensionDirectory.pathname, false);
const completion = pipeline(archive, createWriteStream(archivePath));
await archive.finalize();
await completion;

const digest = createHash("sha256")
  .update(await readFile(archivePath))
  .digest("hex");
await writeFile(
  new URL("contextparcel-extension-v0.1.0.zip.sha256", outputDirectory),
  `${digest}  contextparcel-extension-v0.1.0.zip\n`
);
if ((await stat(archivePath)).size === 0) throw new Error("Extension archive is empty.");

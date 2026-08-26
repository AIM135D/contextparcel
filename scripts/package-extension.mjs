import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { ZipArchive } from "archiver";

const outputDirectory = new URL("../artifacts/", import.meta.url);
const extensionDirectory = new URL("../apps/extension/dist/", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const archiveName = `contextparcel-extension-v${packageJson.version}.zip`;
const archivePath = new URL(archiveName, outputDirectory);

await mkdir(outputDirectory, { recursive: true });
const archive = new ZipArchive({ zlib: { level: 9 } });
archive.directory(fileURLToPath(extensionDirectory), false);
const completion = pipeline(archive, createWriteStream(archivePath));
await archive.finalize();
await completion;

const digest = createHash("sha256")
  .update(await readFile(archivePath))
  .digest("hex");
await writeFile(new URL(`${archiveName}.sha256`, outputDirectory), `${digest}  ${archiveName}\n`);
if ((await stat(archivePath)).size === 0) throw new Error("Extension archive is empty.");

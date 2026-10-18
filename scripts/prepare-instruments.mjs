import { readFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const source = "assets/soundfonts/MuseScore_General.sf3";
const expected = "5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3";
const bytes = await readFile(source);
if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("MuseScore General asset checksum mismatch");
await mkdir("public/instruments", { recursive: true });
await copyFile(source, "public/instruments/MuseScore_General.sf3");
await copyFile("assets/soundfonts/LICENSE.md", "public/instruments/LICENSE.md");
console.log(`[Piano Atelier] Bundled offline GM instruments: ${bytes.length} bytes (MIT)`);

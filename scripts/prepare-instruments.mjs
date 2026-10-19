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
const manifest = JSON.parse(await readFile("assets/orchestra/manifest.json", "utf8"));
const recorded = await readFile("assets/orchestra/Recorded-Orchestra.sf2");
if (createHash("sha256").update(recorded).digest("hex") !== manifest.sha256) throw new Error("Recorded orchestra checksum mismatch");
for (const file of ["Recorded-Orchestra.sf2", "manifest.json", "erhu-LICENSE.txt", "vsco-LICENSE.txt", "ukulele-LICENSE.txt"]) await copyFile(`assets/orchestra/${file}`, `public/instruments/${file}`);
console.log(`[Piano Atelier] Bundled verified CC0 recordings: ${recorded.length} bytes`);

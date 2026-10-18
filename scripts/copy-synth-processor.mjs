import { readdir, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("node_modules/spessasynth_lib");
const targetDir = path.resolve("public");
const target = path.join(targetDir, "spessasynth_processor.min.js");

async function findFile(dir, wanted) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === wanted) return full;
    if (entry.isDirectory()) {
      const nested = await findFile(full, wanted);
      if (nested) return nested;
    }
  }
  return null;
}

const source = await findFile(root, "spessasynth_processor.min.js");
if (!source) {
  console.warn("[Piano Atelier] spessasynth_processor.min.js not found. SoundFont mode may be unavailable; fallback synthesis remains enabled.");
  process.exit(0);
}
await mkdir(targetDir, { recursive: true });
await copyFile(source, target);
console.log(`[Piano Atelier] Copied SoundFont AudioWorklet processor to ${target}`);

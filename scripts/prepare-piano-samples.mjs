import { readFile, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(await readFile(path.join(root, "src/lib/audio/pianoSamples.json"), "utf8"));
const target = path.join(root, "public/piano-samples");
await mkdir(target, { recursive: true });
const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
let count = 0;
for (const layer of config.layers) {
  const source = path.join(root, `node_modules/@audio-samples/piano-velocity${layer.id}`);
  const pkg = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
  const readme = await readFile(path.join(source, "README.md"), "utf8");
  if (pkg.version !== config.packageVersion || !readme.includes("CC BY 3.0") || !readme.includes(config.author)) {
    throw new Error("Bundled piano sample version/license attribution mismatch.");
  }
  for (const midi of config.roots) {
    const file = `${names[midi % 12]}${Math.floor(midi / 12) - 1}v${layer.id}.ogg`;
    // Avoid URL fragment ambiguity in local WebView/static-server paths.
    await copyFile(path.join(source, "audio", file), path.join(target, file.replaceAll("#", "s"))); count++;
  }
  await copyFile(path.join(source, "README.md"), path.join(target, `SOURCE-velocity${layer.id}.md`));
}
await copyFile(path.join(root, "docs/PIANO_SAMPLES_LICENSE.md"), path.join(target, "ATTRIBUTION.md"));
await copyFile(path.join(root, "node_modules/@audio-samples/piano-velocity12/LICENSE"), path.join(target, "PACKAGING-LICENSE-MIT.txt"));
await writeFile(path.join(target, "manifest.json"), JSON.stringify(config, null, 2) + "\n");
console.log(`[Piano Atelier] Bundled ${count} local stereo piano recordings (CC BY 3.0, ${config.author}).`);

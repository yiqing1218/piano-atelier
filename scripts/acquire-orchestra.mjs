// Explicit development-time acquisition. Never called by build or application runtime.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { BasicSoundBank, BasicPreset, BasicInstrument, BasicSample, GeneratorTypes, SampleTypes } from "spessasynth_core";
import { FLACDecoder } from "@wasm-audio-decoders/flac";

const directory = "assets/orchestra";
await mkdir(`${directory}/sources`, { recursive: true });
const erhuCommit = "6615047b2fd06126877483e97b8bb4af9d00b080";
const vscoCommit = "440300901dfe9275fd84e0b7763af1f8443ae62e";
const sfzCommit = "6dd651d55dde97fd4028699be9d4481f26917891";
if (!sfzCommit) throw new Error("Cannot resolve upstream SFZ mapping revision");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const provenance = [];
async function acquire(url, file) {
  let data;
  try { data = await readFile(`${directory}/sources/${file}`); }
  catch {
    // curl honors the desktop's network configuration; no credentials are needed.
    data = execFileSync(process.platform === "win32" ? "curl.exe" : "curl", ["--fail", "--silent", "--show-error", "--location", "--retry", "3", "--max-time", "35", url], { maxBuffer: 32 * 1024 * 1024 });
    await writeFile(`${directory}/sources/${file}`, data);
  }
  provenance.push({ file, url, sha256: sha(data), bytes: data.length });
  return data;
}
const erhuBase = `https://raw.githubusercontent.com/sfzinstruments/aliexpress-erhu/${erhuCommit}/`;
const vscoBase = `https://raw.githubusercontent.com/sgossner/VSCO-2-CE/${vscoCommit}/`;
const ukuleleCommit = "86d345f6f7b79a106ace98eca0da19b087786dba";
const ukuleleBase = `https://raw.githubusercontent.com/freepats/ukulele1/${ukuleleCommit}/`;
const sfzBase = `https://raw.githubusercontent.com/sgossner/VSCO-2-CE/${sfzCommit}/`;
const erhuLicense = await acquire(`${erhuBase}LICENSE`, "erhu-LICENSE.txt");
const vscoLicense = await acquire(`${vscoBase}LICENSE`, "vsco-LICENSE.txt");
await writeFile(`${directory}/erhu-LICENSE.txt`, erhuLicense);
await writeFile(`${directory}/vsco-LICENSE.txt`, vscoLicense);
await writeFile(`${directory}/ukulele-LICENSE.txt`, await acquire(`${ukuleleBase}LICENSE.txt`, "ukulele-LICENSE.txt"));
const bank = new BasicSoundBank();

function decodeWav(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF") throw new Error("Invalid WAV");
  let channels, rate, bits, encoding, pcm;
  for (let i = 12; i + 8 <= bytes.length;) {
    const name = bytes.toString("ascii", i, i + 4), size = bytes.readUInt32LE(i + 4), start = i + 8;
    if (name === "fmt ") { encoding = bytes.readUInt16LE(start); if (encoding === 65534) encoding = bytes.readUInt16LE(start + 24); channels = bytes.readUInt16LE(start + 2); rate = bytes.readUInt32LE(start + 4); bits = bytes.readUInt16LE(start + 14); }
    if (name === "data") pcm = bytes.subarray(start, start + size);
    i = start + size + (size % 2);
  }
  if (![1, 3].includes(encoding) || ![16, 24, 32].includes(bits) || !pcm) throw new Error("Unsupported WAV encoding");
  const length = pcm.length / (channels * bits / 8);
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  for (let frame = 0; frame < length; frame++) for (let c = 0; c < channels; c++) {
    const offset = (frame * channels + c) * bits / 8;
    data[c][frame] = encoding === 3 ? pcm.readFloatLE(offset) : bits === 24 ? pcm.readIntLE(offset, 3) / 8388608 : bits === 16 ? pcm.readInt16LE(offset) / 32768 : pcm.readInt32LE(offset) / 2147483648;
  }
  return { rate, data };
}

for (const definition of [
  { id: "erhu", name: "Erhu CC0", program: 110, base: erhuBase, mapping: "Programs/modules/maps/erhu_sus_map.sfz", prefix: "Samples/sus/", filter: /_rr1\.wav/ },
  { id: "trumpet", name: "VSCO Trumpet", program: 56, base: sfzBase, mapping: "TrumpetSus.sfz", prefix: "Brass/Trumpet/sus/", filter: /\.wav/ },
  { id: "tuba", name: "VSCO Tuba", program: 58, base: sfzBase, mapping: "TubaSus.sfz", prefix: "Brass/Tuba/sus/", filter: /\.wav/ },
  { id: "ukulele", name: "FreePats Ukulele", program: 24, base: ukuleleBase, mapping: "Ukulele%2020260811.sfz", prefix: "samples/", filter: /^[A-G][#b]?\d\.flac$/ },
]) {
  const text = (await acquire(`${definition.base}${definition.mapping}`, `${definition.id}-mapping.sfz`)).toString();
  const regions = text.split("<region>").slice(1).map((region) => {
    const values = Object.fromEntries([...region.matchAll(/(sample|lokey|hikey|key|pitch_keycenter|lovel|hivel|volume|tune)=([^\s]+)/g)].map((m) => [m[1], m[2]]));
    values.sample = values.sample?.split(/[\\/]/).pop();
    return values;
  }).filter((r) => r.sample && definition.filter.test(r.sample));
  const roots = regions.map((r) => Number(r.pitch_keycenter ?? r.key ?? r.lokey));
  const low = Math.min(...roots), high = Math.max(...roots);
  const instrument = new BasicInstrument(); instrument.name = definition.name;
  const preset = new BasicPreset(bank); preset.name = definition.name; preset.program = definition.program; preset.bankMSB = 1; preset.bankLSB = 0;
  for (let index = 0; index < regions.length; index++) {
    const region = regions[index], root = roots[index];
    const sourceBase = definition.id === "erhu" ? erhuBase : definition.id === "ukulele" ? ukuleleBase : vscoBase;
    const sourcePath = `${definition.prefix}${region.sample}`;
    const wav = await acquire(sourceBase + sourcePath.split("/").map(encodeURIComponent).join("/"), region.sample);
    let decoded;
    if (region.sample.endsWith(".flac")) {
      const decoder = new FLACDecoder(); await decoder.ready;
      try { const output = await decoder.decodeFile(wav); if (output.errors.length) throw new Error("FLAC decode failed"); decoded = { rate: output.sampleRate, data: output.channelData }; }
      finally { decoder.free(); }
    } else decoded = decodeWav(wav);
    const { rate, data } = decoded;
    const samples = data.slice(0, 2).map((audio, channel) => {
      const sample = new BasicSample(`${definition.id}-${index}-${channel}`, rate, root, 0, SampleTypes.monoSample, 0, audio.length - 1);
      sample.setAudioData(audio, rate); bank.addSamples(sample); return sample;
    });
    if (samples.length === 2) samples[0].setLinkedSample(samples[1], SampleTypes.leftSample);
    for (let c = 0; c < samples.length; c++) {
      const zone = instrument.createZone(samples[c]);
      zone.keyRange = { min: root === low ? 0 : Number(region.lokey ?? region.key), max: root === high ? 127 : Number(region.hikey ?? region.key) };
      zone.velRange = { min: Number(region.lovel ?? 0), max: Number(region.hivel ?? 127) };
      zone.setGenerator(GeneratorTypes.pan, samples.length === 2 ? (c === 0 ? -500 : 500) : 0);
      zone.setGenerator(GeneratorTypes.attackVolEnv, -12000);
      zone.setGenerator(GeneratorTypes.releaseVolEnv, -2400);
      zone.setGenerator(GeneratorTypes.fineTune, Number(region.tune ?? 0));
      // Preserve recording dynamics. Offset the upstream boosts to leave mixing headroom.
      zone.setGenerator(GeneratorTypes.initialAttenuation, Math.round((24 - Number(region.volume ?? 0)) * 10));
    }
  }
  preset.createZone(instrument); bank.addPresets(preset); bank.addInstruments(instrument);
  console.log(`${definition.name}: ${regions.length} recordings, MIDI roots ${low}–${high}`);
}
const bytes = new Uint8Array(bank.writeSF2());
await writeFile(`${directory}/Recorded-Orchestra.sf2`, bytes);
await writeFile(`${directory}/manifest.json`, JSON.stringify({ version: 1, erhuCommit, vscoCommit, sfzCommit, ukuleleCommit, sha256: sha(bytes), bytes: bytes.length, samples: provenance }, null, 2) + "\n");
console.log(`Wrote recorded orchestra: ${bytes.length} bytes`);

// Original, mathematically generated test tone. Not a sampled piano or a production soundfont.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BasicSoundBank, BasicPreset, BasicInstrument, BasicSample, GeneratorTypes } from "spessasynth_core";
import { zipSync, strToU8 } from "fflate";
const directory = new URL("../tests/fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
const rate = 22050;
const sample = new BasicSample("Original sine 440Hz", rate, 69, 0, 1, 0, rate);
sample.setAudioData(Float32Array.from({ length: rate }, (_, i) => 0.35 * Math.sin(2 * Math.PI * 440 * i / rate)), rate);
const instrument = new BasicInstrument();
instrument.name = "Synthetic test only";
const zone = instrument.createZone(sample);
zone.setGenerator(GeneratorTypes.sampleModes, 1);
zone.setGenerator(GeneratorTypes.releaseVolEnv, -6000);
const bank = new BasicSoundBank();
const preset = new BasicPreset(bank);
preset.name = "Test tone (not piano)"; preset.program = 0; preset.bankMSB = 0; preset.bankLSB = 0;
preset.createZone(instrument);
bank.addPresets(preset); bank.addInstruments(instrument); bank.addSamples(sample);
await writeFile(new URL("synthetic-test.sf2", directory), new Uint8Array(bank.writeSF2()));
await writeFile(new URL("synthetic-test.dls", directory), new Uint8Array(bank.writeDLS()));
const xml = await readFile(new URL("piano-basic.musicxml", directory));
await writeFile(new URL("piano-basic.mxl", directory), zipSync({
  "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'),
  "score.musicxml": xml,
}));
console.log("Generated original SF2/DLS test tone and MXL fixture in tests/fixtures (not bundled into the app).");

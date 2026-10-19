import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SoundBankLoader } from "spessasynth_core";
import { synthRender } from "./synthRender";
it("renders actual SF2 PCM, honors silent lead-in and mute, and produces a finite stereo signal", async () => {
  const bank = Uint8Array.from(readFileSync("tests/fixtures/synthetic-test.sf2")).buffer;
  const note = { id: "a", midi: 69, start: 0.1, duration: 0.2, velocity: 0.8, volume: 1, patch: { program: 0, percussion: false } };
  const channels = await synthRender([note], [bank], null, 22050, 22050, () => {});
  expect(channels).toHaveLength(2);
  expect(channels[0].slice(0, 2000).every((value) => value === 0)).toBe(true);
  expect(channels[0].some((value) => Math.abs(value) > 0.001)).toBe(true);
  expect(channels[0].every(Number.isFinite)).toBe(true);
  const silent = await synthRender([{ ...note, volume: 0 }], [bank], null, 22050, 22050, () => {});
  expect(silent[0].every((value) => value === 0)).toBe(true);
});
it("bundles distinct real erhu, trumpet and tuba presets on a separate bank", () => {
  const bank = SoundBankLoader.fromArrayBuffer(Uint8Array.from(readFileSync("assets/orchestra/Recorded-Orchestra.sf2")).buffer);
  expect(bank.presets.map((p) => [p.bankMSB, p.program])).toEqual([[1, 24], [1, 56], [1, 58], [1, 110]]);
  expect(bank.samples.length).toBeGreaterThan(60);
});

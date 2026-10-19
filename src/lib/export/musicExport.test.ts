import { expect, it } from "vitest";
import { Midi } from "@tonejs/midi";
import { exportMidi, encodeWav, renderNotes } from "./musicExport";
import type { MixSettings } from "../audio/instruments";
import { parseMidiFile } from "../music/midi";
const settings: MixSettings = { mode: "multitrack", instrument: "piano", tracks: { 1: { instrument: "erhu", volume: 0.4 } }, master: 0.8, speed: 0.5 };
const notes = [
  { id: "a", track: 0, midi: 60, start: 0.5, duration: 0.5, velocity: 0.8, program: 0 },
  { id: "b", track: 1, midi: 62, start: 0.5, duration: 1, velocity: 0.8, program: 40 },
];
it("exports actual MIDI notes, speed, per-track programs, banks and volume", () => {
  const bytes = exportMidi(notes, settings);
  const parsed = new Midi(bytes);
  expect(parsed.tracks).toHaveLength(2);
  expect(parsed.tracks[1].instrument.number).toBe(110);
  expect(parsed.tracks[1].notes[0]).toMatchObject({ midi: 62, time: 1, duration: 2 });
  expect(parsed.tracks[1].controlChanges[0][0].value).toBeCloseTo(1 / 127);
  expect(parsed.tracks[1].controlChanges[11][0].value).toBeCloseTo(51 / 127);
  const restored = parseMidiFile("export.mid", bytes.buffer);
  expect(restored.notes.find((note) => note.midi === 62)?.bankMSB).toBe(1);
  expect(renderNotes(restored.notes, { ...settings, speed: 1, tracks: {} }).find((note) => note.midi === 62)?.patch).toEqual({ program: 110, percussion: false, bankMSB: 1 });
});
it("uses the same effective erhu patch and scaled seconds for WAV rendering", () => {
  const result = renderNotes(notes, settings);
  expect(result[1]).toMatchObject({ start: 1, duration: 2, volume: 0.4, patch: { bankMSB: 1, program: 110, percussion: false } });
});
it("writes a stereo PCM WAV with correct RIFF sizes and signed samples", () => {
  const bytes = encodeWav([Float32Array.of(-1, 0, 1), Float32Array.of(0.5, 0, -0.5)], 44100);
  const view = new DataView(bytes);
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
  expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
  expect(view.getUint16(22, true)).toBe(2);
  expect(view.getUint32(24, true)).toBe(44100);
  expect(view.getInt16(44, true)).toBe(-32768);
  expect(view.getInt16(46, true)).toBe(16384);
});

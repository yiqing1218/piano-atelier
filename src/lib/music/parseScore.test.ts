// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseScoreFile } from "./parseScore";
import { parseMusicXmlText } from "./musicXml";
const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const bytes = (text: string) => new TextEncoder().encode(text).buffer;

it("parses chords, rests, backup voices, pickup measures and explicit pitches", () => {
  const score = parseMusicXmlText("piano-basic.musicxml", fixture("piano-basic.musicxml"));
  expect(score.notes.map((n) => [n.midi, n.start, n.duration])).toEqual([
    [48, 0, 1], [66, 0, 0.5], [69, 0, 0.5], [65, 1, 0.5], [66, 1.5, 0.5], [65, 2, 0.5],
  ]);
  expect(score.notes[0].part).toBe("Piano");
  expect(score.duration).toBe(2.5);
});
it("integrates tempo changes and merges ties across measures without retriggering", () => {
  const score = parseMusicXmlText("tempo-tie.musicxml", fixture("tempo-tie.musicxml"));
  expect(score.tempo).toBe(120);
  expect(score.notes.map((n) => [n.midi, n.start, n.duration])).toEqual([[60, 0, 1.5], [64, 1.5, 1]]);
  expect(score.duration).toBe(3.5); // includes the final quarter rest at 60 BPM
});
it("reports omitted advanced notation instead of pretending exact playback", () => {
  const score = parseMusicXmlText("unsupported.musicxml", fixture("unsupported.musicxml"));
  expect(score.warnings?.join(" ")).toMatch(/反复/);
  expect(score.warnings?.join(" ")).toMatch(/装饰音/);
  expect(score.warnings?.join(" ")).toMatch(/力度/);
});
it.each(["xml", "musicxml"])("imports .%s", (ext) => {
  expect(parseScoreFile(`piano.${ext}`, bytes(fixture("piano-basic.musicxml"))).notes).toHaveLength(6);
});
it("uses the MXL container rootfile rather than a different XML entry", () => {
  const archive = zipSync({
    "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="scores/main.musicxml"/></rootfiles></container>'),
    "wrong.xml": strToU8("<wrong/>"), "scores/main.musicxml": strToU8(fixture("piano-basic.musicxml")),
  });
  expect(parseScoreFile("piano.mxl", archive.buffer as ArrayBuffer).notes).toHaveLength(6);
});
it("rejects a broken declared MXL root instead of silently selecting another file", () => {
  const archive = zipSync({
    "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="missing.xml"/></rootfiles></container>'),
    "other.xml": strToU8(fixture("piano-basic.musicxml")),
  });
  expect(() => parseScoreFile("broken.mxl", archive.buffer as ArrayBuffer)).toThrow(/主文件/);
});
it("gives actionable errors for malformed XML, empty archives and unsupported formats", () => {
  expect(() => parseScoreFile("broken.xml", bytes("<score-partwise>"))).toThrow(/无效/);
  expect(() => parseScoreFile("empty.mxl", zipSync({}).buffer as ArrayBuffer)).toThrow(/MusicXML/);
  expect(() => parseScoreFile("score.pdf", bytes("test"))).toThrow(/Audiveris/);
});
it("keeps tuplets' encoded durations, dotted metronome units and multiple parts aligned", () => {
  const score = parseMusicXmlText("tuplets.musicxml", fixture("tuplets-metronome.musicxml"));
  expect(score.tempo).toBe(90);
  expect(score.notes.map((n) => n.midi)).toEqual([48, 60, 62, 64]);
  expect(score.notes[0].duration).toBeCloseTo(2 / 3);
  expect(score.notes[1].duration).toBeCloseTo(2 / 9);
  expect(score.notes[2].start).toBeCloseTo(2 / 9);
  expect(score.notes[3].start).toBeCloseTo(4 / 9);
  expect(score.notes[0].track).toBe(1);
});
it.each([
  ['<beats>4</beats>', '<beats>zero</beats>'],
  ['<beat-type>4</beat-type>', '<beat-type>0</beat-type>'],
  ['<backup><duration>4</duration>', '<backup><duration>NaN</duration>'],
  ['<sound tempo="120"/>', '<offset>NaN</offset><sound tempo="120"/>'],
])("rejects invalid rhythmic numbers instead of producing NaN times (%s)", (from, to) => {
  expect(() => parseMusicXmlText("invalid.xml", fixture("piano-basic.musicxml").replace(from, to))).toThrow(/拍号|时值|偏移/);
});
it("preserves a short MIDI duration and its minimum nonzero velocity", () => {
  const data = readFileSync("tests/fixtures/short-note.mid");
  const score = parseScoreFile("short.mid", Uint8Array.from(data).buffer);
  expect(score.notes[0].duration).toBeCloseTo(0.5 / 480, 8);
  expect(score.notes[0].velocity).toBeCloseTo(1 / 127, 8);
});
it.each(["mid", "midi"])("imports .%s with absolute tempo-map timing, instrument and drum metadata", (ext) => {
  const data = readFileSync("tests/fixtures/piano-tempo.mid");
  const score = parseScoreFile(`piano.${ext}`, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  expect(score.notes.map((n) => [n.midi, n.start, n.duration])).toEqual([
    [36, 0, 0.5], [48, 0, 1.5], [60, 0, 0.5], [64, 0.5, 1], [67, 0.5, 1],
  ]);
  expect(score.notes.find((n) => n.midi === 60)?.velocity).toBeCloseTo(64 / 127);
  expect(score.notes.find((n) => n.midi === 60)?.part).toBe("Right");
  expect(score.notes.find((n) => n.midi === 48)?.track).toBe(1);
  expect(score.notes.find((n) => n.midi === 36)).toMatchObject({ channel: 9, percussion: true, program: 0 });
  expect(score.notes.find((n) => n.midi === 60)).toMatchObject({ channel: 0, percussion: false, program: 0 });
});
it("retains six independent GM instruments and their shared absolute timing", () => {
  const score = parseScoreFile("band-demo.mid", Uint8Array.from(readFileSync("tests/fixtures/band-demo.mid")).buffer);
  expect(score.notes).toHaveLength(24);
  const first = score.notes.filter((note) => note.start === 0).sort((a, b) => a.track! - b.track!);
  expect(first.map((n) => [n.part, n.channel, n.program, n.percussion, n.midi])).toEqual([
    ["Piano", 0, 0, false, 60], ["Guitar", 1, 25, false, 60], ["Bass", 2, 33, false, 36],
    ["Violin", 3, 40, false, 72], ["Strings", 4, 48, false, 48], ["Drums", 9, 0, true, 36],
  ]);
  expect(score.duration).toBe(2);
  expect(score.notes.every((note) => note.duration === 0.5)).toBe(true);
});
it("splits format-0 instrument changes while retaining pitches outside the piano keyboard", () => {
  const events = [
    0, 0xc0, 33, 0, 0x90, 8, 80, 0x83, 0x60, 0x80, 8, 0,
    0, 0xc0, 40, 0, 0x90, 127, 80, 0x83, 0x60, 0x80, 127, 0,
    0, 0x99, 36, 90, 0x83, 0x60, 0x89, 36, 0, 0, 0xff, 0x2f, 0,
  ];
  const data = Uint8Array.from([
    77,84,104,100,0,0,0,6,0,0,0,1,1,224,
    77,84,114,107,0,0,0,events.length, ...events,
  ]);
  const score = parseScoreFile("changes.mid", data.buffer);
  expect(score.notes.map((n) => [n.midi, n.start, n.duration, n.program, n.channel, n.percussion])).toEqual([
    [8, 0, 0.5, 33, 0, false], [127, 0.5, 0.5, 40, 0, false], [36, 1, 0.5, 0, 9, true],
  ]);
  expect(new Set(score.notes.map((note) => note.track)).size).toBe(3);
});

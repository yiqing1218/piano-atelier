import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const banks = vi.hoisted(() => ({ fail: false, instances: [] as Array<Record<string, any>> }));
vi.mock("spessasynth_lib", () => ({
  WorkletSynthesizer: class {
    isReady = Promise.resolve();
    presetList = [0, 25, 33, 40, 48].map((program) => ({ bankMSB: 0, bankLSB: 0, program, isDrum: false, isGMGSDrum: false, name: "Test instrument" }))
      .concat([{ bankMSB: 128, bankLSB: 0, program: 0, isDrum: true, isGMGSDrum: true, name: "Drums" }]);
    midiChannels = Array.from({ length: 16 }, () => ({ setDrums: vi.fn() }));
    addNewChannel() { this.midiChannels.push({ setDrums: vi.fn() }); }
    soundBankManager = { addSoundBank: vi.fn(async (buffer: ArrayBuffer) => {
      structuredClone(buffer, { transfer: [buffer] });
      if (banks.fail) throw new Error("invalid bank");
    }) };
    connect = vi.fn(); destroy = vi.fn(); stopAll = vi.fn(); noteOn = vi.fn(); noteOff = vi.fn();
    programChange = vi.fn(); controllerChange = vi.fn(); setSystemParameter = vi.fn();
    constructor() { banks.instances.push(this); }
  },
}));
import { PianoEngine } from "./PianoEngine";

let resume: () => void;
let suspended = false;
let moduleMissing = false;
let oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>;
let sampleSources: any[];
const gain = () => ({
  gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() },
  connect: vi.fn(), disconnect: vi.fn(),
});
it("isolates the same pitch on two instruments and preserves manual notes when playback stops", async () => {
  const engine = new PianoEngine();
  engine.configureInstruments("multitrack", "violin");
  await engine.prepareInstruments();
  await engine.noteOn(60, 0.8, "playback:a", { track: 0, program: 33 });
  await engine.noteOn(60, 0.8, "playback:b", { track: 1, program: 40 });
  await engine.noteOn(60, 0.8, "manual:a");
  const synth = banks.instances[0];
  expect(synth.programChange.mock.calls).toEqual([[0, 33], [1, 40], [2, 40]]);
  engine.noteOff(60, "playback:a");
  expect(synth.noteOff).toHaveBeenCalledWith(0, 60);
  expect(synth.noteOff).not.toHaveBeenCalledWith(1, 60);
  engine.stopPlayback();
  expect(synth.controllerChange).toHaveBeenCalledWith(0, 120, 0);
  expect(synth.controllerChange).toHaveBeenCalledWith(1, 120, 0);
  expect(synth.controllerChange).not.toHaveBeenCalledWith(2, 120, 0);
});
it("uses separate drum channels and preserves all 128 MIDI pitches", async () => {
  const engine = new PianoEngine(); engine.configureInstruments("multitrack", "piano");
  await engine.noteOn(36, 0.8, "playback:drum", { track: 9, percussion: true });
  await engine.noteOn(8, 0.8, "playback:bass", { track: 1, program: 33 });
  await engine.noteOn(127, 0.8, "playback:high", { track: 2, program: 40 });
  const synth = banks.instances[0];
  expect(synth.midiChannels[0].setDrums).toHaveBeenCalledWith(true);
  expect(synth.midiChannels[1].setDrums).toHaveBeenCalledWith(false);
  expect(synth.noteOn.mock.calls).toEqual([[0, 36, 102], [1, 8, 102], [2, 127, 102]]);
});
it("unifies source drums and bass to violin, and cancels held voices on a mode change", async () => {
  const engine = new PianoEngine(); engine.configureInstruments("unified", "violin");
  await engine.noteOn(36, 0.8, "playback:drums", { track: 9, percussion: true });
  await engine.noteOn(48, 0.8, "playback:bass", { track: 1, program: 33 });
  const synth = banks.instances[0];
  expect(synth.programChange.mock.calls).toEqual([[0, 40], [1, 40]]);
  expect(synth.midiChannels[0].setDrums).toHaveBeenCalledWith(false);
  engine.configureInstruments("unified", "drums");
  expect(synth.stopAll).toHaveBeenCalled();
  await engine.noteOn(38, 0.8, "manual:38");
  expect(synth.midiChannels[0].setDrums).toHaveBeenLastCalledWith(true);
});
it("retries a failed multi-instrument bank load instead of claiming readiness", async () => {
  const engine = new PianoEngine(); engine.configureInstruments("unified", "bass");
  banks.fail = true;
  await expect(engine.prepareInstruments()).rejects.toThrow("invalid bank");
  expect(banks.instances[0].destroy).toHaveBeenCalledOnce();
  banks.fail = false; await engine.noteOn(40);
  expect(banks.instances[1].noteOn).toHaveBeenCalledWith(0, 40, 99);
});
it("allocates extra channels beyond sixteen instead of overwriting another track", async () => {
  const engine = new PianoEngine(); engine.configureInstruments("multitrack", "piano");
  for (let track = 0; track < 18; track++) await engine.noteOn(60, 0.8, `playback:${track}`, { track, program: 40 });
  const synth = banks.instances[0];
  expect(synth.midiChannels).toHaveLength(18);
  expect(synth.noteOn).toHaveBeenLastCalledWith(17, 60, 102);
  engine.noteOff(60, "playback:17");
  expect(synth.noteOff).toHaveBeenCalledWith(17, 60);
  expect(synth.noteOff).not.toHaveBeenCalledWith(0, 60);
});
class Context {
  currentTime = 0; destination = {}; state = suspended ? "suspended" : "running";
  audioWorklet = { addModule: vi.fn(async () => { if (moduleMissing) throw new Error("missing worklet"); }) };
  createGain = gain;
  decodeAudioData = async () => ({ length: 100, numberOfChannels: 2, duration: 1 });
  createBufferSource() {
    const source = { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    sampleSources.push(source); return source;
  }
  createOscillator() {
    const osc = { type: "sine", frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    oscillators.push(osc); return osc;
  }
  resume() { return new Promise<void>((resolve) => { resume = () => { this.state = "running"; resolve(); }; if (!suspended) resume(); }); }
}
const buffer = () => new Uint8Array([82,73,70,70,4,0,0,0,115,102,98,107]).buffer;
beforeEach(() => {
  banks.fail = false; banks.instances = []; oscillators = []; suspended = false; moduleMissing = false;
  sampleSources = [];
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(12) })));
});
afterEach(() => vi.unstubAllGlobals());
it("cancels note-on if released before AudioContext resume resolves", async () => {
  suspended = true;
  const engine = new PianoEngine();
  const starting = engine.noteOn(60, 0.8, "keyboard:Q");
  engine.noteOff(60, "keyboard:Q"); resume(); await starting;
  expect(oscillators).toHaveLength(0);
});
it("panic cancels pending voices before audio initialization finishes", async () => {
  suspended = true;
  const engine = new PianoEngine();
  const starting = engine.noteOn(60); engine.stopAll(); resume(); await starting;
  expect(oscillators).toHaveLength(0);
});
it("connects local SoundFont to output and disables effects", async () => {
  const engine = new PianoEngine(); await engine.loadSoundfont(buffer());
  const synth = banks.instances[0];
  expect(engine.mode).toBe("soundfont");
  expect(synth.connect).toHaveBeenCalledOnce();
  expect(synth.setSystemParameter).toHaveBeenCalledWith("effectsEnabled", false);
  expect(synth.programChange).toHaveBeenCalledWith(0, 0);
});
it("retains the original buffer for IndexedDB after the worklet transfers its copy", async () => {
  const engine = new PianoEngine(), bytes = buffer();
  await engine.loadSoundfont(bytes);
  expect(bytes.byteLength).toBe(12);
});
it("accepts a real RIFF SoundFont with non-UTF8 bytes in its binary length header", async () => {
  const engine = new PianoEngine();
  await engine.loadSoundfont(Uint8Array.from(readFileSync("tests/fixtures/synthetic-test.sf2")).buffer);
  expect(engine.mode).toBe("soundfont");
});
it("does not let one source release another source's same-pitch sound", async () => {
  const engine = new PianoEngine(); await engine.loadSoundfont(buffer());
  await engine.noteOn(60, 0.8, "manual"); await engine.noteOn(60, 0.8, "playback");
  engine.noteOff(60, "playback");
  expect(banks.instances[0].noteOff).not.toHaveBeenCalled();
  engine.noteOff(60, "manual"); expect(banks.instances[0].noteOff).toHaveBeenCalledWith(0, 60);
});
it("keeps the previous usable bank if replacement fails and destroys the failed instance", async () => {
  const engine = new PianoEngine(); await engine.loadSoundfont(buffer()); banks.fail = true;
  await expect(engine.loadSoundfont(buffer())).rejects.toThrow();
  expect(engine.mode).toBe("soundfont");
  expect(banks.instances[0].destroy).not.toHaveBeenCalled();
  expect(banks.instances[1].destroy).toHaveBeenCalledOnce();
});
it("reports a missing worklet and retains usable preview synthesis", async () => {
  moduleMissing = true;
  const engine = new PianoEngine(); await expect(engine.loadSoundfont(buffer())).rejects.toThrow(/worklet/i);
  expect(engine.mode).toBe("preview");
  await engine.noteOn(60); expect(oscillators).toHaveLength(3);
});
it("plays and releases eight simultaneous preview voices independently", async () => {
  const engine = new PianoEngine();
  for (let midi = 60; midi < 68; midi++) await engine.noteOn(midi, 0.8, `v${midi}`);
  expect(oscillators).toHaveLength(24);
  engine.noteOff(60, "v60");
  expect(oscillators.filter((osc) => osc.stop.mock.calls.length)).toHaveLength(3);
  engine.stopAll(); expect(oscillators.filter((osc) => osc.stop.mock.calls.length)).toHaveLength(24);
});
it("plays built-in recordings by default after loading, without oscillator synthesis", async () => {
  const engine = new PianoEngine();
  await engine.loadBuiltInPiano();
  await engine.noteOn(21, 0.78, "left");
  await engine.noteOn(21, 0.78, "right");
  expect(engine.mode).toBe("samples");
  expect(oscillators).toHaveLength(0);
  expect(sampleSources).toHaveLength(2);
  engine.noteOff(21, "left");
  expect(sampleSources[0].stop).toHaveBeenCalledOnce();
  expect(sampleSources[1].stop).not.toHaveBeenCalled();
  engine.stopAll(); expect(sampleSources[1].stop).toHaveBeenCalledOnce();
});
it("pause silences released playback tails while preserving a manually held high note", async () => {
  const engine = new PianoEngine(); await engine.loadBuiltInPiano();
  await engine.noteOn(96, 0.78, "playback:0");
  await engine.noteOn(96, 0.78, "manual:96");
  engine.noteOff(96, "playback:0");
  expect(sampleSources[0].stop).not.toHaveBeenCalled();
  engine.stopPlayback();
  expect(sampleSources[0].stop).toHaveBeenCalledOnce();
  expect(sampleSources[1].stop).not.toHaveBeenCalled();
  engine.stopAll(); expect(sampleSources[1].stop).toHaveBeenCalledOnce();
});

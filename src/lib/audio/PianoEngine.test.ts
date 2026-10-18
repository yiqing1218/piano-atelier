import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const banks = vi.hoisted(() => ({ fail: false, instances: [] as Array<Record<string, any>> }));
vi.mock("spessasynth_lib", () => ({
  WorkletSynthesizer: class {
    isReady = Promise.resolve();
    presetList = [{ bankMSB: 0, bankLSB: 0, program: 0, isGMGSDrum: false, name: "Test piano" }];
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
const gain = () => ({
  gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() },
  connect: vi.fn(), disconnect: vi.fn(),
});
class Context {
  currentTime = 0; destination = {}; state = suspended ? "suspended" : "running";
  audioWorklet = { addModule: vi.fn(async () => { if (moduleMissing) throw new Error("missing worklet"); }) };
  createGain = gain;
  createOscillator() {
    const osc = { type: "sine", frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    oscillators.push(osc); return osc;
  }
  resume() { return new Promise<void>((resolve) => { resume = () => { this.state = "running"; resolve(); }; if (!suspended) resume(); }); }
}
const buffer = () => new Uint8Array([82,73,70,70,4,0,0,0,115,102,98,107]).buffer;
beforeEach(() => {
  banks.fail = false; banks.instances = []; oscillators = []; suspended = false; moduleMissing = false;
  vi.stubGlobal("AudioContext", Context);
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

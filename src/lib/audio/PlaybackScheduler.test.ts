import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackScheduler, type PlaybackCallbacks } from "./PlaybackScheduler";
import type { PianoEngine } from "./PianoEngine";
import type { NoteEvent } from "../../types/music";

function setup() {
  const sounding = new Map<string, number>();
  const events: string[] = [];
  const engine = {
    prepare: async () => {},
    get currentTime() { return performance.now() / 1000; },
    noteOn: async (midi: number, _velocity: number, id = String(midi)) => {
      sounding.set(id, midi); events.push(`on:${midi}`);
    },
    noteOff: (midi: number, id = String(midi)) => { sounding.delete(id); events.push(`off:${midi}`); },
    stopAll: () => sounding.clear(),
    stopPlayback: () => { for (const id of sounding.keys()) if (id.startsWith("playback:")) sounding.delete(id); },
  };
  const callbacks: PlaybackCallbacks = {
    onPosition: vi.fn(), onNoteOn: vi.fn(), onNoteOff: vi.fn(), onEnd: vi.fn(), onError: vi.fn(),
  };
  return { engine, sounding, events, callbacks, scheduler: new PlaybackScheduler(engine as unknown as PianoEngine) };
}
const note = (id: string, midi: number, start: number, duration: number): NoteEvent =>
  ({ id, midi, start, duration, velocity: 0.8 });

describe("transport scheduling", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("passes instrument and percussion metadata unchanged when seeking into a held note", async () => {
    const s = setup();
    const on = vi.spyOn(s.engine, "noteOn");
    const drum = { ...note("drum", 36, 0, 2), track: 9, program: 0, channel: 9, percussion: true };
    await s.scheduler.start([drum], 0.5, 1, s.callbacks);
    expect(on).toHaveBeenCalledWith(36, 0.8, expect.stringMatching(/^playback:/), drum);
    s.scheduler.stop();
  });

  it("keeps overlapping instances of a repeated pitch alive independently", async () => {
    const s = setup();
    await s.scheduler.start([note("a", 60, 0, 1), note("b", 60, 0.5, 1)], 0, 1, s.callbacks);
    await vi.advanceTimersByTimeAsync(1100);
    expect([...s.sounding.values()]).toEqual([60]);
    expect(s.callbacks.onNoteOff).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(s.sounding.size).toBe(0);
    expect(s.callbacks.onNoteOff).toHaveBeenCalledWith(60);
    expect(s.callbacks.onEnd).toHaveBeenCalledOnce();
  });

  it("releases an adjacent repeated note before retriggering the next", async () => {
    const s = setup();
    await s.scheduler.start([note("a", 60, 0, 0.5), note("b", 60, 0.5, 0.5)], 0, 1, s.callbacks);
    await vi.advanceTimersByTimeAsync(500);
    expect(s.events).toEqual(["on:60", "off:60", "on:60"]);
  });

  it("stop cancels future notes and releases voices without ending the song", async () => {
    const s = setup();
    await s.scheduler.start([note("a", 60, 0, 2), note("b", 64, 1, 1)], 0, 1, s.callbacks);
    await vi.advanceTimersByTimeAsync(400);
    expect(s.scheduler.position).toBeCloseTo(0.4, 2);
    s.scheduler.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.events).not.toContain("on:64");
    expect(s.sounding.size).toBe(0);
    expect(s.callbacks.onEnd).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resumes a sustained note at seek offset and applies speed to its remaining duration", async () => {
    const s = setup();
    await s.scheduler.start([note("a", 60, 0, 2)], 1, 0.5, s.callbacks);
    await vi.advanceTimersByTimeAsync(1000);
    expect([...s.sounding.values()]).toEqual([60]);
    expect(s.scheduler.position).toBeCloseTo(1.5, 2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.sounding.size).toBe(0);
    expect(s.callbacks.onEnd).toHaveBeenCalledOnce();
  });

  it("does not start after stop while audio initialization is pending", async () => {
    const s = setup();
    let ready!: () => void;
    s.engine.prepare = () => new Promise<void>((resolve) => { ready = resolve; });
    const starting = s.scheduler.start([note("a", 60, 0, 1)], 0, 1, s.callbacks);
    s.scheduler.stop(); ready(); await starting;
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.sounding.size).toBe(0);
    expect(s.events).toEqual([]);
    expect(s.callbacks.onEnd).not.toHaveBeenCalled();
  });

  it("reports audio initialization errors", async () => {
    const s = setup();
    s.engine.prepare = async () => { throw new Error("audio unavailable"); };
    await s.scheduler.start([note("a", 60, 0, 1)], 0, 1, s.callbacks);
    expect(s.callbacks.onError).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

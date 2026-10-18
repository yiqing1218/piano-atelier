import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SampledPiano, selectPianoSample } from "./SampledPiano";

function audio() {
  const sources: any[] = [];
  const gains: any[] = [];
  const context = {
    currentTime: 2, sampleRate: 48000,
    decodeAudioData: vi.fn(async () => ({ duration: 20, length: 960000, sampleRate: 48000, numberOfChannels: 2 })),
    createGain: () => {
      const node = { gain: { setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(node); return node;
    },
    createBufferSource: () => {
      const node = { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      sources.push(node); return node;
    },
  };
  return { context, sources, gains, piano: new SampledPiano(context as unknown as AudioContext, {} as AudioNode) };
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(12) }))));
afterEach(() => vi.unstubAllGlobals());

it("uses the actual A0 and C8 recordings at the piano endpoints", () => {
  expect(selectPianoSample(21, 0.78)).toMatchObject({ root: 21, layer: 12, file: "A0v12.ogg", rate: 1 });
  expect(selectPianoSample(108, 0.78)).toMatchObject({ root: 108, layer: 12, file: "C8v12.ogg", rate: 1 });
  expect(selectPianoSample(22, 0.78).rate).toBeCloseTo(2 ** (1 / 12), 8);
});
it("selects distinct recorded velocity layers rather than just changing volume", () => {
  expect([0.25, 0.55, 0.78, 1].map((v) => selectPianoSample(60, v).file)).toEqual([
    "C4v4.ogg", "C4v8.ogg", "C4v12.ogg", "C4v16.ogg",
  ]);
});
it("loads a shared sharp-note sample once with a local fragment-safe URL", async () => {
  const s = audio();
  await Promise.all([s.piano.prepareNotes([{ midi: 27, velocity: 0.78 }]), s.piano.prepareNotes([{ midi: 27, velocity: 0.78 }])]);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith("/piano-samples/Ds1v12.ogg");
  expect(s.context.decodeAudioData).toHaveBeenCalledOnce();
});
it("starts stereo sample buffers and releases each voice independently", async () => {
  const s = audio();
  await s.piano.prepareNotes([{ midi: 21, velocity: 0.78 }, { midi: 22, velocity: 0.78 }]);
  const first = await s.piano.noteOn(21, 0.78), second = await s.piano.noteOn(22, 0.78);
  expect(s.sources).toHaveLength(2);
  expect(s.sources[0].buffer.numberOfChannels).toBe(2);
  expect(s.sources[1].playbackRate.value).toBeCloseTo(2 ** (1 / 12), 8);
  first!.release();
  expect(s.sources[0].stop).toHaveBeenCalledOnce();
  expect(s.sources[1].stop).not.toHaveBeenCalled();
  second!.release(); second!.release();
  expect(s.sources[1].stop).toHaveBeenCalledOnce();
});
it("can cancel a note while its local sample is still decoding", async () => {
  const s = audio();
  let finish!: (value: any) => void;
  s.context.decodeAudioData.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  let held = true;
  const pending = s.piano.noteOn(21, 0.78, () => held);
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  held = false; finish({ length: 960000, numberOfChannels: 2 });
  expect(await pending).toBeNull();
  expect(s.sources).toHaveLength(0);
});
it("reports missing samples and retries them instead of caching a failure", async () => {
  const s = audio();
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
  await expect(s.piano.prepareNotes([{ midi: 21, velocity: 0.78 }])).rejects.toThrow(/采样/);
  await s.piano.prepareNotes([{ midi: 21, velocity: 0.78 }]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("lets high strings ring after key release but silences them on stop", async () => {
  const s = audio();
  const voice = await s.piano.noteOn(96, 0.78);
  voice!.release();
  expect(s.sources[0].stop).not.toHaveBeenCalled();
  s.piano.stopAll();
  expect(s.sources[0].stop).toHaveBeenCalledOnce();
});

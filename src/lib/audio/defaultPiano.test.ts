import { expect, it, vi } from "vitest";
import { restorePiano } from "./defaultPiano";
it("uses bundled recordings when there is no imported soundfont", async () => {
  const engine = { loadBuiltInPiano: vi.fn(async () => {}), loadSoundfont: vi.fn(async () => {}) };
  expect(await restorePiano(engine, null)).toBe("Salamander · Yamaha C5");
  expect(engine.loadBuiltInPiano).toHaveBeenCalledOnce();
});
it("falls back to real bundled recordings if a saved imported font fails", async () => {
  const engine = { loadBuiltInPiano: vi.fn(async () => {}), loadSoundfont: vi.fn(async () => { throw new Error("invalid"); }) };
  expect(await restorePiano(engine, { name: "old.sf2", buffer: new ArrayBuffer(0) })).toBe("Salamander · Yamaha C5");
  expect(engine.loadBuiltInPiano).toHaveBeenCalledOnce();
});
it("respects an imported local font but replaces this project's synthetic test fixture on startup", async () => {
  const engine = { loadBuiltInPiano: vi.fn(async () => {}), loadSoundfont: vi.fn(async () => {}) };
  expect(await restorePiano(engine, { name: "my-piano.sf2", buffer: new ArrayBuffer(12) })).toBe("my-piano.sf2");
  expect(engine.loadBuiltInPiano).not.toHaveBeenCalled();
  expect(await restorePiano(engine, { name: "synthetic-test.sf2", buffer: new ArrayBuffer(12) })).toBe("Salamander · Yamaha C5");
  expect(engine.loadBuiltInPiano).toHaveBeenCalledOnce();
});

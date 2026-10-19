// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const audio = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), stop: vi.fn(), builtin: vi.fn(), clear: vi.fn(), configure: vi.fn(), instruments: vi.fn(), master: vi.fn(), trackVolume: vi.fn() }));
const songs = vi.hoisted(() => ({ items: [] as any[] }));
const native = vi.hoisted(() => ({ enabled: false, invoke: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.enabled, invoke: native.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: native.open }));
vi.mock("./lib/audio/PianoEngine", () => ({ PianoEngine: class {
  mode = "preview"; prepare = async () => {}; noteOn = audio.on; noteOff = audio.off; stopAll = audio.stop;
  loadBuiltInPiano = audio.builtin;
  configureInstruments = audio.configure; prepareInstruments = audio.instruments;
  setMasterVolume = audio.master; setTrackVolume = audio.trackVolume;
  stopPlayback = () => {};
  get currentTime() { return performance.now() / 1000; }
} }));
vi.mock("./lib/storage/soundfontStore", () => ({ loadSavedSoundfont: async () => null, saveSoundfont: async () => {}, clearSavedSoundfont: audio.clear }));
vi.mock("./lib/storage/songStore", () => ({
  listSongs: async () => [...songs.items],
  storeSong: async (name: string, bytes: ArrayBuffer, score: any) => {
    const id = [...new Uint8Array(bytes)].join(","); const existing = songs.items.find((item) => item.id === id);
    if (existing) return { song: existing, duplicate: true };
    const song = { id, name, bytes, score, addedAt: Date.now() }; songs.items.push(song); return { song, duplicate: false };
  },
  saveSongMix: async () => {},
  deleteSong: async (id: string) => { songs.items = songs.items.filter((song) => song.id !== id); },
}));
import App from "./App";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  audio.on.mockReset().mockResolvedValue(undefined); audio.off.mockReset(); audio.stop.mockReset();
  audio.builtin.mockReset().mockResolvedValue(undefined); audio.clear.mockReset().mockResolvedValue(undefined);
  audio.configure.mockReset(); audio.instruments.mockReset().mockResolvedValue(undefined);
  audio.master.mockReset(); audio.trackVolume.mockReset(); songs.items = [];
  native.enabled = false; native.invoke.mockReset(); native.open.mockReset();
  localStorage.setItem("piano-atelier-audiveris", "C:\\Tools\\Audiveris.exe");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  HTMLButtonElement.prototype.setPointerCapture = vi.fn();
  await act(async () => root.render(<App />));
});
it("offers both playback modes, prepares the offline bank, and applies the selected instrument", async () => {
  const mode = host.querySelector('[aria-label="播放模式"]') as HTMLSelectElement;
  const instrument = host.querySelector('[aria-label="演奏乐器"]') as HTMLSelectElement;
  expect(instrument.options).toHaveLength(133);
  await click('[title="播放"]');
  await act(async () => vi.advanceTimersByTimeAsync(620));
  await click('[title="停止"]');
  await act(async () => { instrument.value = "bass"; instrument.dispatchEvent(new Event("change", { bubbles: true })); });
  expect((host.querySelector('[aria-label="播放进度"]') as HTMLInputElement).value).toBe("0");
  expect(audio.instruments).toHaveBeenCalledOnce();
  expect(audio.configure).toHaveBeenLastCalledWith("unified", "bass", {});
  await act(async () => { mode.value = "multitrack"; mode.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(audio.configure).toHaveBeenLastCalledWith("multitrack", "bass", {});
  expect(host.textContent).toContain("MusicXML 原始配器暂未读取");
  expect(host.querySelectorAll('.piano-key')).toHaveLength(88);
});
it("keeps the previous instrument selection when its bank cannot load", async () => {
  audio.instruments.mockRejectedValueOnce(new Error("missing local bank"));
  const instrument = host.querySelector('[aria-label="演奏乐器"]') as HTMLSelectElement;
  await act(async () => { instrument.value = "violin"; instrument.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(audio.configure).not.toHaveBeenCalled();
  expect(instrument.value).toBe("piano");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("missing local bank");
});
it("loads the bundled six-track demo from a local asset and selects multitrack playback", async () => {
  const bytes = Uint8Array.from(readFileSync("tests/fixtures/band-demo.mid")).buffer;
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, arrayBuffer: async () => bytes }));
  vi.stubGlobal("fetch", fetcher);
  const button = [...host.querySelectorAll("button")].find((button) => button.textContent === "多轨演示")!;
  await click('[title="播放"]');
  await act(async () => vi.advanceTimersByTimeAsync(620));
  await click('[title="暂停"]');
  await act(async () => { button.click(); });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]?.[0]).not.toMatch(/^data:|^https?:/);
  expect(host.querySelectorAll(".track-list > div")).toHaveLength(6);
  expect(host.querySelector(".track-details")?.textContent).toContain("24 个音符");
  expect(audio.configure).toHaveBeenLastCalledWith("multitrack", "piano", {});
  expect((host.querySelector('[aria-label="播放进度"]') as HTMLInputElement).value).toBe("0");
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("automatically prepares real piano recordings on startup and offers an explicit restore button", async () => {
  expect(audio.builtin).toHaveBeenCalledOnce();
  const button = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("使用内置实录钢琴"));
  expect(button).toBeDefined();
  await act(async () => { button!.click(); });
  expect(audio.builtin).toHaveBeenCalledTimes(2);
  expect(audio.clear).toHaveBeenCalledOnce();
});
function key(type: string, code: string, target: EventTarget = window, options = {}) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...options });
  act(() => { target.dispatchEvent(event); }); return event;
}
async function click(selector: string) {
  await act(async () => { (host.querySelector(selector) as HTMLButtonElement).click(); });
}
async function importFixture(name: string) {
  const input = host.querySelector('input[accept*=".musicxml"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [{ name, arrayBuffer: async () => Uint8Array.from(readFileSync(`tests/fixtures/${name}`)).buffer }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
it("edits one track's instrument independently and controls its volume plus master volume", async () => {
  await importFixture("band-demo.mid");
  const mode = host.querySelector('[aria-label="播放模式"]') as HTMLSelectElement;
  await act(async () => { mode.value = "multitrack"; mode.dispatchEvent(new Event("change", { bubbles: true })); });
  const track = host.querySelector('[aria-label="音轨 1 乐器"]') as HTMLSelectElement;
  await act(async () => { track.value = "erhu"; track.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(audio.configure).toHaveBeenLastCalledWith("multitrack", "piano", { 0: { instrument: "erhu", volume: 1 } });
  expect((host.querySelector('[aria-label="音轨 2 乐器"]') as HTMLSelectElement).value).toBe("");
  for (const [label, value] of [["音轨 1 音量", "25"], ["总音量", "40"]]) {
    const slider = host.querySelector(`[aria-label="${label}"]`)!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, value); slider.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  expect(audio.trackVolume).toHaveBeenCalledWith(0, 0.25); expect(audio.master).toHaveBeenCalledWith(0.4);
});
it("deduplicates imported songs, advances through the library, and can delete a song", async () => {
  await importFixture("piano-tempo.mid"); await importFixture("band-demo.mid"); await importFixture("band-demo.mid");
  expect(host.querySelectorAll('.library-row')).toHaveLength(2);
  const repeat = host.querySelector('[aria-label="循环模式"]') as HTMLSelectElement;
  await act(async () => { repeat.value = "list"; repeat.dispatchEvent(new Event("change", { bubbles: true })); });
  await click('[title="播放"]');
  await act(async () => vi.advanceTimersByTimeAsync(2050));
  expect(host.querySelector('.track-main h2')?.textContent).toBe("piano-tempo");
  expect(host.querySelector('[title="暂停"]')).not.toBeNull();
  await click('[title="停止"]');
  await click('[aria-label="从曲库删除 band-demo.mid"]');
  expect(host.querySelectorAll('.library-row')).toHaveLength(1);
});
it("releases the original held pitch after shifting octave", async () => {
  key("keydown", "Digit1");
  await click('[title="电脑键盘映射升高一个八度"]');
  key("keyup", "Digit1");
  expect(audio.on).toHaveBeenCalledWith(48, 0.78, "keyboard:Digit1");
  expect(audio.off).toHaveBeenCalledWith(48, "keyboard:Digit1");
  expect(host.querySelectorAll(".is-active")).toHaveLength(0);
});
it("preserves shortcuts, editable inputs and key rollover", () => {
  for (const option of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
    expect(key("keydown", "KeyQ", window, option).defaultPrevented).toBe(false);
  }
  key("keydown", "KeyQ", host.querySelector("input")!);
  expect(audio.on).not.toHaveBeenCalled();
  for (const code of ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8"]) key("keydown", code);
  key("keydown", "Digit1", window, { repeat: true });
  expect(audio.on).toHaveBeenCalledTimes(8);
  act(() => window.dispatchEvent(new Event("blur")));
  expect(audio.off).toHaveBeenCalledTimes(8);
});
it("pauses accurately and keeps playing after seek and speed changes", async () => {
  await click('[title="播放"]');
  await act(async () => vi.advanceTimersByTimeAsync(620));
  await click('[title="暂停"]');
  const progress = host.querySelector('[aria-label="播放进度"]') as HTMLInputElement;
  expect(Number(progress.value)).toBeCloseTo(0.62, 2);
  await click('[title="播放"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(progress, "2");
    progress.dispatchEvent(new Event("input", { bubbles: true }));
    progress.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.querySelector('[title="暂停"]')).not.toBeNull();
  const speed = host.querySelector('[aria-label="播放速度"]') as HTMLSelectElement;
  await act(async () => { speed.value = "0.5"; speed.dispatchEvent(new Event("change", { bubbles: true })); });
  const before = Number(progress.value);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(Number(progress.value) - before).toBeCloseTo(0.5, 1);
});
it("shows notation limitations after importing MusicXML", async () => {
  const input = host.querySelector('input[accept*=".musicxml"]')!;
  const data = readFileSync("tests/fixtures/unsupported.musicxml");
  Object.defineProperty(input, "files", { value: [{ name: "unsupported.musicxml", arrayBuffer: async () => Uint8Array.from(data).buffer }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(host.textContent).toMatch(/反复记号尚未展开/);
  expect(host.textContent).toMatch(/力度记号尚未应用/);
});
it("does not report recognition success when the native process returns no output", async () => {
  native.enabled = true; native.open.mockResolvedValue("C:\\Scores\\page.png");
  native.invoke.mockRejectedValue("输出目录中没有找到 MusicXML/MXL 文件");
  await click(".import-section button");
  expect(native.invoke).toHaveBeenCalledWith("recognize_score", {
    inputPath: "C:\\Scores\\page.png", executablePath: "C:\\Tools\\Audiveris.exe",
  });
  expect(host.querySelector('[role="status"]')?.textContent).toMatch(/本地识谱失败.*没有找到/);
  expect(host.textContent).not.toMatch(/本地识谱完成/);
});
it("does not report recognition success for an unparseable returned MusicXML", async () => {
  native.enabled = true; native.open.mockResolvedValue("C:\\Scores\\page.pdf");
  native.invoke.mockImplementation(async (command) => command === "recognize_score"
    ? "C:\\Results\\empty.musicxml" : [...new TextEncoder().encode("<invalid/>")]);
  await click(".import-section button");
  expect(host.querySelector('[role="status"]')?.textContent).toMatch(/本地识谱失败/);
  expect(host.textContent).not.toMatch(/本地识谱完成/);
});

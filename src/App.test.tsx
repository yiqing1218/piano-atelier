// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const audio = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), stop: vi.fn() }));
const native = vi.hoisted(() => ({ enabled: false, invoke: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.enabled, invoke: native.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: native.open }));
vi.mock("./lib/audio/PianoEngine", () => ({ PianoEngine: class {
  mode = "preview"; prepare = async () => {}; noteOn = audio.on; noteOff = audio.off; stopAll = audio.stop;
  get currentTime() { return performance.now() / 1000; }
} }));
vi.mock("./lib/storage/soundfontStore", () => ({ loadSavedSoundfont: async () => null, saveSoundfont: async () => {} }));
import App from "./App";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  audio.on.mockReset().mockResolvedValue(undefined); audio.off.mockReset(); audio.stop.mockReset();
  native.enabled = false; native.invoke.mockReset(); native.open.mockReset();
  localStorage.setItem("piano-atelier-audiveris", "C:\\Tools\\Audiveris.exe");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  HTMLButtonElement.prototype.setPointerCapture = vi.fn();
  await act(async () => root.render(<App />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function key(type: string, code: string, target: EventTarget = window, options = {}) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...options });
  act(() => { target.dispatchEvent(event); }); return event;
}
async function click(selector: string) {
  await act(async () => { (host.querySelector(selector) as HTMLButtonElement).click(); });
}
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

import { expect, it, vi, beforeEach } from "vitest";
const native = vi.hoisted(() => ({ save: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: native.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: native.save }));
import { downloadFile } from "./musicExport";
beforeEach(() => { native.save.mockReset(); native.invoke.mockReset().mockResolvedValue(undefined); });
it("saves native audio as raw IPC bytes with a Unicode-safe user-selected destination", async () => {
  native.save.mockResolvedValue("D:\\音乐\\合奏.wav");
  const bytes = new ArrayBuffer(44);
  expect(await downloadFile("合奏.wav", bytes, "audio/wav")).toBe(true);
  expect(native.invoke).toHaveBeenCalledWith("write_export_file", bytes, { headers: { "x-export-path": encodeURIComponent("D:\\音乐\\合奏.wav") } });
});
it("does not write or claim a save when the user cancels the native dialog", async () => {
  native.save.mockResolvedValue(null);
  expect(await downloadFile("piece.mid", new ArrayBuffer(14), "audio/midi")).toBe(false);
  expect(native.invoke).not.toHaveBeenCalled();
});

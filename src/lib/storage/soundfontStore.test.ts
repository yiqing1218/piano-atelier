import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { clearSavedSoundfont, loadSavedSoundfont, saveSoundfont } from "./soundfontStore";
it("persists local soundfont bytes and restores them on a new database connection", async () => {
  expect(await loadSavedSoundfont()).toBeNull();
  const bytes = new Uint8Array([82, 73, 70, 70, 12, 0, 0, 0]).buffer;
  await saveSoundfont("local.sf2", bytes);
  const restored = await loadSavedSoundfont();
  expect(restored?.name).toBe("local.sf2");
  expect(new Uint8Array(restored!.buffer)).toEqual(new Uint8Array([82, 73, 70, 70, 12, 0, 0, 0]));
  await saveSoundfont("replacement.sf3", new Uint8Array([1, 2, 3]).buffer);
  expect((await loadSavedSoundfont())?.name).toBe("replacement.sf3");
  await clearSavedSoundfont();
  expect(await loadSavedSoundfont()).toBeNull();
});

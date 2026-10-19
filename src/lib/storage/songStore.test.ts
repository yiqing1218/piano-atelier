import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { deleteSong, listSongs, storeSong, saveSongMix } from "./songStore";
import type { ScoreDocument } from "../../types/music";
const score: ScoreDocument = { title: "Song", sourceName: "a.mid", format: "midi", notes: [{ id: "a", midi: 60, start: 0, duration: 1, velocity: 0.8 }], tempo: 120, duration: 1 };
it("deduplicates by contents even if renamed, persists settings, and deletes only the requested song", async () => {
  const a = await storeSong("a.mid", Uint8Array.of(1, 2, 3).buffer, score);
  const again = await storeSong("renamed.mid", Uint8Array.of(1, 2, 3).buffer, score);
  expect(a.duplicate).toBe(false); expect(again.duplicate).toBe(true);
  expect(again.song.id).toBe(a.song.id);
  const b = await storeSong("b.mid", Uint8Array.of(4, 5, 6).buffer, score);
  expect(await listSongs()).toHaveLength(2);
  await saveSongMix(a.song.id, { mode: "multitrack", instrument: "piano", tracks: { 0: { instrument: "erhu", volume: 0.4 } } });
  expect((await listSongs()).find((song) => song.id === a.song.id)?.mix?.tracks[0]).toEqual({ instrument: "erhu", volume: 0.4 });
  await deleteSong(a.song.id); expect((await listSongs()).map((song) => song.id)).toEqual([b.song.id]);
  await deleteSong(b.song.id);
});

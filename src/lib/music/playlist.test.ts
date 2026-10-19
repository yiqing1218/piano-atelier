import { expect, it } from "vitest";
import { nextSong } from "./playlist";
it("wraps the list, repeats one song, and shuffles without an immediate repeat", () => {
  expect(nextSong(["a", "b"], "b", "list")).toBe("a");
  expect(nextSong(["a", "b"], "a", "one")).toBe("a");
  expect(nextSong(["a", "b"], "a", "shuffle", () => 0)).toBe("b");
  expect(nextSong(["a"], "a", "shuffle")).toBe("a");
  expect(nextSong([], null, "list")).toBeNull();
  expect(nextSong(["a"], "a", "once")).toBeNull();
});

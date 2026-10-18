import { expect, it } from "vitest";
import { resolveInstrument } from "./instruments";

it("preserves original programs and channel-10 drums in multitrack mode", () => {
  expect(resolveInstrument("multitrack", "piano", { program: 33 })).toEqual({ program: 33, percussion: false });
  expect(resolveInstrument("multitrack", "violin", { program: 0, percussion: true })).toEqual({ program: 0, percussion: true });
});
it("revoices every track, including drums, to the chosen unified instrument", () => {
  expect(resolveInstrument("unified", "violin", { program: 33, percussion: true })).toEqual({ program: 40, percussion: false });
  expect(resolveInstrument("unified", "drums", { program: 0 })).toEqual({ program: 0, percussion: true });
});

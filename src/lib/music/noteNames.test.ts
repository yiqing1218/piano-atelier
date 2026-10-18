import { describe, expect, it } from "vitest";
import { formatTime, isBlackKey, midiToFrequency, midiToNoteName } from "./noteNames";
import { KEYBOARD_CODES, midiForKeyboardCode } from "./keyboardMap";

describe("note naming and keyboard mapping", () => {
  it("maps the standard piano endpoints", () => {
    expect(midiToNoteName(21)).toBe("A0");
    expect(midiToNoteName(60)).toBe("C4");
    expect(midiToNoteName(108)).toBe("C8");
  });

  it("identifies black keys and computes concert A", () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
    expect(midiToFrequency(69)).toBeCloseTo(440, 5);
  });

  it("maps physical computer key codes into MIDI notes", () => {
    expect(KEYBOARD_CODES.length).toBeGreaterThanOrEqual(40);
    expect(midiForKeyboardCode("Digit1", 48)).toBe(48);
    expect(midiForKeyboardCode("KeyQ", 48)).toBe(58);
    expect(midiForKeyboardCode("F1", 48)).toBeNull();
  });

  it("formats timeline timestamps", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(75.8)).toBe("1:15");
  });
});

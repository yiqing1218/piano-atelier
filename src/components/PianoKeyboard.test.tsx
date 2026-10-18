// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PianoKeyboard from "./PianoKeyboard";
import ScoreTimeline from "./ScoreTimeline";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  HTMLButtonElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function pointer(target: Element, type: string, id: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: id }, button: { value: 0 } });
  act(() => { target.dispatchEvent(event); });
}
it("renders all 88 distinct piano pitches, 52 white and 36 black", () => {
  act(() => root.render(<PianoKeyboard activeNotes={new Set()} baseMidi={48} onNoteOn={() => {}} onNoteOff={() => {}} />));
  expect(host.querySelectorAll(".piano-key")).toHaveLength(88);
  expect(host.querySelectorAll(".white-key")).toHaveLength(52);
  expect(host.querySelectorAll(".black-key")).toHaveLength(36);
  expect(host.querySelector('[aria-label="A0"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="C8"]')).not.toBeNull();
});
it("balances each pointer once, including capture loss and spurious releases", () => {
  const on = vi.fn(), off = vi.fn();
  act(() => root.render(<PianoKeyboard activeNotes={new Set()} baseMidi={48} onNoteOn={on} onNoteOff={off} />));
  const c = host.querySelector('[aria-label="C4"]')!;
  pointer(c, "pointerup", 1);
  expect(off).not.toHaveBeenCalled();
  pointer(c, "pointerdown", 1); pointer(c, "pointerdown", 2);
  expect(on).toHaveBeenCalledTimes(2);
  pointer(c, "pointerup", 1); pointer(c, "lostpointercapture", 1);
  pointer(c, "lostpointercapture", 2);
  expect(off).toHaveBeenCalledTimes(2);
});
it("supports eight simultaneous pointers and releases on window blur", () => {
  const on = vi.fn(), off = vi.fn();
  act(() => root.render(<PianoKeyboard activeNotes={new Set()} baseMidi={48} onNoteOn={on} onNoteOff={off} />));
  const keys = host.querySelectorAll(".white-key");
  for (let i = 0; i < 8; i++) pointer(keys[i], "pointerdown", i);
  expect(on).toHaveBeenCalledTimes(8);
  act(() => window.dispatchEvent(new Event("blur")));
  expect(off).toHaveBeenCalledTimes(8);
});
it("seeks correctly in a horizontally scrolled timeline", () => {
  const seek = vi.fn();
  act(() => root.render(<ScoreTimeline score={{ title: "x", sourceName: "x", format: "midi", duration: 10, tempo: 120, notes: [] }} position={0} activeNotes={new Set()} onSeek={seek} />));
  const roll = host.querySelector(".piano-roll")!;
  Object.defineProperty(host.querySelector(".timeline-scroll"), "scrollLeft", { value: 200 });
  roll.getBoundingClientRect = () => ({ left: -100, width: 1100 } as DOMRect);
  act(() => roll.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 450 })));
  expect(seek).toHaveBeenCalledWith(5);
});
it("highlights only the current instance of repeated pitches in the timeline", () => {
  const score = { title: "x", sourceName: "x", format: "midi" as const, duration: 2, tempo: 120,
    notes: [{ id: "a", midi: 60, start: 0, duration: 0.5, velocity: 0.8 }, { id: "b", midi: 60, start: 1, duration: 0.5, velocity: 0.8 }] };
  act(() => root.render(<ScoreTimeline score={score} position={1.1} activeNotes={new Set([60])} onSeek={() => {}} />));
  expect(host.querySelectorAll(".roll-note-active")).toHaveLength(1);
  expect(host.querySelector(".roll-note-active")?.getAttribute("title")).toContain("1.00s");
});

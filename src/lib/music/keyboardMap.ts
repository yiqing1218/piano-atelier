export const KEYBOARD_CODES = [
  "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0",
  "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP",
  "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote",
  "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash",
  "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash",
] as const;

const DISPLAY: Record<string, string> = {
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
  Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
};

export function keyboardCodeLabel(code: string): string {
  if (DISPLAY[code]) return DISPLAY[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function midiForKeyboardCode(code: string, baseMidi: number): number | null {
  const index = KEYBOARD_CODES.indexOf(code as (typeof KEYBOARD_CODES)[number]);
  if (index < 0) return null;
  const midi = baseMidi + index;
  return midi >= 21 && midi <= 108 ? midi : null;
}

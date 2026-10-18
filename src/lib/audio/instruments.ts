import type { NoteEvent } from "../../types/music";

export type PlaybackMode = "unified" | "multitrack";
export const INSTRUMENTS = [
  { id: "piano", name: "钢琴 · Yamaha C5", program: 0, percussion: false },
  { id: "guitar", name: "吉他 · 钢弦木吉他", program: 25, percussion: false },
  { id: "bass", name: "贝斯 · 指弹电贝斯", program: 33, percussion: false },
  { id: "violin", name: "小提琴", program: 40, percussion: false },
  { id: "strings", name: "弦乐合奏", program: 48, percussion: false },
  { id: "drums", name: "鼓组 · 标准套鼓", program: 0, percussion: true },
] as const;
export type InstrumentId = typeof INSTRUMENTS[number]["id"];
export interface InstrumentPatch { program: number; percussion: boolean }

export function resolveInstrument(mode: PlaybackMode, selected: InstrumentId, note?: Partial<NoteEvent>): InstrumentPatch {
  if (mode === "multitrack" && note) return { program: note.program ?? 0, percussion: note.percussion ?? false };
  const instrument = INSTRUMENTS.find((item) => item.id === selected) ?? INSTRUMENTS[0];
  return { program: instrument.program, percussion: instrument.percussion };
}

export function instrumentLabel(note: Partial<NoteEvent>): string {
  if (note.percussion) return `鼓组 · ${note.instrumentName || "Standard"}`;
  return INSTRUMENTS.find((item) => !item.percussion && item.program === (note.program ?? 0))?.name
    ?? `${note.instrumentName || "GM 乐器"} · Program ${(note.program ?? 0) + 1}`;
}

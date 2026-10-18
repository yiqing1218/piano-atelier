import { Midi } from "@tonejs/midi";
import type { NoteEvent, ScoreDocument } from "../../types/music";

export function parseMidiFile(fileName: string, buffer: ArrayBuffer): ScoreDocument {
  let midi: Midi;
  try { midi = new Midi(new Uint8Array(buffer)); }
  catch { throw new Error("MIDI 文件无效或已损坏，请重新导出为标准 MIDI 文件。"); }
  const notes: NoteEvent[] = [];
  const warnings = new Set<string>();

  midi.tracks.forEach((track, trackIndex) => {
    if (track.instrument.percussion) {
      if (track.notes.length) warnings.add("本版仅演奏钢琴，已略过 MIDI 打击乐音轨。");
      return;
    }
    track.notes.forEach((note, noteIndex) => {
      if (!Number.isFinite(note.duration) || note.duration <= 0) {
        warnings.add("已略过零时值或无效时值的 MIDI 音符。"); return;
      }
      if (note.midi < 21 || note.midi > 108) {
        warnings.add("已略过 A0–C8 范围以外的音符。"); return;
      }
      notes.push({
        id: `midi-${trackIndex}-${noteIndex}`,
        midi: note.midi,
        start: note.time,
        duration: note.duration,
        velocity: Math.max(0, Math.min(1, note.velocity)),
        track: trackIndex,
        part: track.name || `Track ${trackIndex + 1}`,
      });
    });
  });

  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  const duration = notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0);
  const tempo = midi.header.tempos[0]?.bpm ?? 120;

  if (!notes.length) throw new Error("MIDI 文件中没有可播放的音符事件。");

  return {
    title: fileName.replace(/\.(mid|midi)$/i, ""),
    sourceName: fileName,
    format: "midi",
    notes,
    duration,
    tempo,
    warnings: [...warnings],
  };
}

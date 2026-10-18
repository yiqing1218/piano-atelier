import { Midi } from "@tonejs/midi";
import type { NoteEvent, ScoreDocument } from "../../types/music";

export function parseMidiFile(fileName: string, buffer: ArrayBuffer): ScoreDocument {
  let midi: Midi;
  try { midi = new Midi(new Uint8Array(buffer)); }
  catch { throw new Error("MIDI 文件无效或已损坏，请重新导出为标准 MIDI 文件。"); }
  const notes: NoteEvent[] = [];
  const warnings = new Set<string>();

  midi.tracks.forEach((track, trackIndex) => {
    track.notes.forEach((note, noteIndex) => {
      if (!Number.isFinite(note.duration) || note.duration <= 0) {
        warnings.add("已略过零时值或无效时值的 MIDI 音符。"); return;
      }
      notes.push({
        id: `midi-${trackIndex}-${noteIndex}`,
        midi: note.midi,
        start: note.time,
        duration: note.duration,
        velocity: Math.max(0, Math.min(1, note.velocity)),
        track: trackIndex,
        part: track.name || `Track ${trackIndex + 1}`,
        program: track.instrument.number,
        channel: track.channel,
        percussion: track.instrument.percussion,
        instrumentName: track.instrument.name,
      });
    });
  });

  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  const duration = notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0);
  const tempo = midi.header.tempos[0]?.bpm ?? 120;
  if (midi.tracks.some((track) => Object.keys(track.controlChanges).length || track.pitchBends.length)) {
    warnings.add("当前保留音符、乐器编号和鼓轨；暂不还原 MIDI 音量、声像、踏板等控制器及弯音、GS/XG 扩展音色库。");
  }

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

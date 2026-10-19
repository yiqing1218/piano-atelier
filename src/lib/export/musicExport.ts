import type { NoteEvent } from "../../types/music";
import { clampVolume, resolveInstrument, type MixSettings, type InstrumentPatch } from "../audio/instruments";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export interface RenderNote extends NoteEvent { patch: InstrumentPatch; volume: number }
export function renderNotes(notes: NoteEvent[], settings: MixSettings): RenderNote[] {
  const speed = Math.max(0.5, Math.min(1.5, settings.speed));
  return notes.map((note) => ({ ...note, start: note.start / speed, duration: note.duration / speed,
    volume: clampVolume(settings.tracks[note.track ?? 0]?.volume ?? 1),
    patch: resolveInstrument(settings.mode, settings.instrument, note, settings.tracks),
  }));
}

function vlq(value: number): number[] {
  const result = [value & 127]; value = Math.floor(value / 128);
  while (value) { result.unshift((value & 127) | 128); value = Math.floor(value / 128); }
  return result;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (text: string) => [...new TextEncoder().encode(text)];
function trackChunk(events: { tick: number; bytes: number[]; order: number }[]): number[] {
  let last = 0; const body: number[] = [];
  for (const event of events.sort((a, b) => a.tick - b.tick || a.order - b.order)) {
    body.push(...vlq(event.tick - last), ...event.bytes); last = event.tick;
  }
  body.push(0, 255, 47, 0);
  return [...ascii("MTrk"), ...u32(body.length), ...body];
}

/** Constant 120-BPM encoding preserves the normalized absolute timing (including speed).
 * MIDI ports keep more than 15 melodic tracks from sharing a program channel.
 */
export function exportMidi(notes: NoteEvent[], settings: MixSettings): Uint8Array<ArrayBuffer> {
  const groups = new Map<string, RenderNote[]>();
  for (const note of renderNotes(notes, settings)) {
    const key = `${note.track ?? 0}:${note.patch.bankMSB ?? 0}:${note.patch.program}:${note.patch.percussion}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(note);
  }
  const chunks = [trackChunk([{ tick: 0, bytes: [255, 81, 3, 7, 161, 32], order: -10 }])];
  let melodic = 0, drums = 0;
  for (const group of groups.values()) {
    const { patch, volume } = group[0];
    const slot = melodic % 15;
    const channel = patch.percussion ? 9 : slot >= 9 ? slot + 1 : slot;
    const port = patch.percussion ? drums++ : Math.floor(melodic++ / 15);
    if (port > 127) throw new Error("音轨过多，超出 MIDI 端口导出范围。");
    const title = ascii(group[0].part ?? `Track ${(group[0].track ?? 0) + 1}`);
    const events = [
      { tick: 0, order: -10, bytes: [255, 33, 1, port] },
      { tick: 0, order: -9, bytes: [255, 3, ...vlq(title.length), ...title] },
      { tick: 0, order: -8, bytes: [192 | channel, patch.program] },
      { tick: 0, order: -7, bytes: [176 | channel, 0, patch.bankMSB ?? 0] },
      { tick: 0, order: -6, bytes: [176 | channel, 32, 0] },
      { tick: 0, order: -5, bytes: [192 | channel, patch.program] },
      { tick: 0, order: -4, bytes: [176 | channel, 7, Math.round(clampVolume(settings.master) * 127)] },
      { tick: 0, order: -3, bytes: [176 | channel, 11, Math.round(volume * 127)] },
    ];
    for (const note of group) {
      const start = Math.max(0, Math.round(note.start * 960));
      events.push({ tick: start, order: 1, bytes: [144 | channel, note.midi, Math.max(1, Math.round(note.velocity * 127))] });
      events.push({ tick: Math.max(start + 1, Math.round((note.start + note.duration) * 960)), order: 0, bytes: [128 | channel, note.midi, 0] });
    }
    chunks.push(trackChunk(events));
  }
  const header = [...ascii("MThd"), 0, 0, 0, 6, 0, 1, (chunks.length >>> 8) & 255, chunks.length & 255, 1, 224];
  const total = header.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total); result.set(header);
  let offset = header.length;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export function encodeWav(channels: Float32Array[], rate: number): ArrayBuffer {
  if (channels.length !== 2 || channels[0].length !== channels[1].length) throw new Error("WAV 需要等长双声道数据。");
  const size = channels[0].length * 4;
  const buffer = new ArrayBuffer(44 + size), view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + size, true); text(8, "WAVEfmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, size, true);
  for (let i = 0; i < channels[0].length; i++) for (let c = 0; c < 2; c++) {
    const value = Math.max(-1, Math.min(1, channels[c][i]));
    view.setInt16(44 + (i * 2 + c) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}

export async function downloadFile(name: string, bytes: ArrayBuffer | Uint8Array<ArrayBuffer>, type: string): Promise<boolean> {
  const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  if (isTauri()) {
    const extension = type === "audio/wav" ? "wav" : "mid";
    const path = await save({ defaultPath: safeName, filters: [{ name: extension === "wav" ? "WAV 音频" : "MIDI 乐谱", extensions: [extension] }] });
    if (!path) return false;
    await invoke("write_export_file", bytes, { headers: { "x-export-path": encodeURIComponent(path) } });
    return true;
  }
  const blob = new Blob([bytes], { type }); const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = safeName;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

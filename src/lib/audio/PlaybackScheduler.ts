import type { NoteEvent } from "../../types/music";
import type { PianoEngine } from "./PianoEngine";

export interface PlaybackCallbacks {
  onPosition: (seconds: number) => void;
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
  onEnd: () => void;
  onError?: (error: unknown) => void;
}

/** Audio-clock transport with one cancellable event timer and a separate display timer.
 * Future MIDI messages stay here, not in the worklet, so stop/seek can cancel them.
 */
export class PlaybackScheduler {
  private eventTimer: ReturnType<typeof setTimeout> | null = null;
  private displayTimer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private running = false;
  private offset = 0;
  private audioStart = 0;
  private speed = 1;
  private duration = 0;
  private frozenPosition = 0;
  private active = new Map<string, NoteEvent>();
  private counts = new Map<number, number>();
  private callbacks: PlaybackCallbacks | null = null;

  constructor(private readonly engine: PianoEngine) {}

  get position(): number {
    return this.running
      ? Math.min(this.duration, this.offset + Math.max(0, this.engine.currentTime - this.audioStart) * this.speed)
      : this.frozenPosition;
  }

  async start(notes: NoteEvent[], offsetSeconds: number, speed: number, callbacks: PlaybackCallbacks, scoreDuration?: number): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.callbacks = callbacks;
    this.speed = Number.isFinite(speed) ? Math.max(0.5, Math.min(1.5, speed)) : 1;
    this.duration = notes.reduce((max, note) => Math.max(max, note.start + note.duration), scoreDuration ?? 0);
    this.offset = Number.isFinite(offsetSeconds) ? Math.max(0, Math.min(offsetSeconds, this.duration)) : 0;
    this.frozenPosition = this.offset;
    try {
      await this.engine.prepare(notes.filter((note) => note.start + note.duration > this.offset && note.start < this.offset + 4));
      if (generation !== this.generation) return;
      this.audioStart = this.engine.currentTime;
      this.running = true;
      const events: Array<{ at: number; on: boolean; note: NoteEvent; voice: string }> = [];
      notes.forEach((note, index) => {
        if (note.start + note.duration <= this.offset) return;
        const voice = `playback:${generation}:${index}`;
        events.push({ at: Math.max(this.offset, note.start), on: true, note, voice });
        events.push({ at: note.start + note.duration, on: false, note, voice });
      });
      events.sort((a, b) => a.at - b.at || Number(a.on) - Number(b.on));
      let index = 0;
      const tick = () => {
        if (generation !== this.generation) return;
        const position = this.position;
        while (index < events.length && events[index].at <= position + 0.00001) {
          const { on, note, voice } = events[index++];
          if (on) {
            // Do not replay expired notes after a delayed timer.
            if (note.start + note.duration <= position) continue;
            this.active.set(voice, note);
            const count = this.counts.get(note.midi) ?? 0;
            this.counts.set(note.midi, count + 1);
            if (!count) callbacks.onNoteOn(note.midi);
            void this.engine.noteOn(note.midi, note.velocity, voice, note).catch((error) => {
              if (generation !== this.generation) return;
              this.stop(); callbacks.onError?.(error);
            });
          } else if (this.active.delete(voice)) {
            this.engine.noteOff(note.midi, voice);
            const remaining = (this.counts.get(note.midi) ?? 1) - 1;
            if (remaining) this.counts.set(note.midi, remaining);
            else { this.counts.delete(note.midi); callbacks.onNoteOff(note.midi); }
          }
        }
        if (position >= this.duration) {
          this.stop();
          this.frozenPosition = this.duration;
          callbacks.onPosition(this.duration);
          callbacks.onEnd();
          return;
        }
        const next = events[index]?.at ?? this.duration;
        this.eventTimer = setTimeout(tick, Math.max(1, Math.min(100, (next - position) / this.speed * 1000)));
      };
      this.displayTimer = setInterval(() => callbacks.onPosition(this.position), 35);
      callbacks.onPosition(this.offset);
      tick();
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop(); callbacks.onError?.(error);
    }
  }

  stop(): void {
    this.frozenPosition = this.position;
    this.running = false;
    this.generation++;
    if (this.eventTimer !== null) clearTimeout(this.eventTimer);
    if (this.displayTimer !== null) clearInterval(this.displayTimer);
    this.eventTimer = this.displayTimer = null;
    for (const [voice, note] of this.active) this.engine.noteOff(note.midi, voice);
    this.engine.stopPlayback();
    this.active.clear();
    for (const midi of this.counts.keys()) this.callbacks?.onNoteOff(midi);
    this.counts.clear();
    this.callbacks = null;
  }
}

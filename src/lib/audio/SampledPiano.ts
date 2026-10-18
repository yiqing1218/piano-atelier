import config from "./pianoSamples.json";

export interface SampleVoice { release: (force?: boolean) => void }
type PitchedNote = { midi: number; velocity: number };
const ASCII_NOTES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];

export function selectPianoSample(midi: number, velocity: number) {
  const root = config.roots.reduce((best, candidate) => Math.abs(candidate - midi) < Math.abs(best - midi) ? candidate : best);
  const midiVelocity = velocity * 127;
  const layer = config.layers.reduce((best, candidate) => Math.abs(candidate.velocity - midiVelocity) < Math.abs(best.velocity - midiVelocity) ? candidate : best);
  return {
    root, layer: layer.id, recordedVelocity: layer.velocity,
    file: `${ASCII_NOTES[root % 12]}${Math.floor(root / 12) - 1}v${layer.id}.ogg`,
    rate: 2 ** ((midi - root) / 12),
  };
}

/** Stereo acoustic recordings; no oscillators, EQ, reverb or synthesized partials.
 * Keep a bounded LRU of decoded buffers. Active sources retain their own buffers.
 */
export class SampledPiano {
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private decodedBytes = 0;
  private active = new Map<SampleVoice, string>();
  private readonly maxDecodedBytes = 192 * 1024 * 1024;

  constructor(private readonly context: AudioContext, private readonly output: AudioNode) {}

  async prepare(): Promise<void> {
    // Warm the layer used by the default mouse/keyboard and demonstration score.
    await this.prepareNotes(config.roots.map((midi) => ({ midi, velocity: 0.78 })));
  }

  async prepareNotes(notes: readonly PitchedNote[]): Promise<void> {
    const files = [...new Set(notes.map((note) => selectPianoSample(note.midi, note.velocity).file))];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
      while (next < files.length) await this.load(files[next++]);
    }));
  }

  private load(file: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(file);
    if (cached) {
      this.buffers.delete(file); this.buffers.set(file, cached);
      return Promise.resolve(cached);
    }
    const pending = this.pending.get(file);
    if (pending) return pending;
    const loading = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}piano-samples/${encodeURIComponent(file)}`);
      if (!response.ok) throw new Error(`本地钢琴采样缺失：${file}（${response.status}），请重新构建应用。`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(file, buffer);
      this.decodedBytes += buffer.length * buffer.numberOfChannels * 4;
      while (this.decodedBytes > this.maxDecodedBytes && this.buffers.size > 1) {
        const oldest = this.buffers.keys().next().value!;
        const removed = this.buffers.get(oldest)!;
        this.buffers.delete(oldest);
        this.decodedBytes -= removed.length * removed.numberOfChannels * 4;
      }
      return buffer;
    })().finally(() => this.pending.delete(file));
    this.pending.set(file, loading);
    return loading;
  }

  async noteOn(midi: number, velocity: number, stillHeld: () => boolean = () => true, owner = ""): Promise<SampleVoice | null> {
    const sample = selectPianoSample(midi, velocity);
    const buffer = await this.load(sample.file);
    if (!stillHeld()) return null;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = sample.rate;
    // Retain the sample's real attack/decay and stereo image, only trim overall level.
    gain.gain.setValueAtTime(0.65 * Math.min(1.25, Math.sqrt(velocity * 127 / sample.recordedVelocity)), this.context.currentTime);
    source.connect(gain); gain.connect(this.output);
    let released = false, ended = false;
    source.onended = () => { ended = true; this.active.delete(voice); source.disconnect(); gain.disconnect(); };
    source.start(this.context.currentTime);
    const voice: SampleVoice = { release: (force = false) => {
      if (ended || (released && !force)) return;
      released = true;
      // The highest piano strings have no dampers; allow their recorded tail.
      if (midi >= 89 && !force) return;
      const now = this.context.currentTime;
      const release = force ? 0.01 : midi < 48 ? 0.1 : 0.055;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.00001, now, release);
      try { source.stop(now + release * 5); } catch { /* already ended */ }
    } };
    this.active.set(voice, owner);
    return voice;
  }

  stopAll(prefix?: string): void {
    for (const [voice, owner] of this.active) {
      if (prefix !== undefined && !owner.startsWith(prefix)) continue;
      voice.release(true); this.active.delete(voice);
    }
  }
}

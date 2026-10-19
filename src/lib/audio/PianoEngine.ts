import { WorkletSynthesizer } from "spessasynth_lib";
import { midiToFrequency } from "../music/noteNames";
import { SampledPiano, type SampleVoice } from "./SampledPiano";
import pianoConfig from "./pianoSamples.json";
import { InstrumentBank } from "./InstrumentBank";
import { clampVolume, resolveInstrument, type PlaybackMode, type InstrumentId, type TrackMixes } from "./instruments";
import type { NoteEvent } from "../../types/music";

interface Voice {
  midi: number;
  started: boolean;
  oscillators?: OscillatorNode[];
  gain?: GainNode;
  sample?: SampleVoice;
  bankChannel?: number;
  pianoChannel?: number;
}

export class PianoEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private synth: WorkletSynthesizer | null = null;
  private voices = new Map<string, Voice>();
  private processorReady: Promise<void> | null = null;
  private loadVersion = 0;
  private presetName = "";
  private sampledPiano: SampledPiano | null = null;
  private useSamples = false;
  private samplePreparation: Promise<void> | null = null;
  private instruments: InstrumentBank | null = null;
  private playbackMode: PlaybackMode = "unified";
  private selectedInstrument: InstrumentId = "piano";
  private trackMixes: TrackMixes = {};
  private masterVolume = 1;
  private trackOutputs = new Map<number, GainNode>();
  private pianoChannels = new Map<number, number>();
  private pianoBank = { bankMSB: 0, bankLSB: 0 };
  private customPiano: ArrayBuffer | null = null;
  get customPianoBuffer(): ArrayBuffer | null { return this.customPiano?.slice(0) ?? null; }

  setMasterVolume(value: number): void {
    this.masterVolume = clampVolume(value);
    if (this.master) this.master.gain.value = 0.72 * this.masterVolume;
  }

  setTrackVolume(track: number, value: number): void {
    const volume = clampVolume(value);
    this.trackMixes = { ...this.trackMixes, [track]: { ...this.trackMixes[track], volume } };
    const output = this.trackOutputs.get(track);
    if (output) output.gain.value = volume;
    this.instruments?.setTrackVolume(track, volume);
    const channel = this.pianoChannels.get(track);
    if (channel !== undefined) this.synth?.controllerChange(channel, 11, Math.round(volume * 127));
  }

  private outputFor(track?: number): AudioNode {
    if (track === undefined) return this.master!;
    let output = this.trackOutputs.get(track);
    if (!output) {
      output = this.getContext().createGain(); output.gain.value = this.trackMixes[track]?.volume ?? 1;
      output.connect(this.master!); this.trackOutputs.set(track, output);
    }
    return output;
  }

  configureInstruments(mode: PlaybackMode, instrument: InstrumentId, tracks: TrackMixes = {}): void {
    this.stopAll(); this.instruments?.reset();
    this.playbackMode = mode; this.selectedInstrument = instrument;
    this.trackMixes = structuredClone(tracks);
    for (const [track, output] of this.trackOutputs) output.gain.value = tracks[track]?.volume ?? 1;
  }

  private patch(note?: Partial<NoteEvent>) { return resolveInstrument(this.playbackMode, this.selectedInstrument, note, this.trackMixes); }
  private usesBank(note?: Partial<NoteEvent>): boolean {
    const patch = this.patch(note);
    return patch.percussion || patch.program !== 0 || Boolean(patch.bankMSB);
  }

  async prepareInstruments(): Promise<void> {
    this.instruments ??= new InstrumentBank(this.getContext(), this.master!);
    await this.instruments.prepare();
  }

  get mode(): "soundfont" | "samples" | "preview" { return this.synth ? "soundfont" : this.useSamples ? "samples" : "preview"; }
  get pianoName(): string { return this.presetName; }
  get currentTime(): number { return this.context?.currentTime ?? 0; }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = 0.72 * this.masterVolume;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  async prepare(notes?: readonly (Partial<NoteEvent> & { midi: number; velocity: number })[]): Promise<void> {
    const context = this.getContext();
    if (context.state !== "running") await context.resume();
    await this.samplePreparation;
    if (notes?.some((note) => this.usesBank(note))) await this.prepareInstruments();
    if (this.useSamples && notes) await this.sampledPiano!.prepareNotes(notes.filter((note) => !this.usesBank(note)));
  }

  async loadBuiltInPiano(): Promise<void> {
    const version = ++this.loadVersion;
    const context = this.getContext();
    this.sampledPiano ??= new SampledPiano(context, this.master!);
    const preparation = this.sampledPiano.prepare();
    this.samplePreparation = preparation;
    try {
      await preparation;
      if (version !== this.loadVersion) throw new Error("已取消旧音源加载。");
      this.stopAll(); this.synth?.destroy(); this.synth = null;
      this.useSamples = true; this.presetName = pianoConfig.name; this.customPiano = null; this.pianoChannels.clear();
    } finally {
      if (this.samplePreparation === preparation) this.samplePreparation = null;
    }
  }

  async loadSoundfont(buffer: ArrayBuffer): Promise<void> {
    const decoder = new TextDecoder();
    if (decoder.decode(buffer.slice(0, 4)) !== "RIFF" || !["sfbk", "DLS "].includes(decoder.decode(buffer.slice(8, 12)))) {
      throw new Error("不是有效的 SF2 / SF3 / DLS 音源文件。");
    }
    const version = ++this.loadVersion;
    const context = this.getContext();
    if (!this.processorReady) {
      this.processorReady = context.audioWorklet.addModule(`${import.meta.env.BASE_URL}spessasynth_processor.min.js`)
        .catch((error) => { this.processorReady = null; throw new Error(`本地 AudioWorklet 处理器加载失败：${String(error)}`); });
    }
    await this.processorReady;
    const synth = new WorkletSynthesizer(context);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          // addSoundBank transfers its ArrayBuffer. Keep the caller's bytes intact for IndexedDB.
          await synth.soundBankManager.addSoundBank(buffer.slice(0), "local-piano");
          await synth.isReady;
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("音源加载超时，请检查文件或重新加载。")), 30000);
        }),
      ]);
      if (version !== this.loadVersion) throw new Error("已取消旧音源加载。");
      const piano = synth.presetList.find((p) => p.program === 0 && !p.isDrum && !p.isGMGSDrum && p.bankMSB === 0 && p.bankLSB === 0)
        ?? synth.presetList.find((p) => p.program === 0 && !p.isDrum && !p.isGMGSDrum);
      if (!piano) throw new Error("该音源没有钢琴预置 Program 0，请选择含钢琴的 SF2 / SF3 / DLS。");
      synth.setSystemParameter("effectsEnabled", false);
      synth.controllerChange(0, 0, piano.bankMSB);
      synth.controllerChange(0, 32, piano.bankLSB);
      synth.programChange(0, 0);
      synth.connect(this.master!);
      this.stopAll();
      this.synth?.destroy();
      this.synth = synth;
      this.useSamples = false;
      this.presetName = piano.name;
      this.pianoBank = { bankMSB: piano.bankMSB, bankLSB: piano.bankLSB };
      this.pianoChannels.clear(); this.customPiano = buffer.slice(0);
    } catch (error) {
      synth.destroy();
      throw error;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  async noteOn(midi: number, velocity = 0.78, source = `manual:${midi}`, note?: Partial<NoteEvent>): Promise<void> {
    if (!Number.isInteger(midi) || midi < 0 || midi > 127 || !Number.isFinite(velocity) || velocity <= 0) return;
    this.noteOff(midi, source);
    const voice: Voice = { midi, started: false };
    this.voices.set(source, voice);
    try {
      const context = this.getContext();
      if (context.state !== "running") await context.resume();
      await this.samplePreparation;
      if (this.usesBank(note)) await this.prepareInstruments();
      // Release/stop may have happened while resume was pending.
      if (this.voices.get(source) !== voice) return;
      const normalizedVelocity = Math.max(0.01, Math.min(1, velocity));
      const track = source.startsWith("playback:") ? note?.track ?? 0 : undefined;
      const volume = track === undefined ? 1 : this.trackMixes[track]?.volume ?? 1;
      voice.started = true;
      if (this.usesBank(note)) {
        voice.bankChannel = this.instruments!.channel(this.patch(note), track === undefined ? "manual" : `playback:${track}`, volume);
        this.instruments!.noteOn(voice.bankChannel, midi, Math.round(normalizedVelocity * 127));
        return;
      }
      if (this.useSamples) {
        voice.sample = await this.sampledPiano!.noteOn(midi, normalizedVelocity, () => this.voices.get(source) === voice, source, this.outputFor(track)) ?? undefined;
        return;
      }
      if (this.synth) {
        let channel = 0;
        if (track !== undefined) {
          const existing = this.pianoChannels.get(track);
          channel = existing ?? this.pianoChannels.size + 1;
          if (existing === undefined) {
            while (this.synth.midiChannels.length <= channel) this.synth.addNewChannel();
            this.synth.controllerChange(channel, 0, this.pianoBank.bankMSB); this.synth.controllerChange(channel, 32, this.pianoBank.bankLSB);
            this.synth.midiChannels[channel].setDrums(false); this.synth.programChange(channel, 0); this.pianoChannels.set(track, channel);
          }
        }
        voice.pianoChannel = channel;
        this.synth.controllerChange(channel, 11, Math.round(volume * 127));
        this.synth.noteOn(channel, midi, Math.round(normalizedVelocity * 127));
        return;
      }
      const now = context.currentTime;
      const voiceGain = context.createGain();
      voice.gain = voiceGain;
      voice.oscillators = [];
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.exponentialRampToValueAtTime(normalizedVelocity * 0.15, now + 0.012);
      voiceGain.gain.exponentialRampToValueAtTime(0.001, now + 4);
      voiceGain.connect(this.outputFor(track));
      const frequency = midiToFrequency(midi);
      const partials = [
        { ratio: 1, level: 1, type: "triangle" as OscillatorType },
        { ratio: 2, level: 0.24, type: "sine" as OscillatorType },
        { ratio: 3, level: 0.08, type: "sine" as OscillatorType },
      ];
      for (const partial of partials) {
        const oscillator = context.createOscillator();
        const partialGain = context.createGain();
        oscillator.type = partial.type;
        oscillator.frequency.value = frequency * partial.ratio;
        partialGain.gain.value = partial.level;
        oscillator.connect(partialGain); partialGain.connect(voiceGain);
        oscillator.onended = () => { oscillator.disconnect(); partialGain.disconnect(); };
        oscillator.start(now);
        voice.oscillators.push(oscillator);
      }
    } catch (error) {
      if (this.voices.get(source) === voice) this.noteOff(midi, source);
      throw error;
    }
  }

  noteOff(_midi: number, source = `manual:${_midi}`): void {
    const voice = this.voices.get(source);
    if (!voice) return;
    this.voices.delete(source);
    if (!voice.started) return;
    if (voice.bankChannel !== undefined) {
      if (![...this.voices.values()].some((other) => other.started && other.bankChannel === voice.bankChannel && other.midi === voice.midi)) {
        this.instruments?.noteOff(voice.bankChannel, voice.midi);
      }
      return;
    }
    if (voice.sample) { voice.sample.release(); return; }
    if (this.synth) {
      // A MIDI note-off releases every matching pitch on this channel. Keep it held
      // until the last overlapping input/playback instance releases that pitch.
      if (![...this.voices.values()].some((other) => other.started && other.pianoChannel === voice.pianoChannel && other.bankChannel === undefined && !other.sample && other.midi === voice.midi)) {
        this.synth.noteOff(voice.pianoChannel ?? 0, voice.midi);
      }
      return;
    }
    this.releasePreview(voice, 0.05);
  }

  private releasePreview(voice: Voice, release: number): void {
    if (!this.context || !voice.gain || !voice.oscillators) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, release);
    const gain = voice.gain;
    let remaining = voice.oscillators.length;
    voice.oscillators.forEach((oscillator) => {
      const cleanup = oscillator.onended;
      oscillator.onended = (event) => {
        cleanup?.call(oscillator, event);
        if (--remaining === 0) gain.disconnect();
      };
      try { oscillator.stop(now + release * 5); } catch { /* voice already ended */ }
    });
  }

  stopAll(): void {
    this.instruments?.stopAll();
    this.synth?.stopAll(true);
    this.sampledPiano?.stopAll();
    for (const voice of this.voices.values()) this.releasePreview(voice, 0.01);
    this.voices.clear();
  }

  stopPlayback(): void {
    for (const [source, voice] of this.voices) {
      if (source.startsWith("playback:")) this.noteOff(voice.midi, source);
    }
    this.sampledPiano?.stopAll("playback:");
    this.instruments?.stopPlayback();
    for (const channel of this.pianoChannels.values()) this.synth?.controllerChange(channel, 120, 0);
  }
}

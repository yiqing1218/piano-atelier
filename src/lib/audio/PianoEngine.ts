import { WorkletSynthesizer } from "spessasynth_lib";
import { midiToFrequency } from "../music/noteNames";

interface Voice {
  midi: number;
  started: boolean;
  oscillators?: OscillatorNode[];
  gain?: GainNode;
}

export class PianoEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private synth: WorkletSynthesizer | null = null;
  private voices = new Map<string, Voice>();
  private processorReady: Promise<void> | null = null;
  private loadVersion = 0;
  private presetName = "";

  get mode(): "soundfont" | "preview" { return this.synth ? "soundfont" : "preview"; }
  get pianoName(): string { return this.presetName; }
  get currentTime(): number { return this.context?.currentTime ?? 0; }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  async prepare(): Promise<void> {
    const context = this.getContext();
    if (context.state !== "running") await context.resume();
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
      this.presetName = piano.name;
    } catch (error) {
      synth.destroy();
      throw error;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  async noteOn(midi: number, velocity = 0.78, source = `manual:${midi}`): Promise<void> {
    if (!Number.isInteger(midi) || midi < 21 || midi > 108 || !Number.isFinite(velocity) || velocity <= 0) return;
    this.noteOff(midi, source);
    const voice: Voice = { midi, started: false };
    this.voices.set(source, voice);
    try {
      const context = this.getContext();
      if (context.state !== "running") await context.resume();
      // Release/stop may have happened while resume was pending.
      if (this.voices.get(source) !== voice) return;
      const normalizedVelocity = Math.max(0.01, Math.min(1, velocity));
      voice.started = true;
      if (this.synth) {
        this.synth.noteOn(0, midi, Math.round(normalizedVelocity * 127));
        return;
      }
      const now = context.currentTime;
      const voiceGain = context.createGain();
      voice.gain = voiceGain;
      voice.oscillators = [];
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.exponentialRampToValueAtTime(normalizedVelocity * 0.15, now + 0.012);
      voiceGain.gain.exponentialRampToValueAtTime(0.001, now + 4);
      voiceGain.connect(this.master!);
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
      this.noteOff(midi, source);
      throw error;
    }
  }

  noteOff(_midi: number, source = `manual:${_midi}`): void {
    const voice = this.voices.get(source);
    if (!voice) return;
    this.voices.delete(source);
    if (!voice.started) return;
    if (this.synth) {
      // A MIDI note-off releases every matching pitch on this channel. Keep it held
      // until the last overlapping input/playback instance releases that pitch.
      if (![...this.voices.values()].some((other) => other.started && other.midi === voice.midi)) {
        this.synth.noteOff(0, voice.midi);
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
    this.synth?.stopAll(true);
    for (const voice of this.voices.values()) this.releasePreview(voice, 0.01);
    this.voices.clear();
  }
}

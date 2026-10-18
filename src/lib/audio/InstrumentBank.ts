import { WorkletSynthesizer } from "spessasynth_lib";
import type { InstrumentPatch } from "./instruments";

/** Independent channels keep tracks, percussion and manual audition isolated. */
export class InstrumentBank {
  private synth: WorkletSynthesizer | null = null;
  private loading: Promise<void> | null = null;
  private routes = new Map<string, number>();

  constructor(private context: AudioContext, private output: AudioNode) {}

  async prepare(): Promise<void> {
    if (this.synth) return;
    this.loading ??= this.load().finally(() => { this.loading = null; });
    await this.loading;
  }

  private async load(): Promise<void> {
    await this.context.audioWorklet.addModule(`${import.meta.env.BASE_URL}spessasynth_processor.min.js`);
    const response = await fetch(`${import.meta.env.BASE_URL}instruments/MuseScore_General.sf3`);
    if (!response.ok) throw new Error("本地多乐器音源缺失，请重新构建应用。");
    const synth = new WorkletSynthesizer(this.context);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => { await synth.soundBankManager.addSoundBank(await response.arrayBuffer(), "bundled-gm"); await synth.isReady; })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("多乐器音源加载超时。")), 60000); }),
      ]);
      synth.setSystemParameter("effectsEnabled", false);
      synth.connect(this.output);
      this.synth = synth;
    } catch (error) { synth.destroy(); throw error; }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }

  channel(patch: InstrumentPatch, owner: string): number {
    if (!this.synth) throw new Error("多乐器音源尚未准备完成。");
    const key = `${owner}:${patch.percussion}:${patch.program}`;
    const existing = this.routes.get(key);
    if (existing !== undefined) return existing;
    // Allocate per-track channels, independent of source channel numbers.
    const channel = this.routes.size;
    while (this.synth.midiChannels.length <= channel) this.synth.addNewChannel();
    const preset = this.synth.presetList.find((p) => p.program === patch.program && Boolean(p.isDrum || p.isGMGSDrum) === patch.percussion && (patch.percussion || p.bankMSB === 0));
    if (!preset) throw new Error(`音源不含 ${patch.percussion ? "鼓组" : "乐器"} Program ${patch.program + 1}。`);
    this.synth.controllerChange(channel, 0, preset.bankMSB);
    this.synth.controllerChange(channel, 32, preset.bankLSB);
    this.synth.midiChannels[channel].setDrums(patch.percussion);
    this.synth.programChange(channel, patch.program);
    this.routes.set(key, channel);
    return channel;
  }

  noteOn(channel: number, midi: number, velocity: number): void { this.synth!.noteOn(channel, midi, velocity); }
  noteOff(channel: number, midi: number): void { this.synth?.noteOff(channel, midi); }
  stopPlayback(): void {
    for (const [key, channel] of this.routes) if (key.startsWith("playback:")) this.synth?.controllerChange(channel, 120, 0);
  }
  stopAll(): void { this.synth?.stopAll(true); }
  reset(): void { this.stopAll(); this.routes.clear(); }
}

import { BasicSoundBank, SoundBankLoader, SpessaSynthProcessor } from "spessasynth_core";
import type { RenderNote } from "./musicExport";

export async function synthRender(notes: RenderNote[], banks: ArrayBuffer[], customPiano: ArrayBuffer | null, rate: number, frames: number, progress: (value: number) => void): Promise<Float32Array[]> {
  await BasicSoundBank.isSF3DecoderReady;
  const synth = new SpessaSynthProcessor(rate, { effectsEnabled: false, maxBufferSize: 128 });
  await synth.processorInitialized;
  try {
    for (let i = 0; i < banks.length; i++) synth.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(banks[i]), `bank-${i}`);
    if (customPiano) {
      const source = SoundBankLoader.fromArrayBuffer(customPiano);
      const piano = source.presets.find((p) => p.program === 0 && !p.isDrum);
      if (!piano) throw new Error("自选钢琴音源缺少 Program 0。");
      const bank = new BasicSoundBank(); const copied = bank.clonePreset(piano); copied.bankMSB = 2; copied.bankLSB = 0;
      synth.soundBankManager.addSoundBank(bank, "custom-piano");
    }
    const routes = new Map<string, number>();
    const events: { frame: number; on: boolean; channel: number; midi: number; velocity: number }[] = [];
    for (const note of notes) {
      if (!note.volume) continue;
      const patch = note.patch;
      const bankMSB = customPiano && !patch.percussion && patch.program === 0 && !patch.bankMSB ? 2 : patch.bankMSB ?? 0;
      const key = `${note.track ?? 0}:${bankMSB}:${patch.program}:${patch.percussion}`;
      let channel = routes.get(key);
      if (channel === undefined) {
        channel = routes.size;
        while (synth.midiChannels.length <= channel) synth.createMIDIChannel();
        synth.controllerChange(channel, 0, bankMSB); synth.controllerChange(channel, 32, 0);
        synth.midiChannels[channel].setDrums(patch.percussion); synth.programChange(channel, patch.program);
        synth.controllerChange(channel, 11, Math.round(note.volume * 127)); routes.set(key, channel);
      }
      events.push({ frame: Math.round(note.start * rate), on: true, channel, midi: note.midi, velocity: Math.max(1, Math.round(note.velocity * 127)) });
      events.push({ frame: Math.round((note.start + note.duration) * rate), on: false, channel, midi: note.midi, velocity: 0 });
    }
    events.sort((a, b) => a.frame - b.frame || Number(a.on) - Number(b.on));
    const left = new Float32Array(frames), right = new Float32Array(frames);
    let index = 0, frame = 0, lastProgress = -1;
    const held = new Map<string, number>();
    while (frame < frames) {
      while (index < events.length && events[index].frame <= frame) {
        const event = events[index++], key = `${event.channel}:${event.midi}`, count = held.get(key) ?? 0;
        if (event.on) { held.set(key, count + 1); synth.noteOn(event.channel, event.midi, event.velocity); }
        else if (count > 1) held.set(key, count - 1);
        else { held.delete(key); synth.noteOff(event.channel, event.midi); }
      }
      const size = Math.min(128, frames - frame, Math.max(1, (events[index]?.frame ?? frames) - frame));
      synth.process(left, right, frame, size); frame += size;
      const percent = Math.floor(frame / frames * 100);
      if (percent !== lastProgress) { progress(percent / 100); lastProgress = percent; }
    }
    return [left, right];
  } finally { synth.destroySynthProcessor(); }
}

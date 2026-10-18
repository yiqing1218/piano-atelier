import type { StoredSoundfont } from "../storage/soundfontStore";
import config from "./pianoSamples.json";
interface PianoLoader {
  loadBuiltInPiano: () => Promise<void>;
  loadSoundfont: (buffer: ArrayBuffer) => Promise<void>;
}
export async function restorePiano(engine: PianoLoader, saved: StoredSoundfont | null): Promise<string> {
  if (saved && !/^synthetic-test\.(sf2|dls)$/i.test(saved.name)) {
    try { await engine.loadSoundfont(saved.buffer); return saved.name; }
    catch { /* An unusable saved asset must not leave the app on oscillator preview. */ }
  }
  await engine.loadBuiltInPiano();
  return config.name;
}

import type { ScoreDocument } from "../../types/music";
import type { MixSettings } from "../audio/instruments";
import { selectPianoSample } from "../audio/SampledPiano";
import { encodeWav, renderNotes, type RenderNote } from "./musicExport";

const abortError = () => new DOMException("已取消导出", "AbortError");
async function localFile(path: string): Promise<ArrayBuffer> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) throw new Error(`导出所需本地资源缺失：${path}`);
  return response.arrayBuffer();
}

function renderBank(notes: RenderNote[], banks: ArrayBuffer[], custom: ArrayBuffer | null, rate: number, frames: number, signal: AbortSignal, progress: (value: number) => void): Promise<Float32Array[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const worker = new Worker(new URL("./renderWorker.ts", import.meta.url), { type: "module" });
    const finish = () => { worker.terminate(); signal.removeEventListener("abort", cancel); };
    const cancel = () => { finish(); reject(abortError()); };
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event) => {
      if (typeof event.data.progress === "number") progress(event.data.progress);
      else if (event.data.error) { finish(); reject(new Error(event.data.error)); }
      else if (event.data.channels) { finish(); resolve(event.data.channels); }
    };
    worker.onerror = (event) => { finish(); reject(new Error(event.message || "离线渲染工作线程失败。")); };
    worker.postMessage({ notes, banks, custom, rate, frames }, [...banks, ...(custom ? [custom] : [])]);
  });
}

/** Offline rendering uses the same GM/recorded sound banks and C5 samples as live playback. */
export async function renderWav(score: ScoreDocument, settings: MixSettings, customPiano: ArrayBuffer | null, signal: AbortSignal, progress: (value: number) => void): Promise<ArrayBuffer> {
  const rate = 44100;
  const duration = score.duration / settings.speed + 5;
  if (!Number.isFinite(duration) || duration > 605) throw new Error("当前 WAV 导出支持最长 10 分钟的播放时长，请分段导出。");
  const notes = renderNotes(score.notes, settings);
  const piano = customPiano ? [] : notes.filter((n) => !n.patch.bankMSB && !n.patch.percussion && n.patch.program === 0 && n.volume > 0);
  const bankNotes = customPiano ? notes : notes.filter((n) => n.patch.bankMSB || n.patch.percussion || n.patch.program !== 0);
  const frames = Math.ceil(duration * rate);
  progress(0);
  const context = new OfflineAudioContext(2, frames, rate);
  const master = context.createGain(); master.gain.value = 0.72 * settings.master; master.connect(context.destination);
  if (bankNotes.length) {
    const banks = await Promise.all([localFile("instruments/MuseScore_General.sf3"), localFile("instruments/Recorded-Orchestra.sf2")]);
    if (signal.aborted) throw abortError();
    const channels = await renderBank(bankNotes, banks, customPiano, rate, frames, signal, (value) => progress(value * 0.65));
    const buffer = context.createBuffer(2, frames, rate);
    for (let c = 0; c < 2; c++) buffer.copyToChannel(new Float32Array(channels[c]), c);
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(master); source.start(0);
  }
  const cached = new Map<string, AudioBuffer>();
  for (let index = 0; index < piano.length; index++) {
    if (signal.aborted) throw abortError();
    const note = piano[index], sample = selectPianoSample(note.midi, note.velocity);
    let buffer = cached.get(sample.file);
    if (!buffer) { buffer = await context.decodeAudioData(await localFile(`piano-samples/${sample.file}`)); cached.set(sample.file, buffer); }
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.playbackRate.value = sample.rate; source.connect(gain); gain.connect(master);
    const level = 0.65 * Math.min(1.25, Math.sqrt(note.velocity * 127 / sample.recordedVelocity)) * note.volume;
    gain.gain.setValueAtTime(level, note.start);
    source.start(note.start);
    if (note.midi < 89) {
      const release = note.midi < 48 ? 0.1 : 0.055;
      gain.gain.setTargetAtTime(0.00001 * note.volume, note.start + note.duration, release);
      source.stop(note.start + note.duration + release * 5);
    }
    if (index % 32 === 0) progress(0.65 + index / Math.max(1, piano.length) * 0.2);
  }
  if (signal.aborted) throw abortError();
  progress(0.9);
  const rendered = await context.startRendering();
  if (signal.aborted) throw abortError();
  const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
  // Leave musical levels intact unless the summed mix would clip PCM16.
  let peak = 1;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  if (peak > 1) for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] /= peak;
  progress(1);
  return encodeWav(channels, rate);
}

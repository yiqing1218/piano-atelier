import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AudioLines, Check, ChevronDown, CircleHelp, FileMusic, FileUp, Headphones,
  Music2, Pause, Piano, Play, RotateCcw, Settings2, Square, Upload, Volume2,
} from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import PianoKeyboard from "./components/PianoKeyboard";
import ScoreTimeline from "./components/ScoreTimeline";
import { PianoEngine } from "./lib/audio/PianoEngine";
import { PlaybackScheduler } from "./lib/audio/PlaybackScheduler";
import { formatTime, midiToNoteName } from "./lib/music/noteNames";
import { KEYBOARD_CODES, midiForKeyboardCode } from "./lib/music/keyboardMap";
import { parseScoreFile } from "./lib/music/parseScore";
import { clearSavedSoundfont, loadSavedSoundfont, saveSoundfont } from "./lib/storage/soundfontStore";
import { restorePiano } from "./lib/audio/defaultPiano";
import pianoConfig from "./lib/audio/pianoSamples.json";
import { INSTRUMENTS, instrumentLabel, type InstrumentId, type PlaybackMode } from "./lib/audio/instruments";
import type { ScoreDocument } from "./types/music";
import bandDemoUrl from "../tests/fixtures/band-demo.mid?url&no-inline";
import InstrumentSelect from "./components/InstrumentSelect";
import TrackMixer from "./components/TrackMixer";
import SongLibrary from "./components/SongLibrary";
import { listSongs, storeSong, deleteSong, saveSongMix, type LibrarySong, type SongMix } from "./lib/storage/songStore";
import { nextSong, type RepeatMode } from "./lib/music/playlist";
import { downloadFile, exportMidi } from "./lib/export/musicExport";
import { renderWav } from "./lib/export/renderWav";
import type { TrackMixes } from "./lib/audio/instruments";

const DEMO_NOTES = [
  [60, 0.00], [60, 0.45], [67, 0.90], [67, 1.35],
  [69, 1.80], [69, 2.25], [67, 2.70], [65, 3.60],
  [65, 4.05], [64, 4.50], [64, 4.95], [62, 5.40],
  [62, 5.85], [60, 6.30],
] as const;

const DEMO_SCORE: ScoreDocument = {
  title: "Twinkle Twinkle · 演示旋律",
  sourceName: "内置演示旋律",
  format: "musicxml",
  notes: DEMO_NOTES.map(([midi, start], index) => ({
    id: `demo-${index}`, midi, start, duration: 0.34, velocity: 0.78, track: 0, part: "Demo",
  })),
  duration: 6.9,
  tempo: 100,
};

const SCORE_EXTENSIONS = ["mid", "midi", "xml", "musicxml", "mxl", "pdf", "png", "jpg", "jpeg", "tif", "tiff"];
const IMAGE_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "tif", "tiff"];

function isImageOrPdf(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function App() {
  const engineRef = useRef<PianoEngine | null>(null);
  if (!engineRef.current) engineRef.current = new PianoEngine();
  const engine = engineRef.current;

  const schedulerRef = useRef<PlaybackScheduler | null>(null);
  if (!schedulerRef.current) schedulerRef.current = new PlaybackScheduler(engine);
  const scheduler = schedulerRef.current;

  const importInputRef = useRef<HTMLInputElement>(null);
  const soundfontInputRef = useRef<HTMLInputElement>(null);
  const pressedCodes = useRef(new Map<string, number>());
  const activeSources = useRef(new Map<string, number>());
  const [score, setScore] = useState<ScoreDocument>(DEMO_SCORE);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("unified");
  const [instrument, setInstrument] = useState<InstrumentId>("piano");
  const [trackMixes, setTrackMixes] = useState<TrackMixes>({});
  const [masterVolume, setMasterVolume] = useState(1);
  const [library, setLibrary] = useState<LibrarySong[]>([]);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("once");
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const exportController = useRef<AbortController | null>(null);
  const endedRef = useRef<() => void>(() => {});
  const [baseMidi, setBaseMidi] = useState(48);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState("正在准备本地实录钢琴采样……");
  const [busy, setBusy] = useState(true);
  const [soundfontName, setSoundfontName] = useState("");
  const [audiverisPath, setAudiverisPath] = useState(() => {
    try { return localStorage.getItem("piano-atelier-audiveris") ?? ""; } catch { return ""; }
  });
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState<"image" | "pdf" | null>(null);

  const markOn = useCallback((midi: number, source: string) => {
    activeSources.current.set(source, midi);
    setActiveNotes(new Set(activeSources.current.values()));
  }, []);
  const markOff = useCallback((source: string) => {
    activeSources.current.delete(source);
    setActiveNotes(new Set(activeSources.current.values()));
  }, []);
  const noteOn = useCallback((midi: number, velocity = 0.78, source = `manual:${midi}`) => {
    if (busy || midi < 21 || midi > 108) return;
    markOn(midi, source);
    void engine.noteOn(midi, velocity, source).catch((error) => {
      markOff(source);
      setStatus(`音频启动失败：${error instanceof Error ? error.message : String(error)}`);
    });
  }, [engine, markOn, markOff, busy]);

  const noteOff = useCallback((midi: number, source = `manual:${midi}`) => {
    engine.noteOff(midi, source);
    markOff(source);
  }, [engine, markOff]);

  useEffect(() => {
    let cancelled = false;
    void loadSavedSoundfont().catch(() => null).then(async (saved) => {
      if (cancelled) return;
      try {
        const name = await restorePiano(engine, saved);
        if (!cancelled) {
          activeSources.current.clear(); pressedCodes.current.clear(); setActiveNotes(new Set());
          setSoundfontName(name);
          setStatus(engine.mode === "samples" ? "实录钢琴已就绪 · Yamaha C5 · 四档力度 · 离线播放" : `已加载本地采样音源：${name}`);
        }
      } catch (error) {
        if (!cancelled) setStatus(`真实钢琴音源加载失败：${error instanceof Error ? error.message : String(error)}。当前仅能使用备用合成音色。`);
      } finally {
        if (!cancelled) setBusy(false);
      }
    });
    return () => {
      cancelled = true;
      scheduler.stop();
      engine.stopAll();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [engine, scheduler]);

  useEffect(() => {
    void listSongs().then(setLibrary).catch((error) => setStatus(`曲库读取失败：${String(error)}`));
    return () => { exportController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!currentSongId) return;
    const mix: SongMix = { mode: playbackMode, instrument, tracks: trackMixes };
    setLibrary((items) => items.map((item) => item.id === currentSongId ? { ...item, mix } : item));
    void saveSongMix(currentSongId, mix)
      .catch((error) => setStatus(`配器设置保存失败：${String(error)}`));
  }, [currentSongId, playbackMode, instrument, trackMixes]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || Boolean(target.closest("input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']"));
    };

    const onDown = (event: KeyboardEvent) => {
      if (isEditable(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
      const midi = midiForKeyboardCode(event.code, baseMidi);
      if (midi === null || event.repeat || pressedCodes.current.has(event.code)) return;
      event.preventDefault();
      pressedCodes.current.set(event.code, midi);
      noteOn(midi, event.shiftKey ? 1 : 0.78, `keyboard:${event.code}`);
    };

    const onUp = (event: KeyboardEvent) => {
      if (!pressedCodes.current.has(event.code)) return;
      const midi = pressedCodes.current.get(event.code)!;
      pressedCodes.current.delete(event.code);
      noteOff(midi, `keyboard:${event.code}`);
    };

    const onBlur = () => {
      for (const [code, midi] of pressedCodes.current) noteOff(midi, `keyboard:${code}`);
      pressedCodes.current.clear();
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    const onHidden = () => { if (document.hidden) onBlur(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [baseMidi, noteOff, noteOn]);

  const activateScore = useCallback((parsed: ScoreDocument, id: string | null, mix?: SongMix) => {
    scheduler.stop(); engine.stopAll();
    activeSources.current.clear(); pressedCodes.current.clear(); setActiveNotes(new Set());
    const settings = mix ?? { mode: playbackMode, instrument, tracks: {} };
    engine.configureInstruments(settings.mode, settings.instrument, settings.tracks);
    setPlaybackMode(settings.mode); setInstrument(settings.instrument); setTrackMixes(settings.tracks);
    setScore(parsed); setCurrentSongId(id); setPosition(0); setPlaying(false); setPreviewUrl(""); setPreviewType(null);
  }, [scheduler, engine, playbackMode, instrument]);

  const loadParsedScore = useCallback(async (name: string, buffer: ArrayBuffer) => {
    const parsed = parseScoreFile(name, buffer);
    activateScore(parsed, null);
    try {
      const result = await storeSong(name, buffer, parsed);
      setLibrary(await listSongs()); activateScore(result.song.score, result.song.id, result.song.mix);
      setStatus(`${result.duplicate ? "曲库已有此文件，已打开原曲目" : "已导入并保存到本地曲库"} · ${parsed.notes.length} 个音符`);
    } catch (error) { setStatus(`乐谱可演奏，但曲库保存失败：${String(error)}`); }
  }, [activateScore]);

  const importNativePath = async (path: string) => {
    const name = fileNameFromPath(path);
    if (isImageOrPdf(name)) {
      if (!audiverisPath.trim()) {
        setStatus("图片/PDF 已选中。请先在左侧设置本地 Audiveris 启动器路径，再执行识谱。");
        return;
      }
      setBusy(true);
      setStatus("正在调用本地 Audiveris 识谱引擎……");
      try {
        const outputPath = await invoke<string>("recognize_score", {
          inputPath: path,
          executablePath: audiverisPath.trim(),
        });
        const bytes = await invoke<number[]>("read_local_file", { path: outputPath });
        const buffer = new Uint8Array(bytes).buffer as ArrayBuffer;
        await loadParsedScore(fileNameFromPath(outputPath), buffer);
        setStatus(`本地识谱完成：${fileNameFromPath(outputPath)}。请检查识别准确性。`);
      } catch (error) {
        setStatus(`本地识谱失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const bytes = await invoke<number[]>("read_local_file", { path });
      const buffer = new Uint8Array(bytes).buffer as ArrayBuffer;
      await loadParsedScore(name, buffer);
    } catch (error) {
      setStatus(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const openScore = async () => {
    if (!isTauri()) {
      importInputRef.current?.click();
      return;
    }
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "乐谱文件", extensions: SCORE_EXTENSIONS }],
      });
      if (typeof selected === "string") await importNativePath(selected);
    } catch (error) {
      setStatus(`无法打开文件选择器：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleBrowserFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (isImageOrPdf(file.name)) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setPreviewType(file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "image");
      setStatus("已载入图片/PDF 文件。浏览器开发模式不会执行本地程序；请在 Windows 桌面版中配置 Audiveris 进行离线识谱。");
      return;
    }

    setBusy(true);
    try {
      await loadParsedScore(file.name, await file.arrayBuffer());
    } catch (error) {
      setStatus(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const importSoundfont = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    scheduler.stop(); setPlaying(false);
    try {
      const buffer = await file.arrayBuffer();
      await engine.loadSoundfont(buffer);
      engine.configureInstruments("unified", "piano", trackMixes); setPlaybackMode("unified"); setInstrument("piano");
      setSoundfontName(file.name);
      activeSources.current.clear(); pressedCodes.current.clear(); setActiveNotes(new Set());
      try {
        await saveSoundfont(file.name, buffer);
        setStatus(`采样钢琴已加载并保存在本地：${file.name} · ${engine.pianoName}`);
      } catch (error) {
        setStatus(`音源已加载，但本地保存失败，下次启动需重新导入：${String(error)}`);
      }
    } catch (error) {
      setStatus(`音源加载失败：${error instanceof Error ? error.message : String(error)}。${engine.mode !== "preview" ? "继续使用当前钢琴音源。" : "当前使用备用合成音色。"}`);
    } finally {
      setBusy(false);
    }
  };

  const useBuiltInPiano = async () => {
    setBusy(true); setPosition(playing ? scheduler.position : position); scheduler.stop(); setPlaying(false);
    setStatus("正在准备 Yamaha C5 实录钢琴……");
    try {
      await engine.loadBuiltInPiano();
      engine.configureInstruments("unified", "piano", trackMixes); setPlaybackMode("unified"); setInstrument("piano");
      activeSources.current.clear(); pressedCodes.current.clear(); setActiveNotes(new Set());
      setSoundfontName(pianoConfig.name);
      try {
        await clearSavedSoundfont();
        setStatus("已使用内置 Yamaha C5 实录钢琴 · 四档力度 · 无混响");
      } catch {
        setStatus("已使用内置实录钢琴，但未能清除旧音源设置，下次启动可能需再次切换。");
      }
    } catch (error) {
      setStatus(`内置钢琴加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { setBusy(false); }
  };

  const playFrom = (seconds: number, playbackSpeed = speed, document = score) => {
    setPosition(seconds);
    setPlaying(true);
    setStatus(`正在播放 · ${Math.round(playbackSpeed * 100)}% 速度`);
    void scheduler.start(document.notes, seconds, playbackSpeed, {
      onPosition: setPosition,
      onNoteOn: (midi) => markOn(midi, `playback:${midi}`),
      onNoteOff: (midi) => markOff(`playback:${midi}`),
      onEnd: () => {
        setPlaying(false);
        setPosition(document.duration);
        setStatus("播放完成");
        endedRef.current();
      },
      onError: (error) => {
        setPlaying(false);
        setStatus(`播放失败：${error instanceof Error ? error.message : String(error)}`);
      },
    }, document.duration);
  };

  const startPlayback = () => {
    if (playing) {
      const pausedAt = scheduler.position;
      scheduler.stop();
      setPosition(pausedAt);
      setPlaying(false);
      setStatus("已暂停。再次播放将从当前进度继续。");
      return;
    }
    playFrom(position >= score.duration ? 0 : position);
  };

  const stopPlayback = () => {
    scheduler.stop(); engine.stopAll();
    activeSources.current.clear(); pressedCodes.current.clear();
    setPlaying(false); setPosition(0); setActiveNotes(new Set());
    setStatus("已停止");
  };

  const seek = (seconds: number) => {
    const target = Math.max(0, Math.min(score.duration, seconds));
    if (playing) playFrom(target);
    else { scheduler.stop(); setPosition(target); setStatus(`定位至 ${formatTime(target)}`); }
  };

  const changeSpeed = (value: number) => {
    setSpeed(value);
    if (playing) playFrom(scheduler.position, value);
  };

  const updateAudiverisPath = (value: string) => {
    setAudiverisPath(value);
    try { localStorage.setItem("piano-atelier-audiveris", value); } catch { /* optional persistence */ }
  };

  const changeInstrumentation = async (mode: PlaybackMode, selected: InstrumentId, newPosition?: number, mixes = trackMixes) => {
    const pausedAt = newPosition ?? (playing ? scheduler.position : position);
    scheduler.stop(); setPlaying(false); setPosition(pausedAt); setBusy(true);
    engine.stopAll(); activeSources.current.clear(); pressedCodes.current.clear(); setActiveNotes(new Set());
    setStatus("正在准备本地乐器音源……");
    try {
      if (mode === "multitrack" || selected !== "piano") await engine.prepareInstruments();
      engine.configureInstruments(mode, selected, mixes);
      setPlaybackMode(mode); setInstrument(selected); setTrackMixes(mixes);
      setStatus(mode === "multitrack" ? "多轨模式：按 MIDI 原始乐器编号与鼓轨演奏；键盘使用所选试听乐器。" : `统一乐器：${INSTRUMENTS.find((item) => item.id === selected)!.name}。点击播放继续。`);
    } catch (error) {
      setStatus(`乐器切换失败：${error instanceof Error ? error.message : String(error)}。保留原来的演奏设置。`);
    } finally { setBusy(false); }
  };

  const chooseLibrarySong = (song: LibrarySong, autoplay = false) => {
    activateScore(song.score, song.id, song.mix);
    setStatus(`已从本地曲库加载：${song.score.title}`);
    if (autoplay) playFrom(0, speed, song.score);
  };
  endedRef.current = () => {
    if (repeatMode === "one" && !currentSongId) { playFrom(0); return; }
    const next = nextSong(library.map((song) => song.id), currentSongId, repeatMode);
    const song = library.find((item) => item.id === next);
    if (song) chooseLibrarySong(song, true);
  };
  const removeSong = async (song: LibrarySong) => {
    try {
      await deleteSong(song.id); setLibrary((items) => items.filter((item) => item.id !== song.id));
      if (song.id === currentSongId) activateScore(DEMO_SCORE, null);
      setStatus(`已从曲库删除：${song.score.title}`);
    } catch (error) { setStatus(`删除失败：${String(error)}`); }
  };
  const changeTrackVolume = (track: number, volume: number) => {
    engine.setTrackVolume(track, volume);
    setTrackMixes((mixes) => ({ ...mixes, [track]: { ...mixes[track], volume } }));
  };
  const exportMusic = async (type: "midi" | "wav") => {
    const settings = { mode: playbackMode, instrument, tracks: structuredClone(trackMixes), master: masterVolume, speed };
    const stem = score.title.replace(/\.(mid|midi|musicxml|xml|mxl)$/i, "");
    if (type === "midi") {
      try { const saved = await downloadFile(`${stem}.mid`, exportMidi(score.notes, settings), "audio/midi"); setStatus(saved ? "MIDI 已导出；自定义音色需在目标播放器加载对应音源。" : "已取消保存 MIDI"); }
      catch (error) { setStatus(`MIDI 导出失败：${String(error)}`); }
      return;
    }
    setPosition(playing ? scheduler.position : position); scheduler.stop(); setPlaying(false); setBusy(true); setExportProgress(0);
    engine.stopAll(); activeSources.current.clear(); pressedCodes.current.clear(); setActiveNotes(new Set());
    const controller = new AbortController(); exportController.current = controller;
    try {
      const bytes = await renderWav(score, settings, engine.customPianoBuffer, controller.signal, setExportProgress);
      if (!controller.signal.aborted) { const saved = await downloadFile(`${stem}.wav`, bytes, "audio/wav"); setStatus(saved ? "WAV 已导出 · 44.1 kHz · 立体声 · 包含当前配器和音量。" : "已取消保存 WAV"); }
    } catch (error) { setStatus(controller.signal.aborted ? "已取消音频导出" : `WAV 导出失败：${String(error)}`); }
    finally { exportController.current = null; setExportProgress(null); setBusy(false); }
  };

  const shiftOctave = (amount: number) => {
    setBaseMidi((current) => Math.max(21, Math.min(108 - KEYBOARD_CODES.length + 1, current + amount * 12)));
  };

  const pianoMode = engine.mode === "samples" ? "Yamaha C5 实录钢琴" : engine.mode === "soundfont" ? "本地 SoundFont" : "备用合成音色";
  const soundMode = playbackMode === "multitrack" ? "多轨 · 本地多乐器音源" : instrument === "piano" ? pianoMode : INSTRUMENTS.find((item) => item.id === instrument)!.name;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Piano size={21} /></div>
          <div>
            <div className="brand-title">Piano Atelier</div>
            <div className="brand-subtitle">OFFLINE MUSIC WORKSTATION</div>
          </div>
        </div>
        <div className="topbar-center">
          <span className="offline-indicator"><span /> LOCAL-FIRST</span>
          <span className="topbar-divider" />
          <span className="muted small">不依赖云端识谱或在线音源</span>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" title="当前状态" onClick={() => setStatus("当前运行在本地模式；音源和乐谱文件均在本机处理。")}><CircleHelp size={17} /></button>
          <div className="avatar">PA</div>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="section-label">WORKSPACE</div>
            <button className="side-item active" type="button">
              <Music2 size={17} /><span>演奏工作台</span><ChevronDown size={14} className="side-chevron" />
            </button>
          </div>

          <div className="sidebar-section import-section">
            <div className="section-label">乐谱输入</div>
            <button className="primary-button full-width" type="button" onClick={() => void openScore()} disabled={busy}>
              <FileUp size={16} /> 导入乐谱
            </button>
            <input
              ref={importInputRef}
              className="hidden-input"
              type="file"
              accept=".mid,.midi,.xml,.musicxml,.mxl,.pdf,.png,.jpg,.jpeg,.tif,.tiff"
              onChange={(event) => void handleBrowserFile(event)}
            />
            <div className="format-grid">
              <span><Check size={12} /> MIDI</span>
              <span><Check size={12} /> MusicXML</span>
              <span><Check size={12} /> MXL</span>
              <span><Settings2 size={12} /> PDF / 图片（可选）</span>
            </div>
            <p className="hint-text">MIDI 可按原始乐器多轨演奏。MusicXML / MXL 也可统一更换乐器。</p>
          </div>

          <div className="sidebar-section">
            <div className="section-label">钢琴音源</div>
            <button className="primary-button full-width" type="button" onClick={() => void useBuiltInPiano()} disabled={busy}>
              <Piano size={16} /> 使用内置实录钢琴
            </button>
            <button className="secondary-button full-width" type="button" onClick={() => soundfontInputRef.current?.click()} disabled={busy}>
              <Headphones size={16} /> 加载 SoundFont
            </button>
            <input
              ref={soundfontInputRef}
              className="hidden-input"
              type="file"
              accept=".sf2,.sf3,.dls"
              onChange={(event) => void importSoundfont(event)}
            />
            <div className={`soundfont-card ${engine.mode !== "preview" ? "loaded" : ""}`}>
              <div className="soundfont-icon"><AudioLines size={16} /></div>
              <div className="soundfont-copy">
                <strong>{soundfontName || (busy ? "正在加载真实钢琴……" : "备用合成音色")}</strong>
                <span>{engine.mode === "samples" ? "立体声实录 · 四档力度 · 无混响" : engine.mode === "soundfont" ? `本地音源 · ${engine.pianoName}` : "采样尚未就绪，当前音色不是真实钢琴"}</span>
              </div>
              <span className={`status-dot ${engine.mode !== "preview" ? "green" : ""}`} />
            </div>
            <p className="hint-text">内置 Salamander Grand Piano · Alexander Holm · CC BY 3.0。采样全部在本地，也可导入自己的 SoundFont。<a href={`${import.meta.env.BASE_URL}piano-samples/ATTRIBUTION.md`} target="_blank" rel="noreferrer">音源署名与授权</a></p>
          </div>

          <SongLibrary songs={library} current={currentSongId} disabled={busy} repeat={repeatMode} onRepeat={setRepeatMode} onSelect={chooseLibrarySong} onDelete={(song) => void removeSong(song)} />

          <div className="sidebar-section omr-section">
            <div className="section-label">本地识谱引擎（可选）</div>
            <label className="field-label" htmlFor="audiveris-path">Audiveris 启动器路径</label>
            <input
              id="audiveris-path"
              className="text-input"
              value={audiverisPath}
              onChange={(event) => updateAudiverisPath(event.target.value)}
              placeholder="例如 C:\Tools\Audiveris.bat"
              spellCheck={false}
            />
            <p className="hint-text">本版无需配置。仅桌面版可调用本机程序；不会上传乐谱。</p>
          </div>

          <div className="sidebar-bottom">
            <div className="privacy-note"><Settings2 size={15} /><span>本地文件 · 本地音频 · 无云端依赖</span></div>
            <div className="version-row"><span>Piano Atelier</span><span>v0.1.0 MVP</span></div>
          </div>
        </aside>

        <main className="main-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">MUSIC WORKSPACE / 01</div>
              <h1>演奏工作台</h1>
              <p>导入乐谱，使用本地实录钢琴或多乐器音源离线演奏。</p>
            </div>
            <div className="heading-badges">
              <span className="badge"><span className="badge-dot" /> {soundMode}</span>
              <span className="badge neutral"><Volume2 size={13} /> 88 键</span>
            </div>
          </section>

          <section className="track-card">
            <div className="track-icon"><FileMusic size={23} /></div>
            <div className="track-main">
              <div className="track-kicker">CURRENT SCORE</div>
              <h2>{score.title}</h2>
              <div className="track-details">
                <span>{score.sourceName}</span><i />
                <span>{score.notes.length.toLocaleString()} 个音符</span><i />
                <span>{Math.round(score.tempo)} BPM</span><i />
                <span>{formatTime(score.duration)}</span>
              </div>
            </div>
            <div className="track-actions">
              <button className="secondary-button compact" type="button" disabled={busy} onClick={() => {
                setBusy(true);
                void (async () => {
                  try {
                    const response = await fetch(bandDemoUrl);
                    if (!response.ok) throw new Error("本地多轨演示文件缺失。");
                    await loadParsedScore("band-demo.mid", await response.arrayBuffer());
                    await changeInstrumentation("multitrack", instrument, 0, {});
                  } catch (error) { setStatus(`演示加载失败：${String(error)}`); }
                  finally { setBusy(false); }
                })();
              }}>多轨演示</button>
              <button className="secondary-button compact" type="button" onClick={() => void openScore()} disabled={busy}><Upload size={15} /> 替换乐谱</button>
              <button className="icon-button" type="button" title="恢复演示旋律" disabled={busy} onClick={() => { activateScore(DEMO_SCORE, null); setStatus("已恢复内置演示旋律"); }}><RotateCcw size={16} /></button>
            </div>
          </section>

          {Boolean(score.warnings?.length) && (
            <section className="score-warnings" aria-label="乐谱解析提示">
              <strong>乐谱解析提示</strong>
              <ul>{score.warnings!.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </section>
          )}

          {previewUrl && (
            <section className="preview-card">
              <div><strong>输入文件预览</strong><span>识谱前请确认页面清晰、五线谱没有被裁切。</span></div>
              {previewType === "pdf" ? <a href={previewUrl} target="_blank" rel="noreferrer">打开 PDF 预览</a> : <img src={previewUrl} alt="乐谱图片预览" />}
            </section>
          )}

          <section className="transport-card">
            <div className="transport-main">
              <button className="transport-stop" type="button" onClick={stopPlayback} title="停止"><Square size={15} fill="currentColor" /></button>
              <button className="transport-play" type="button" onClick={startPlayback} disabled={busy || !score.notes.length} title={playing ? "暂停" : "播放"}>
                {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </button>
              <div className="transport-track">
                <div className="transport-times"><span>{formatTime(position)}</span><span>{formatTime(score.duration)}</span></div>
                <input
                  className="seek-slider"
                  type="range"
                  min={0}
                  max={Math.max(0.01, score.duration)}
                  step={0.01}
                  value={Math.min(position, score.duration)}
                  onChange={(event) => seek(Number(event.target.value))}
                  aria-label="播放进度"
                />
              </div>
            </div>
            <div className="speed-control">
              <span>速度</span>
              <select value={speed} disabled={busy} onChange={(event) => changeSpeed(Number(event.target.value))} aria-label="播放速度">
                <option value={0.5}>50%</option>
                <option value={0.75}>75%</option>
                <option value={1}>100%</option>
                <option value={1.25}>125%</option>
                <option value={1.5}>150%</option>
              </select>
            </div>
            <label className="master-volume">总音量 <input type="range" aria-label="总音量" min="0" max="100" disabled={busy} value={Math.round(masterVolume * 100)} onChange={(event) => { const value = Number(event.target.value) / 100; setMasterVolume(value); engine.setMasterVolume(value); }} /><span>{Math.round(masterVolume * 100)}%</span></label>
          </section>

          <section className="instrument-panel" aria-label="乐器与音轨">
            <div className="instrument-controls">
              <label>播放模式
                <select aria-label="播放模式" value={playbackMode} disabled={busy} onChange={(event) => void changeInstrumentation(event.target.value as PlaybackMode, instrument)}>
                  <option value="unified">统一乐器 · 整首同一种音色</option>
                  <option value="multitrack">多轨演奏 · 匹配 MIDI 原始乐器</option>
                </select>
              </label>
              <label>{playbackMode === "unified" ? "全曲乐器 / 键盘试听" : "键盘试听乐器"}
                <InstrumentSelect label="演奏乐器" value={instrument} disabled={busy} onChange={(value) => { if (value) void changeInstrumentation(playbackMode, value); }} />
              </label>
              <span className="muted small">本地实录 / GM · 无混响 · <a href={`${import.meta.env.BASE_URL}instruments/LICENSE.md`} target="_blank" rel="noreferrer">MIT</a> / <a href={`${import.meta.env.BASE_URL}instruments/erhu-LICENSE.txt`} target="_blank" rel="noreferrer">CC0 许可</a></span>
            </div>
            {playbackMode === "multitrack" && <TrackMixer score={score} mixes={trackMixes} disabled={busy} onVolume={changeTrackVolume} onInstrument={(track, value) => void changeInstrumentation(playbackMode, instrument, undefined, { ...trackMixes, [track]: { volume: trackMixes[track]?.volume ?? 1, instrument: value } })} />}
            {instrument === "drums" && <p className="hint-text">鼓组按 GM 鼓键位演奏：C2 底鼓、D2 军鼓、F♯2 闭镲。统一鼓组模式直接使用原音高作为鼓键，不自动生成节奏。</p>}
            <div className="export-controls">
              <button className="secondary-button compact" type="button" disabled={busy} onClick={() => void exportMusic("wav")}>导出 WAV 音频</button>
              <button className="secondary-button compact" type="button" disabled={busy} onClick={() => void exportMusic("midi")}>导出 MIDI</button>
              {exportProgress !== null ? <><progress aria-label="音频导出进度" value={exportProgress} max={1} /><span>{Math.round(exportProgress * 100)}%</span><button className="secondary-button compact" type="button" onClick={() => exportController.current?.abort()}>取消导出</button></> : <span className="muted small">使用当前速度、配器与音量 · 完全本地渲染</span>}
            </div>
          </section>

          <ScoreTimeline score={score} position={position} activeNotes={activeNotes} onSeek={seek} />

          <section className="keyboard-panel">
            <div className="keyboard-heading">
              <div>
                <div className="eyebrow">VIRTUAL INSTRUMENT</div>
                <h3>88 键钢琴</h3>
                <p>鼠标点击琴键，或使用电脑键盘演奏；按住发声，释放停止。</p>
              </div>
              <div className="octave-controls">
                <button className="secondary-button compact" type="button" onClick={() => shiftOctave(-1)} title="电脑键盘映射降低一个八度">− 八度</button>
                <div className="octave-display"><span>键位起点</span><strong>{midiToNoteName(baseMidi)}</strong></div>
                <button className="secondary-button compact" type="button" onClick={() => shiftOctave(1)} title="电脑键盘映射升高一个八度">+ 八度</button>
              </div>
            </div>
            <PianoKeyboard activeNotes={activeNotes} baseMidi={baseMidi} onNoteOn={noteOn} onNoteOff={noteOff} />
            <div className="keyboard-footer">
              <span><span className="legend-dot active" /> 正在发声</span>
              <span><span className="legend-dot" /> 白键 / 黑键</span>
              <span className="keyboard-hint">键位映射覆盖数字行、QWERTY、ASDF、ZXCV 与标点键；八度按钮用于访问全部音域。</span>
            </div>
          </section>

          <footer className="statusbar">
            <div className="status-left" role="status" title={status}><span className={`status-dot ${busy ? "amber" : "green"}`} />{status}</div>
            <div className="status-right"><span>{isTauri() ? "Windows 桌面版" : "浏览器开发模式"}</span><span className="status-divider" /><span>{playbackMode === "multitrack" || instrument !== "piano" ? "Offline Instrument Bank" : engine.mode === "samples" ? "Sampled Grand Piano" : engine.mode === "soundfont" ? "SoundFont Engine" : "Preview Synth"}</span></div>
          </footer>
        </main>
      </div>
    </div>
  );
}

import type { ScoreDocument } from "../types/music";
import { instrumentLabel, type InstrumentId, type TrackMixes } from "../lib/audio/instruments";
import InstrumentSelect from "./InstrumentSelect";
import { useMemo } from "react";
interface Props { score: ScoreDocument; mixes: TrackMixes; disabled: boolean; onInstrument: (track: number, instrument?: InstrumentId) => void; onVolume: (track: number, volume: number) => void }
export default function TrackMixer({ score, mixes, disabled, onInstrument, onVolume }: Props) {
  const tracks = useMemo(() => {
    const result = new Map<number, { note: ScoreDocument["notes"][number]; count: number }>();
    for (const note of score.notes) {
      const id = note.track ?? 0, existing = result.get(id);
      if (existing) existing.count++; else result.set(id, { note, count: 1 });
    }
    return [...result].sort(([a], [b]) => a - b);
  }, [score]);
  return <div className="track-list" aria-label="音轨混音器">
    {score.format !== "midi" && <p className="hint-text">MusicXML 原始配器暂未读取；可在下方逐声部指定乐器。</p>}
    {tracks.map(([id, { note, count }], index) => <div className="mixer-row" key={id}>
      <div className="mixer-name"><strong>{note.part || `音轨 ${index + 1}`}</strong><small>原始：{instrumentLabel(note)} · {count} 个音符</small></div>
      <InstrumentSelect value={mixes[id]?.instrument ?? ""} label={`音轨 ${index + 1} 乐器`} automatic={instrumentLabel(note)} disabled={disabled} onChange={(value) => onInstrument(id, value || undefined)} />
      <label className="mixer-volume">音量 <input type="range" aria-label={`音轨 ${index + 1} 音量`} min="0" max="100" value={Math.round((mixes[id]?.volume ?? 1) * 100)} disabled={disabled} onChange={(event) => onVolume(id, Number(event.target.value) / 100)} /><span>{Math.round((mixes[id]?.volume ?? 1) * 100)}%</span></label>
    </div>)}
  </div>;
}

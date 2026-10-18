import type { MouseEvent } from "react";
import type { NoteEvent, ScoreDocument } from "../types/music";
import { formatTime, midiToNoteName } from "../lib/music/noteNames";

interface Props {
  score: ScoreDocument;
  position: number;
  activeNotes: Set<number>;
  onSeek: (seconds: number) => void;
}

export default function ScoreTimeline({ score, position, activeNotes, onSeek }: Props) {
  const duration = Math.max(1, score.duration);
  const width = Math.max(1000, Math.min(48000, duration * 110));
  const lowestNote = score.notes.reduce((lowest, note) => Math.min(lowest, note.midi), 108);
  const highestNote = score.notes.reduce((highest, note) => Math.max(highest, note.midi), 21);
  const minMidi = Math.max(21, lowestNote - 2);
  const maxMidi = Math.min(108, highestNote + 2);
  const range = Math.max(12, maxMidi - minMidi + 1);
  const height = Math.max(190, range * 5.5);
  const shownNotes = score.notes.slice(0, 3500);

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    onSeek(Math.max(0, Math.min(score.duration, (x / width) * duration)));
  };

  return (
    <section className="timeline-panel">
      <div className="timeline-heading">
        <div>
          <div className="eyebrow">PLAYBACK MAP</div>
          <h3>音符时间轴</h3>
        </div>
        <div className="timeline-meta">
          <span>{score.notes.length.toLocaleString()} 个音符事件</span>
          <span>{formatTime(score.duration)} 总时长</span>
        </div>
      </div>
      <div className="timeline-scroll">
        <div
          className="piano-roll"
          style={{ width, height }}
          onClick={seek}
          role="slider"
          aria-label="播放位置"
          aria-valuemin={0}
          aria-valuemax={score.duration}
          aria-valuenow={position}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") onSeek(Math.max(0, position - 1));
            if (event.key === "ArrowRight") onSeek(Math.min(score.duration, position + 1));
          }}
        >
          <div className="roll-grid" style={{ backgroundSize: `${width / duration}px 100%, 100% 5.5px` }} />
          <div className="roll-ruler">
            {Array.from({ length: Math.floor(duration) + 1 }, (_, second) => (
              <span key={second} style={{ left: (second / duration) * width }}>{formatTime(second)}</span>
            ))}
          </div>
          {shownNotes.map((note: NoteEvent) => {
            const left = (note.start / duration) * width;
            const noteWidth = Math.max(3, (note.duration / duration) * width);
            const top = ((maxMidi - note.midi) / range) * (height - 18) + 14;
            return (
              <div
                key={note.id}
                className={`roll-note ${activeNotes.has(note.midi) && position >= note.start && position < note.start + note.duration ? "roll-note-active" : ""}`}
                style={{
                  left,
                  top,
                  width: noteWidth,
                  height: Math.max(3, (height - 18) / range - 1),
                  opacity: 0.55 + note.velocity * 0.45,
                }}
                title={`${midiToNoteName(note.midi)} · ${note.start.toFixed(2)}s · ${note.duration.toFixed(2)}s`}
              />
            );
          })}
          <div className="playhead" style={{ left: (position / duration) * width }} />
        </div>
      </div>
      <div className="timeline-footer">
        <span>低音</span>
        <span>音符纵向位置表示音高，横向位置表示时间；点击时间轴可跳转。</span>
        <span>高音</span>
      </div>
      {score.notes.length > shownNotes.length && (
        <p className="muted small">曲目较长，时间轴仅绘制前 {shownNotes.length.toLocaleString()} 个音符；播放引擎仍使用完整曲目。</p>
      )}
    </section>
  );
}

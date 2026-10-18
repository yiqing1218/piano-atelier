import { useEffect, useMemo, useRef, type PointerEvent, type MouseEvent } from "react";
import { isBlackKey, midiToNoteName } from "../lib/music/noteNames";
import { KEYBOARD_CODES, keyboardCodeLabel } from "../lib/music/keyboardMap";

interface Props {
  activeNotes: Set<number>;
  baseMidi: number;
  onNoteOn: (midi: number, velocity?: number, source?: string) => void;
  onNoteOff: (midi: number, source?: string) => void;
}

const MIN_MIDI = 21;
const MAX_MIDI = 108;
const WHITE_WIDTH = 23;
const BLACK_WIDTH = 14;

export default function PianoKeyboard({ activeNotes, baseMidi, onNoteOn, onNoteOff }: Props) {
  const keys = useMemo(() => Array.from({ length: MAX_MIDI - MIN_MIDI + 1 }, (_, i) => MIN_MIDI + i), []);
  const whiteKeys = keys.filter((midi) => !isBlackKey(midi));
  const blackKeys = keys.filter(isBlackKey);
  const totalWidth = whiteKeys.length * WHITE_WIDTH;
  const labels = new Map<number, string>();
  KEYBOARD_CODES.forEach((code, index) => {
    const midi = baseMidi + index;
    if (midi >= MIN_MIDI && midi <= MAX_MIDI) labels.set(midi, keyboardCodeLabel(code));
  });

  const pointers = useRef(new Map<number, number>());
  const offRef = useRef(onNoteOff);
  offRef.current = onNoteOff;
  const release = (pointerId: number) => {
    const midi = pointers.current.get(pointerId);
    if (midi === undefined) return;
    pointers.current.delete(pointerId);
    offRef.current(midi, `pointer:${pointerId}`);
  };
  useEffect(() => {
    const releaseAll = () => {
      for (const [id, midi] of pointers.current) offRef.current(midi, `pointer:${id}`);
      pointers.current.clear();
    };
    const hidden = () => { if (document.hidden) releaseAll(); };
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", hidden);
      releaseAll();
    };
  }, []);
  const keyProps = (midi: number) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || pointers.current.has(event.pointerId)) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, midi);
      onNoteOn(midi, 0.82, `pointer:${event.pointerId}`);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      release(event.pointerId);
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => release(event.pointerId),
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => release(event.pointerId),
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  });

  return (
    <div className="keyboard-scroll">
      <div className="piano-keys" style={{ width: "100%" }}>
        <div className="white-key-row">
          {whiteKeys.map((midi) => (
            <button
              key={midi}
              type="button"
              className={`piano-key white-key ${activeNotes.has(midi) ? "is-active" : ""}`}
              aria-label={midiToNoteName(midi)}
              title={`${midiToNoteName(midi)} · MIDI ${midi}${labels.has(midi) ? ` · 键盘 ${labels.get(midi)}` : ""}`}
              {...keyProps(midi)}
            >
              {labels.has(midi) && <span className="mapped-key">{labels.get(midi)}</span>}
              {(midi === MIN_MIDI || midi % 12 === 0) && <span className="note-label">{midiToNoteName(midi)}</span>}
            </button>
          ))}
        </div>
        <div className="black-key-layer">
          {blackKeys.map((midi) => {
            const whiteBefore = keys.filter((key) => key < midi && !isBlackKey(key)).length;
            return (
              <button
                key={midi}
                type="button"
                className={`piano-key black-key ${activeNotes.has(midi) ? "is-active" : ""}`}
                style={{ left: `${(whiteBefore * WHITE_WIDTH - BLACK_WIDTH / 2) / totalWidth * 100}%`, width: `${BLACK_WIDTH / totalWidth * 100}%` }}
                aria-label={midiToNoteName(midi)}
                title={`${midiToNoteName(midi)} · MIDI ${midi}${labels.has(midi) ? ` · 键盘 ${labels.get(midi)}` : ""}`}
                {...keyProps(midi)}
              >
                {labels.has(midi) && <span className="mapped-key">{labels.get(midi)}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

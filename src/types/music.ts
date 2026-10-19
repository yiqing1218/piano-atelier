export interface NoteEvent {
  id: string;
  midi: number;
  start: number;
  duration: number;
  velocity: number;
  track?: number;
  part?: string;
  program?: number;
  bankMSB?: number;
  channel?: number;
  percussion?: boolean;
  instrumentName?: string;
}

export interface ScoreDocument {
  title: string;
  sourceName: string;
  format: "midi" | "musicxml";
  notes: NoteEvent[];
  duration: number;
  tempo: number;
  warnings?: string[];
}

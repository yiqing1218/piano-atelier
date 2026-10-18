import type { NoteEvent, ScoreDocument } from "../../types/music";

function directChildren(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === localName);
}

function firstChild(element: Element, localName: string): Element | undefined {
  return directChildren(element, localName)[0];
}

function textOf(element: Element, localName: string): string | null {
  const child = firstChild(element, localName);
  return child?.textContent?.trim() ?? null;
}

function descendants(element: Element, localName: string): Element[] {
  return Array.from(element.getElementsByTagName("*")).filter((child) => child.localName === localName);
}

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parseMusicXmlText(sourceName: string, xmlText: string): ScoreDocument {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("MusicXML 格式无效，无法解析。");

  const root = xml.documentElement;
  const partElements = descendants(root, "part").filter((part) => part.parentElement?.localName === "score-partwise");
  if (!partElements.length) throw new Error("未找到 score-partwise 乐谱声部；当前原型暂不支持该 MusicXML 结构。");

  const partNames = new Map<string, string>();
  const partList = descendants(root, "score-part").filter((part) => part.parentElement?.localName === "part-list");
  partList.forEach((part, index) => {
    const id = part.getAttribute("id") ?? String(index);
    partNames.set(id, textOf(part, "part-name") ?? `Part ${index + 1}`);
  });

  const warnings = new Set<string>();
  const unsupported: Record<string, string> = {
    repeat: "反复记号尚未展开，按书写顺序演奏一次。",
    ending: "反复结尾尚未展开。",
    segno: "跳转记号尚未展开。", coda: "跳转记号尚未展开。",
    grace: "装饰音尚未演奏。", dynamics: "力度记号尚未应用，使用统一默认力度。",
    pedal: "踏板记号尚未应用。", transpose: "移调记号尚未应用，按书写音高演奏。",
    glissando: "滑音尚未演奏。", tremolo: "震音尚未展开。",
    wedge: "渐强渐弱尚未应用。", unpitched: "无固定音高的打击乐音符已略过。",
    "octave-shift": "八度移位记号尚未应用。",
  };
  for (const [tag, warning] of Object.entries(unsupported)) {
    if (descendants(root, tag).length) warnings.add(warning);
  }
  if (descendants(root, "sound").some((sound) => ["dacapo", "dalsegno", "tocoda", "fine"].some((name) => sound.hasAttribute(name)))) {
    warnings.add("D.C./D.S./Fine 等跳转尚未展开，按书写顺序演奏一次。");
  }
  const tempos = new Map<number, number>([[0, 120]]);
  const explicitTempos = new Set<number>();
  let totalBeats = 0;
  const beatNotes: Array<{ id: string; midi: number; startBeat: number; durationBeat: number; velocity: number; track: number; part: string }> = [];

  partElements.forEach((part, partIndex) => {
    const partId = part.getAttribute("id") ?? String(partIndex);
    const partName = partNames.get(partId) ?? `Part ${partIndex + 1}`;
    let divisions = 1;
    let beatsPerMeasure = 4;
    let beatType = 4;
    let measureOffset = 0;
    let noteCounter = 0;
    const ties = new Map<string, (typeof beatNotes)[number]>();

    const measures = directChildren(part, "measure");
    measures.forEach((measure) => {
      let cursor = 0;
      let maxCursor = 0;
      let lastNoteStart = 0;

      for (const item of Array.from(measure.children)) {
        if (item.localName === "attributes") {
          const divisionsText = textOf(item, "divisions");
          if (divisionsText) {
            divisions = Number(divisionsText);
            if (!Number.isFinite(divisions) || divisions <= 0) throw new Error("MusicXML divisions 必须为正数。");
          }

          const time = firstChild(item, "time");
          if (time) {
            const beatsText = textOf(time, "beats");
            beatsPerMeasure = beatsText ? beatsText.split("+").reduce((sum, value) => sum + Number(value), 0) : beatsPerMeasure;
            beatType = Number(textOf(time, "beat-type") ?? beatType);
            if (!Number.isFinite(beatsPerMeasure) || beatsPerMeasure <= 0 || !Number.isFinite(beatType) || beatType <= 0) {
              throw new Error("MusicXML 拍号无效。");
            }
          }
          continue;
        }

        if (item.localName === "direction") {
          const sound = descendants(item, "sound")[0];
          const soundTempo = Number(sound?.getAttribute("tempo"));
          const metronome = descendants(item, "metronome")[0];
          const units: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25, "32nd": 0.125 };
          const unit = metronome ? textOf(metronome, "beat-unit") ?? "quarter" : "quarter";
          const dots = metronome ? directChildren(metronome, "beat-unit-dot").length : 0;
          const perMinute = metronome ? Number(textOf(metronome, "per-minute")) * (units[unit] ?? 1) * (2 - Math.pow(0.5, dots)) : 0;
          const bpm = soundTempo > 0 ? soundTempo : perMinute;
          if (Number.isFinite(bpm) && bpm > 0) {
            const directionOffset = Number(textOf(item, "offset") ?? 0) / divisions;
            if (!Number.isFinite(directionOffset)) throw new Error("MusicXML 速度标记的时间偏移无效。");
            const beat = Math.max(0, measureOffset + cursor + directionOffset);
            if (explicitTempos.has(beat) && tempos.get(beat) !== bpm) warnings.add("不同声部存在冲突速度，采用首个声部的速度。");
            else { tempos.set(beat, bpm); explicitTempos.add(beat); }
          }
          continue;
        }

        if (item.localName === "backup" || item.localName === "forward") {
          const duration = Number(textOf(item, "duration") ?? 0) / divisions;
          if (!Number.isFinite(duration) || duration < 0) throw new Error("MusicXML 声部移动时值无效。");
          cursor += item.localName === "backup" ? -duration : duration;
          cursor = Math.max(0, cursor);
          maxCursor = Math.max(maxCursor, cursor);
          continue;
        }

        if (item.localName !== "note") continue;

        const durationDivisions = Number(textOf(item, "duration") ?? 0);
        if (!Number.isFinite(durationDivisions) || durationDivisions < 0) throw new Error("MusicXML 音符时值无效。");
        const durationBeat = firstChild(item, "grace") ? 0 : durationDivisions / divisions;
        const isChordTone = Boolean(firstChild(item, "chord"));
        const startBeatInMeasure = isChordTone ? lastNoteStart : cursor;

        if (!isChordTone) {
          lastNoteStart = cursor;
          cursor += durationBeat;
        }
        maxCursor = Math.max(maxCursor, cursor, startBeatInMeasure + durationBeat);

        const pitch = firstChild(item, "pitch");
        if (!pitch || firstChild(item, "rest")) continue;

        const step = textOf(pitch, "step") ?? "C";
        const octave = Number(textOf(pitch, "octave") ?? 4);
        const alterElement = firstChild(pitch, "alter");
        // MusicXML pitch/alter encodes the sounding pitch; key signatures and
        // printed accidentals must never be inferred a second time.
        const alter = alterElement ? Number(alterElement.textContent) : 0;
        if (!(step in STEP_SEMITONES) || !Number.isInteger(octave) || !Number.isInteger(alter)) {
          throw new Error("MusicXML 音高无效，或包含尚不支持的微分音。");
        }
        const midi = (octave + 1) * 12 + STEP_SEMITONES[step] + alter;
        const isGrace = Boolean(firstChild(item, "grace"));
        if (!isGrace && durationBeat > 0) {
          if (midi < 21 || midi > 108) { warnings.add("已略过 A0–C8 范围以外的音符。"); continue; }
          const startBeat = measureOffset + startBeatInMeasure;
          const tieTypes = [...directChildren(item, "tie"), ...descendants(item, "tied")].map((tie) => tie.getAttribute("type"));
          const tieKey = `${textOf(item, "voice") ?? "1"}:${textOf(item, "staff") ?? "1"}:${midi}`;
          const previous = ties.get(tieKey);
          let result: (typeof beatNotes)[number];
          if (tieTypes.includes("stop") && previous && Math.abs(previous.startBeat + previous.durationBeat - startBeat) < 0.00001) {
            previous.durationBeat += durationBeat;
            result = previous;
          } else {
            if (tieTypes.includes("stop")) warnings.add("发现无法配对的延音线终点，按独立音符演奏。");
            result = {
              id: `xml-${partIndex}-${noteCounter++}`, midi, startBeat, durationBeat,
              velocity: 0.78, track: partIndex, part: partName,
            };
            beatNotes.push(result);
          }
          if (tieTypes.includes("start")) ties.set(tieKey, result);
          else ties.delete(tieKey);
        }
      }

      const nominalMeasureBeats = beatsPerMeasure * (4 / Math.max(1, beatType));
      measureOffset += measure.getAttribute("implicit") === "yes" ? maxCursor : Math.max(maxCursor, nominalMeasureBeats);
    });
    if (ties.size) warnings.add("发现未结束的延音线，按已有时值演奏。");
    totalBeats = Math.max(totalBeats, measureOffset);
  });

  if (!beatNotes.length) throw new Error("MusicXML 中没有找到可播放的有音高音符。");

  const tempoMap = [...tempos].sort((a, b) => a[0] - b[0]);
  const tempo = tempoMap[0][1];
  const secondsAtBeat = (beat: number): number => {
    let seconds = 0;
    for (let i = 0; i < tempoMap.length; i++) {
      const [start, bpm] = tempoMap[i];
      if (beat <= start) break;
      const end = Math.min(beat, tempoMap[i + 1]?.[0] ?? beat);
      seconds += (end - start) * 60 / bpm;
    }
    return seconds;
  };
  const notes: NoteEvent[] = beatNotes.map((note) => ({
    id: note.id, midi: note.midi,
    start: secondsAtBeat(note.startBeat),
    duration: secondsAtBeat(note.startBeat + note.durationBeat) - secondsAtBeat(note.startBeat),
    velocity: note.velocity, track: note.track, part: note.part,
  })).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const duration = secondsAtBeat(totalBeats);
  const title = textOf(root, "movement-title") ?? sourceName.replace(/\.(xml|musicxml|mxl)$/i, "");

  return {
    title,
    sourceName,
    format: "musicxml",
    notes,
    duration,
    tempo,
    warnings: [...warnings],
  };
}

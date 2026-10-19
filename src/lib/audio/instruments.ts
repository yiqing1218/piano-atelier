import type { NoteEvent } from "../../types/music";
export type PlaybackMode = "unified" | "multitrack";
export type InstrumentId = "piano" | "guitar" | "bass" | "violin" | "strings" | "drums" | "erhu" | "trumpet" | "tuba" | "ukulele" | `gm-${number}`;
export interface InstrumentPatch { program: number; percussion: boolean; bankMSB?: number }
export interface InstrumentDefinition extends InstrumentPatch { id: InstrumentId; name: string; group: string }
export interface TrackMix { instrument?: InstrumentId; volume: number }
export type TrackMixes = Record<number, TrackMix>;
export interface MixSettings { mode: PlaybackMode; instrument: InstrumentId; tracks: TrackMixes; master: number; speed: number }
const GM_NAMES = [
  "大钢琴", "明亮钢琴", "电钢琴", "酒吧钢琴", "电钢琴 1", "电钢琴 2", "羽管键琴", "击弦古钢琴",
  "钢片琴", "钟琴", "音乐盒", "颤音琴", "马林巴", "木琴", "管钟", "扬琴",
  "拉杆风琴", "打击风琴", "摇滚风琴", "教堂管风琴", "簧风琴", "手风琴", "口琴", "探戈手风琴",
  "尼龙弦吉他", "钢弦木吉他", "爵士电吉他", "清音电吉他", "闷音电吉他", "过载电吉他", "失真电吉他", "吉他泛音",
  "原声贝斯", "指弹电贝斯", "拨片电贝斯", "无品贝斯", "击弦贝斯 1", "击弦贝斯 2", "合成贝斯 1", "合成贝斯 2",
  "小提琴", "中提琴", "大提琴", "低音提琴", "颤弓弦乐", "拨弦弦乐", "竖琴", "定音鼓",
  "弦乐合奏", "慢弦乐合奏", "合成弦乐 1", "合成弦乐 2", "合唱啊声", "合唱哦声", "合成人声", "管弦乐齐奏",
  "小号", "长号", "大号", "弱音小号", "圆号", "铜管合奏", "合成铜管 1", "合成铜管 2",
  "高音萨克斯", "中音萨克斯", "次中音萨克斯", "上低音萨克斯", "双簧管", "英国管", "巴松管", "单簧管",
  "短笛", "长笛", "竖笛", "排箫", "吹瓶", "尺八", "哨笛", "陶笛",
  "方波主音", "锯齿主音", "汽笛主音", "风笛主音", "吉他主音", "人声主音", "五度主音", "贝斯主音",
  "新时代铺底", "温暖铺底", "合成弦乐铺底", "合唱铺底", "弓弦铺底", "金属铺底", "光环铺底", "扫频铺底",
  "雨滴效果", "电影效果", "水晶效果", "氛围效果", "明亮效果", "妖怪效果", "回声效果", "科幻效果",
  "西塔琴", "班卓琴", "三味线", "日本筝", "卡林巴", "风笛", "民族提琴", "唢呐类管乐",
  "叮当铃", "阿哥哥鼓", "钢鼓", "木鱼", "太鼓", "旋律通鼓", "合成鼓", "反向镲",
  "吉他换把声", "呼吸声", "海浪", "鸟鸣", "电话铃", "直升机", "掌声", "枪声",
];
const GROUPS = ["钢琴", "键盘打击乐", "风琴", "吉他", "贝斯", "弦乐与竖琴", "合奏与人声", "铜管", "木管", "笛类", "合成主音", "合成铺底", "音效", "民族乐器", "打击乐", "环境音效"];
const aliases: Record<number, InstrumentId> = { 0: "piano", 25: "guitar", 33: "bass", 40: "violin", 48: "strings" };
export const INSTRUMENTS: InstrumentDefinition[] = [
  { id: "erhu", name: "二胡 · 独立实录", group: "精选实录", program: 110, percussion: false, bankMSB: 1 },
  { id: "trumpet", name: "小号 · VSCO 实录", group: "精选实录", program: 56, percussion: false, bankMSB: 1 },
  { id: "tuba", name: "大号 · VSCO 实录", group: "精选实录", program: 58, percussion: false, bankMSB: 1 },
  { id: "ukulele", name: "尤克里里 · 独立实录", group: "精选实录", program: 24, percussion: false, bankMSB: 1 },
  ...GM_NAMES.map((name, program): InstrumentDefinition => ({ id: aliases[program] ?? `gm-${program}`, name: program === 0 ? "钢琴 · Yamaha C5" : `${name} · GM`, group: GROUPS[Math.floor(program / 8)], program, percussion: false })),
  { id: "drums", name: "鼓组 · 标准套鼓", group: "鼓组", program: 0, percussion: true },
];
export const INSTRUMENT_GROUPS = [...new Set(INSTRUMENTS.map((item) => item.group))];
export const clampVolume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
export function instrumentById(id: InstrumentId): InstrumentDefinition { return INSTRUMENTS.find((item) => item.id === id) ?? INSTRUMENTS.find((item) => item.id === "piano")!; }
export function resolveInstrument(mode: PlaybackMode, selected: InstrumentId, note?: Partial<NoteEvent>, mixes: TrackMixes = {}): InstrumentPatch {
  if (mode === "multitrack" && note) {
    const override = mixes[note.track ?? 0]?.instrument;
    if (override) return resolveInstrument("unified", override);
    if (note.bankMSB === 1 && !note.percussion && [24, 56, 58, 110].includes(note.program ?? 0)) return { program: note.program!, percussion: false, bankMSB: 1 };
    if (!note.percussion && [56, 58].includes(note.program ?? 0)) return resolveInstrument("unified", note.program === 56 ? "trumpet" : "tuba");
    return { program: note.program ?? 0, percussion: note.percussion ?? false };
  }
  const item = instrumentById(selected);
  return { program: item.program, percussion: item.percussion, ...(item.bankMSB ? { bankMSB: item.bankMSB } : {}) };
}
export function instrumentLabel(note: Partial<NoteEvent>): string {
  if (note.percussion) return `鼓组 · ${note.instrumentName || "Standard"}`;
  if (note.bankMSB === 1) return INSTRUMENTS.find((item) => item.bankMSB === 1 && item.program === note.program)?.name ?? "自定义音色";
  return GM_NAMES[note.program ?? 0] ?? note.instrumentName ?? "钢琴";
}

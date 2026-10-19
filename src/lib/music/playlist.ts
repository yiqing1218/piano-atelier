export type RepeatMode = "once" | "list" | "shuffle" | "one";
export function nextSong(ids: string[], current: string | null, mode: RepeatMode, random = Math.random): string | null {
  if (!ids.length || mode === "once") return null;
  if (mode === "one") return current && ids.includes(current) ? current : ids[0];
  if (mode === "shuffle") {
    const options = ids.length > 1 ? ids.filter((id) => id !== current) : ids;
    return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
  }
  return ids[(ids.indexOf(current ?? "") + 1) % ids.length];
}

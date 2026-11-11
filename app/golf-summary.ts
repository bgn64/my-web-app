export function summarize(holes: { par: number; strokes: number | null }[]) {
  const played = holes.filter((hole) => hole.strokes !== null);
  const strokes = played.reduce((sum, hole) => sum + (hole.strokes ?? 0), 0);
  const par = played.reduce((sum, hole) => sum + hole.par, 0);
  return { played: played.length, total: holes.length, strokes, relative: strokes - par };
}

export function relativeScore(value: number) {
  return value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
}

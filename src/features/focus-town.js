const LANDMARKS = Object.freeze([
  { id: "bookshop", name: "古本屋", minutes: 25 },
  { id: "cafe", name: "喫茶店", minutes: 75 },
  { id: "bathhouse", name: "銭湯", minutes: 150 },
  { id: "alley", name: "横丁", minutes: 300 },
  { id: "lighthouse", name: "灯台", minutes: 600 }
]);

/** A quiet, cumulative reward: missed days never remove progress. */
export function getFocusTownState(totalMinutes = 0) {
  const parsed = Number(totalMinutes);
  const minutes = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  const landmarks = LANDMARKS.map((place) => ({ ...place, unlocked: minutes >= place.minutes }));
  const next = LANDMARKS.find((place) => minutes < place.minutes) || null;
  const previous = next ? LANDMARKS[LANDMARKS.indexOf(next) - 1]?.minutes || 0 : 600;
  const remaining = next ? next.minutes - minutes : 0;
  const progress = next
    ? Math.max(0, Math.min(100, (minutes - previous) / (next.minutes - previous) * 100))
    : 100;
  return {
    minutes,
    landmarks,
    unlockedCount: landmarks.filter((place) => place.unlocked).length,
    next,
    remaining,
    progress
  };
}

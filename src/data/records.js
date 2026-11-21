import { dateKey } from "../core/date-time.js";

/**
 * Rebuild aggregate totals from legacy totals plus detailed session records.
 * Returns new values and never mutates the supplied records or history.
 */
export function calculateStats({
  legacyCompleted = 0,
  legacyMinutes = 0,
  legacyHistory = {},
  records = []
} = {}) {
  const sessions = Array.isArray(records) ? records : [];
  const safeLegacyHistory = legacyHistory && typeof legacyHistory === "object"
    ? legacyHistory
    : {};

  const completed = Math.max(0, Number(legacyCompleted) || 0) + sessions.length;
  const minutes = Math.max(0, Number(legacyMinutes) || 0)
    + sessions.reduce((total, record) => total + (Number(record?.minutes) || 0), 0);

  const history = { ...safeLegacyHistory };
  for (const record of sessions) {
    const key = record?.date || dateKey(new Date(Number(record?.timestamp)));
    const previous = Number(history[key]) || 0;
    history[key] = previous + (Number(record?.minutes) || 0);
  }

  return { completed, minutes, history };
}

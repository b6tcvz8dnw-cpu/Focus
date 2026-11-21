/**
 * Pure timer calculations shared by the focus timer and the break hourglass.
 */

/** Calculate remaining whole seconds from an absolute deadline. */
export function getRemainingSeconds(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil((Number(deadline) - Number(now)) / 1000));
}

/** Choose the break that follows a completed focus session. */
export function getNextBreakMode(completedSessions, sessionsPerLongBreak) {
  const completed = Math.max(0, Math.floor(Number(completedSessions) || 0));
  const interval = Math.max(2, Math.floor(Number(sessionsPerLongBreak) || 4));
  return completed > 0 && completed % interval === 0 ? "long" : "short";
}

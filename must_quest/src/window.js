// Settlement window rules (assessment rules, fictional service).
//
// Settlement runs every Tuesday at 09:00 UTC.
// It covers tasks completed from the previous Monday 00:00 UTC (included)
// up to the most recent Monday 00:00 UTC (excluded).
// All date math is done in UTC so the server time zone never matters.

export const CREDITS_PER_TASK = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

// A timestamp is only accepted when it carries an explicit offset (Z or +hh:mm / -hh:mm).
// A timestamp with no offset is ambiguous, so it is rejected instead of guessed.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function hasExplicitOffset(value) {
  return typeof value === 'string' && ISO_WITH_OFFSET.test(value) && !Number.isNaN(Date.parse(value));
}

export function settlementWindow(runAt) {
  const run = new Date(runAt);
  if (Number.isNaN(run.getTime())) throw new Error(`Invalid runAt: ${runAt}`);

  const daysSinceMonday = (run.getUTCDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const startOfRunDay = Date.UTC(run.getUTCFullYear(), run.getUTCMonth(), run.getUTCDate());
  const end = startOfRunDay - daysSinceMonday * DAY_MS; // most recent Monday 00:00 UTC
  const start = end - 7 * DAY_MS; // previous Monday 00:00 UTC

  return {
    id: new Date(start).toISOString().slice(0, 10), // e.g. "2026-10-19"
    start: new Date(start),
    end: new Date(end),
  };
}

export function isInWindow(completedAt, window) {
  const t = Date.parse(completedAt);
  return t >= window.start.getTime() && t < window.end.getTime(); // upper bound excluded
}

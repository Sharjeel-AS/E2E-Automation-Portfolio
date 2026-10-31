export const CREDITS_PER_TASK = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function hasExplicitOffset(value) {
  return typeof value === 'string' && ISO_WITH_OFFSET.test(value) && !Number.isNaN(Date.parse(value));
}

export function settlementWindow(runAt) {
  const run = new Date(runAt);
  if (Number.isNaN(run.getTime())) throw new Error(`Invalid runAt: ${runAt}`);

  const daysSinceMonday = (run.getUTCDay() + 6) % 7;
  const startOfRunDay = Date.UTC(run.getUTCFullYear(), run.getUTCMonth(), run.getUTCDate());
  const end = startOfRunDay - daysSinceMonday * DAY_MS;
  const start = end - 7 * DAY_MS;

  return {
    id: new Date(start).toISOString().slice(0, 10),
    start: new Date(start),
    end: new Date(end),
  };
}

export function isInWindow(completedAt, window) {
  const t = Date.parse(completedAt);
  return t >= window.start.getTime() && t < window.end.getTime();
}

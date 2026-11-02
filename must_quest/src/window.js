// credits per completed task
export const CREDITS_PER_TASK = 10;

// check timestamp has a timezone (Z or +05:00)
export function hasTimezone(timestamp) {
  return timestamp.endsWith('Z') || /[+-]\d\d:\d\d$/.test(timestamp);
}

// get the week to pay for: last monday 00:00 utc to this monday 00:00 utc
export function getSettlementWindow(runAt) {
  const end = new Date(runAt);
  end.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (end.getUTCDay() + 6) % 7;
  end.setUTCDate(end.getUTCDate() - daysSinceMonday);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);

  return { id: start.toISOString().slice(0, 10), start, end };
}

// is the task inside that week
export function isInWindow(completedAt, window) {
  const time = new Date(completedAt);
  return time >= window.start && time < window.end;
}

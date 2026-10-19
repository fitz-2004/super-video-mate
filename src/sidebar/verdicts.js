// How each verdict is presented. Colors follow the categorical palette order
// (blue, orange, aqua, yellow, magenta) and are defined as CSS tokens per theme.
export const VERDICTS = {
  later: { label: 'Explained later', short: 'Later', icon: '⏭', color: 'var(--v-later)' },
  earlier: { label: 'Covered earlier', short: 'Earlier', icon: '⏮', color: 'var(--v-earlier)' },
  now: { label: 'Being explained now', short: 'Now', icon: '▶', color: 'var(--v-now)' },
  assumed: { label: 'Background the video assumes', short: 'Assumed', icon: '◆', color: 'var(--v-assumed)' },
  beyond: { label: 'Beyond this video', short: 'Beyond', icon: '↗', color: 'var(--v-beyond)' },
};

export const VERDICT_ORDER = ['later', 'earlier', 'now', 'assumed', 'beyond'];

import { fmt } from './time.js';

// Merge raw caption cues (often 2–4s each) into ~12s lines. Fewer timestamps means
// far fewer tokens, while still letting Claude cite moments precisely.
export function compactLines(cues, target = 12) {
  const lines = [];
  let cur = null;
  for (const c of cues) {
    if (!cur || c.start - cur.start >= target) {
      cur = { start: c.start, end: c.end, text: c.text };
      lines.push(cur);
    } else {
      cur.text += ' ' + c.text;
      cur.end = Math.max(cur.end, c.end);
    }
  }
  return lines;
}

export function transcriptText(lines) {
  return lines.map((l) => `[${fmt(l.start)}] ${l.text}`).join('\n');
}

// Binary search for the cue playing at time t.
export function cueAt(cues, t) {
  if (!cues?.length) return null;
  let lo = 0, hi = cues.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (best < 0) return null;
  return t - cues[best].start < 15 ? cues[best] : null;
}

// What has been on screen just before (and a beat after) t.
export function windowText(cues, t, before = 25, after = 4) {
  if (!cues?.length) return '';
  return cues
    .filter((c) => c.start >= t - before && c.start <= t + after)
    .map((c) => c.text)
    .join(' ');
}

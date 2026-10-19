export function fmt(seconds) {
  // Live streams report an infinite duration.
  if (!Number.isFinite(seconds)) return 'live';
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// "12:30" | "1:02:03" -> seconds, or null
export function parseStamp(str) {
  if (!str) return null;
  const parts = String(str).trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// Matches [12:30], [1:02:03] and ranges like [12:30–13:10]
export const STAMP_RE = /\[(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[-–]\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]/g;

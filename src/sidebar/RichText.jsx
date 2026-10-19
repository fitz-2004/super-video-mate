import React from 'react';
import { parseStamp, STAMP_RE } from '../shared/time.js';

// Minimal renderer for replies: paragraphs, **bold**, and clickable [mm:ss] chips.
function inline(text, onSeek, keyBase) {
  const out = [];
  let last = 0;
  let i = 0;
  const re = new RegExp(`${STAMP_RE.source}|\\*\\*([^*]+)\\*\\*`, 'g');
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[3] != null) {
      out.push(<strong key={`${keyBase}-b${i++}`}>{m[3]}</strong>);
    } else {
      const t = parseStamp(m[1]);
      // A span (not <button>) so the chip flows inline with surrounding punctuation.
      out.push(
        <span
          key={`${keyBase}-t${i++}`}
          className="stamp"
          role="button"
          tabIndex={0}
          title="Jump to this moment"
          onClick={() => onSeek(t)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSeek(t))}
        >
          {m[2] ? `${m[1]}–${m[2]}` : m[1]}
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function RichText({ text, onSeek }) {
  const paras = text.split(/\n{2,}/);
  return paras.map((p, pi) => (
    <p key={pi}>
      {p.split('\n').map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 && <br />}
          {inline(line, onSeek, `${pi}-${li}`)}
        </React.Fragment>
      ))}
    </p>
  ));
}

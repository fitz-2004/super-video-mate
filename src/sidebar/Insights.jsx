import React, { useMemo, useState } from 'react';
import { VERDICTS, VERDICT_ORDER } from './verdicts.js';
import { fmt } from '../shared/time.js';
import { clearInsights } from '../shared/store.js';

const BINS = 24;

function Timeline({ entries, duration, onSeek }) {
  const [hover, setHover] = useState(null);
  const bins = useMemo(() => {
    const out = Array.from({ length: BINS }, (_, i) => ({ i, from: (i * duration) / BINS, to: ((i + 1) * duration) / BINS, counts: {}, total: 0 }));
    for (const e of entries) {
      const b = out[Math.min(BINS - 1, Math.floor((e.t / duration) * BINS))];
      const k = VERDICTS[e.verdict] ? e.verdict : 'other';
      b.counts[k] = (b.counts[k] || 0) + 1;
      b.total++;
    }
    return out;
  }, [entries, duration]);
  const max = Math.max(1, ...bins.map((b) => b.total));
  const present = VERDICT_ORDER.filter((k) => entries.some((e) => e.verdict === k));
  const hasOther = entries.some((e) => !VERDICTS[e.verdict]);

  return (
    <figure className="timeline">
      {present.length + (hasOther ? 1 : 0) > 1 && (
        <figcaption className="legend">
          {present.map((k) => (
            <span key={k}><i style={{ background: VERDICTS[k].color }} />{VERDICTS[k].short}</span>
          ))}
          {hasOther && <span><i style={{ background: 'var(--v-other)' }} />Other</span>}
        </figcaption>
      )}
      <div className="tl-plot" onMouseLeave={() => setHover(null)}>
        {bins.map((b) => (
          <button
            key={b.i}
            className="tl-col"
            onMouseEnter={() => setHover(b)}
            onFocus={() => setHover(b)}
            onClick={() => b.total && onSeek(b.from)}
            aria-label={`${fmt(b.from)} to ${fmt(b.to)}: ${b.total} question${b.total === 1 ? '' : 's'}`}
          >
            <span className="tl-stack" style={{ height: `${(b.total / max) * 100}%` }}>
              {[...VERDICT_ORDER, 'other'].filter((k) => b.counts[k]).map((k) => (
                <span key={k} className="tl-seg" style={{ flexGrow: b.counts[k], background: VERDICTS[k]?.color || 'var(--v-other)' }} />
              ))}
            </span>
          </button>
        ))}
        {hover && hover.total > 0 && (
          <div className="tl-tip" style={{ left: `${((hover.i + 0.5) / BINS) * 100}%` }}>
            <b>{fmt(hover.from)}–{fmt(hover.to)}</b>
            {Object.entries(hover.counts).map(([k, n]) => (
              <span key={k}>{VERDICTS[k]?.short || 'Other'}: {n}</span>
            ))}
          </div>
        )}
      </div>
      <div className="tl-axis"><span>0:00</span><span>{fmt(duration / 2)}</span><span>{fmt(duration)}</span></div>
    </figure>
  );
}

function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Insights({ insights, videoId, meta, duration, onSeek, onCleared }) {
  const mine = insights.filter((e) => e.videoId === videoId).sort((a, b) => a.t - b.t);
  const d = duration || meta?.duration || Math.max(60, ...mine.map((e) => e.t));

  const videos = useMemo(() => {
    const map = new Map();
    for (const e of insights) {
      const v = map.get(e.videoId) || { videoId: e.videoId, title: e.title, channel: e.channel, n: 0, last: 0 };
      v.n++;
      v.last = Math.max(v.last, e.at);
      map.set(e.videoId, v);
    }
    return [...map.values()].sort((a, b) => b.last - a.last);
  }, [insights]);

  const top = useMemo(() => {
    const c = {};
    for (const e of mine) c[e.verdict] = (c[e.verdict] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  }, [mine]);

  return (
    <div className="insights">
      <section className="card">
        <div className="card-head">
          <h2>This video</h2>
          <span className="muted">{mine.length} question{mine.length === 1 ? '' : 's'}</span>
        </div>
        {mine.length === 0 ? (
          <p className="muted small">Questions you ask show up here on the video’s timeline, so you can see where it got confusing.</p>
        ) : (
          <>
            {top && VERDICTS[top[0]] && (
              <p className="insight-line">
                Most of your questions were <b>{VERDICTS[top[0]].short.toLowerCase()}</b> — {
                  { later: 'the video was setting things up ahead of its explanations.',
                    earlier: 'worth a quick rewatch of the earlier parts.',
                    now: 'you were asking right as things were being explained.',
                    assumed: 'the video leans on background it doesn’t teach.',
                    beyond: 'you were curious past what the video covers.' }[top[0]]
                }
              </p>
            )}
            <Timeline entries={mine} duration={d} onSeek={onSeek} />
            <ol className="q-list">
              {mine.map((e) => (
                <li key={e.id}>
                  <button className="q-time" onClick={() => onSeek(e.t)}>{fmt(e.t)}</button>
                  <i className="q-dot" style={{ background: VERDICTS[e.verdict]?.color || 'var(--v-other)' }} title={VERDICTS[e.verdict]?.label || 'Other'} />
                  <span className="q-text">{e.q}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>All videos</h2>
          <span className="muted">{insights.length} total</span>
        </div>
        {videos.length === 0 ? (
          <p className="muted small">Nothing yet.</p>
        ) : (
          <ul className="v-list">
            {videos.slice(0, 30).map((v) => (
              <li key={v.videoId}>
                <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_top">{v.title || v.videoId}</a>
                <span className="muted">{v.channel} · {v.n}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          Stored only in this browser. For creators: this is the “why” behind rewatch spikes — export it to share.
        </p>
        <div className="row">
          <button className="chip" disabled={!insights.length} onClick={() => download('super-video-mate-questions.json', insights)}>Export JSON</button>
          <button
            className="chip danger"
            disabled={!insights.length}
            onClick={async () => {
              if (confirm('Delete all saved questions? This cannot be undone.')) {
                await clearInsights();
                onCleared();
              }
            }}
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  );
}

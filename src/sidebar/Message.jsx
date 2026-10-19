import React, { memo, useState } from 'react';
import RichText from './RichText.jsx';
import { VERDICTS } from './verdicts.js';
import { fmt, parseStamp } from '../shared/time.js';
import { modelInfo } from '../shared/settings.js';

function VerdictCard({ verdict, onSeek, remind, onToggleRemind }) {
  const v = VERDICTS[verdict.kind];
  if (!v) return null;
  const t = parseStamp(verdict.stamp);
  return (
    <div className="verdict" style={{ '--vc': v.color }}>
      <span className="verdict-icon" aria-hidden="true">{v.icon}</span>
      <span className="verdict-label">
        {v.label}
        {t != null && <span className="verdict-time"> · {fmt(t)}</span>}
      </span>
      <span className="verdict-actions">
        {verdict.kind === 'later' && t != null && (
          <>
            <button className={`chip ${remind ? 'chip-on' : ''}`} onClick={onToggleRemind} aria-pressed={!!remind}>
              {remind ? '✓ Will remind' : 'Remind me'}
            </button>
            <button className="chip" onClick={() => onSeek(t, true)} title="Jump ahead — a Back button appears on the video">
              Peek
            </button>
          </>
        )}
        {verdict.kind === 'earlier' && t != null && (
          <button className="chip" onClick={() => onSeek(t, true)} title="Rewatch — a Back button appears on the video">
            Rewatch
          </button>
        )}
      </span>
    </div>
  );
}

function Footer({ msg, showCost }) {
  if (msg.streaming || msg.error) return null;
  const parts = [modelInfo(msg.model).label];
  if (msg.stopped) parts.push('stopped');
  if (showCost && msg.cost != null) {
    parts.push(msg.cost < 0.001 ? '<$0.001' : `$${msg.cost.toFixed(3)}`);
    if (msg.usage?.cache_read_input_tokens) parts.push('cached');
  }
  return <div className="msg-meta">{parts.join(' · ')}</div>;
}

function Message({ msg, highlight, showCost, onSeek, onToggleRemind, onRetry, onOpenSettings }) {
  const [copied, setCopied] = useState(false);

  if (msg.role === 'user') {
    return (
      <div className={`msg user ${highlight ? 'flash' : ''}`} id={`m-${msg.id}`}>
        <button className="asked-at" onClick={() => onSeek(msg.t)} title="Jump to where you asked">
          at {fmt(msg.t)}
        </button>
        <div className="bubble">
          {msg.thumb && <img className="bubble-frame" src={msg.thumb} alt={`Frame at ${fmt(msg.frameAt ?? msg.t)}`} />}
          {msg.text}
        </div>
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(msg.body || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={`msg assistant ${highlight ? 'flash' : ''}`} id={`m-${msg.id}`}>
      <div className="answer-card">
        {msg.verdict && <VerdictCard verdict={msg.verdict} onSeek={onSeek} remind={msg.remind} onToggleRemind={() => onToggleRemind(msg.id)} />}
        {msg.error ? (
          <div className="error">
            <p>{msg.error}</p>
            <div className="error-actions">
              {msg.fix === 'settings' && <button className="chip" onClick={onOpenSettings}>Open settings</button>}
              <button className="chip" onClick={() => onRetry(msg.id)}>Try again</button>
            </div>
          </div>
        ) : msg.body ? (
          <div className="answer">
            <RichText text={msg.body} onSeek={onSeek} />
            {msg.streaming && <span className="caret" aria-hidden="true" />}
          </div>
        ) : (
          <div className="thinking" aria-label="Thinking">
            <span /><span /><span />
          </div>
        )}
        {!msg.streaming && !msg.error && (
          <div className="msg-foot">
            <Footer msg={msg} showCost={showCost} />
            <button className="ghost-btn" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(Message);

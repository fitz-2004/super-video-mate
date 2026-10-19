import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen, send } from './bridge.js';
import Message from './Message.jsx';
import Insights from './Insights.jsx';
import Settings from '../shared/Settings.jsx';
import { VERDICTS } from './verdicts.js';
import { ask, buildVideoBlock, describeError, prewarm, splitVerdict, turnContent, Anthropic } from '../shared/mate.js';
import { costOf, loadSettings, onSettingsChange } from '../shared/settings.js';
import { cacheTranscript, loadCachedTranscript, loadChat, loadInsights, logInsight, saveChat } from '../shared/store.js';
import { cueAt } from '../shared/transcript.js';
import { fmt, parseStamp } from '../shared/time.js';

const uid = () => Math.random().toString(36).slice(2, 10);
const TRANSCRIPT_TTL = 1000 * 60 * 60 * 24 * 7;

const CHIPS = [
  { label: 'What’s on screen?', q: 'Explain what’s on screen right now.', frame: true },
  { label: 'What does this mean?', q: 'What does this mean?' },
  { label: 'Why does this matter?', q: 'Why does this part matter for the bigger picture?' },
  { label: 'Recap so far', q: 'Give me a quick recap of what I’ve watched so far.' },
  { label: 'Quiz me', q: 'Quiz me with one short question about what was just explained.' },
];

export default function App() {
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState('chat');
  const [videoId, setVideoId] = useState(null);
  const [tx, setTx] = useState({ status: 'idle' });
  const [player, setPlayer] = useState({ t: 0, duration: 0, paused: true });
  const [messages, setMessages] = useState([]);
  const [insights, setInsights] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [pausedByMate, setPausedByMate] = useState(false);
  const [frame, setFrame] = useState(null); // { image, thumb, t } attached to the next question
  const [capturing, setCapturing] = useState(false);
  const [frameError, setFrameError] = useState(null);

  const streamRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const prevT = useRef(0);
  const warmed = useRef(new Map());
  const frameWaiters = useRef(new Map());
  const attachRef = useRef(null);
  const videoRef = useRef(null);
  videoRef.current = videoId;

  // ---------- settings ----------
  useEffect(() => {
    loadSettings().then(setSettings);
    loadInsights().then(setInsights);
    return onSettingsChange(setSettings);
  }, []);

  // ---------- messages from YouTube ----------
  const openVideo = useCallback(async (id) => {
    streamRef.current?.abort();
    setVideoId(id);
    setMessages([]);
    setBusy(false);
    setPausedByMate(false);
    setFrame(null);
    setTx({ status: 'loading' });
    if (!id) return;
    const [chat, cached] = await Promise.all([loadChat(id), loadCachedTranscript(id)]);
    if (videoRef.current !== id) return;
    setMessages(chat);
    if (cached?.cues && Date.now() - cached.savedAt < TRANSCRIPT_TTL) {
      setTx({ status: 'ready', meta: cached.meta, cues: cached.cues });
    } else {
      send('NEED_TRANSCRIPT', { videoId: id });
    }
  }, []);

  useEffect(() => {
    const off = listen((msg) => {
      switch (msg.type) {
        case 'VIDEO':
          if (msg.videoId !== videoRef.current) openVideo(msg.videoId);
          break;
        case 'TRANSCRIPT':
          if (msg.videoId !== videoRef.current) return;
          if (msg.cues?.length) {
            setTx({ status: 'ready', meta: msg.meta, cues: msg.cues });
            cacheTranscript(msg.videoId, { meta: msg.meta, cues: msg.cues });
          } else {
            setTx({ status: 'none', meta: msg.meta, reason: msg.reason, error: msg.error });
          }
          break;
        case 'TIME':
          setPlayer({ t: msg.t, duration: msg.duration, paused: msg.paused });
          break;
        case 'THEME':
          document.documentElement.dataset.theme = msg.dark ? 'dark' : 'light';
          break;
        case 'FOCUS_INPUT':
          setTab('chat');
          setTimeout(() => inputRef.current?.focus(), 30);
          break;
        case 'FOLLOWUP':
          setTab('chat');
          setInput(msg.text || '');
          setTimeout(() => inputRef.current?.focus(), 30);
          break;
        case 'ATTACH_FRAME':
          setTab('chat');
          attachRef.current?.();
          break;
        case 'FRAME': {
          const resolve = frameWaiters.current.get(msg.reqId);
          frameWaiters.current.delete(msg.reqId);
          resolve?.(msg);
          break;
        }
        case 'OPEN_MESSAGE':
          setTab('chat');
          setHighlight(msg.id);
          setTimeout(() => document.getElementById(`m-${msg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
          setTimeout(() => setHighlight(null), 1800);
          break;
      }
    });
    send('READY');
    return off;
  }, [openVideo]);

  // ---------- derived ----------
  const videoBlock = useMemo(
    () => (tx.status === 'ready' || tx.status === 'none' ? buildVideoBlock(tx.meta, tx.cues) : null),
    [tx],
  );
  const nowCue = useMemo(() => cueAt(tx.cues, player.t), [tx.cues, player.t]);

  // Progress-bar markers: one per question, colored by the verdict it got.
  useEffect(() => {
    const items = [];
    messages.forEach((m, i) => {
      if (m.role !== 'user') return;
      const reply = messages[i + 1];
      if (reply?.role === 'assistant' && !reply.streaming && !reply.error) {
        items.push({ id: m.id, t: m.t, q: m.text, verdict: reply.verdict?.kind || 'general' });
      }
    });
    send('MARKERS', { items });
  }, [messages]);

  // Auto-scroll while the newest answer streams in.
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // "Remind me": fire when playback crosses the moment the answer pointed to.
  useEffect(() => {
    const before = prevT.current;
    prevT.current = player.t;
    if (player.paused || player.t <= before) return;
    for (const m of messages) {
      if (!m.remind || m.reminded) continue;
      const at = parseStamp(m.verdict?.stamp);
      if (at == null || !(before < at && player.t >= at && player.t - at < 3)) continue;
      const question = messages[messages.findIndex((x) => x.id === m.id) - 1];
      send('TOAST', {
        id: m.id,
        kicker: 'This is the part you asked about',
        text: `“${question?.text || 'your question'}”`,
        actions: [
          { label: 'Got it' },
          { label: 'Still unclear', primary: true, action: 'followup', text: 'I just watched that part and it’s still not clear to me.' },
        ],
      });
      setMessages((ms) => {
        const next = ms.map((x) => (x.id === m.id ? { ...x, reminded: true } : x));
        saveChat(videoId, next);
        return next;
      });
    }
  }, [player.t, player.paused, messages, videoId]);

  // ---------- actions ----------
  const seek = useCallback((t, returnable = true) => send('SEEK', { t, returnable }), []);

  const toggleRemind = useCallback(
    (id) =>
      setMessages((ms) => {
        const next = ms.map((m) => (m.id === id ? { ...m, remind: !m.remind, reminded: false } : m));
        saveChat(videoRef.current, next);
        return next;
      }),
    [],
  );

  const maybePrewarm = () => {
    if (!settings?.apiKey || !videoBlock || busy) return;
    const key = `${videoId}|${settings.model}|${settings.effort}`;
    if (Date.now() - (warmed.current.get(key) || 0) < 4 * 60 * 1000) return;
    warmed.current.set(key, Date.now());
    prewarm({ settings, videoBlock }).catch(() => warmed.current.delete(key));
  };

  // Ask content.js for the current frame; resolves to { image, thumb, t } or { error }.
  const grabFrame = () =>
    new Promise((resolve) => {
      const reqId = uid();
      frameWaiters.current.set(reqId, resolve);
      send('CAPTURE_FRAME', { reqId });
      setTimeout(() => {
        if (frameWaiters.current.delete(reqId)) resolve({ error: 'Frame capture timed out.' });
      }, 2000);
    });

  const attachFrame = async () => {
    if (capturing) return null;
    setCapturing(true);
    const res = await grabFrame();
    setCapturing(false);
    if (res.error) {
      setFrameError(res.error);
      setTimeout(() => setFrameError(null), 3000);
      return null;
    }
    const f = { image: res.image, thumb: res.thumb, t: res.t };
    setFrame(f);
    inputRef.current?.focus();
    return f;
  };

  attachRef.current = attachFrame;

  const run = async (question, history, at, shot = null) => {
    const userMsg = {
      id: uid(),
      role: 'user',
      text: question,
      t: at.t,
      prompt: turnContent({ question, ...at, cues: tx.cues, frameAt: shot?.t }),
      image: shot?.image,
      thumb: shot?.thumb,
      frameAt: shot?.t,
    };
    const botId = uid();
    const bot = { id: botId, role: 'assistant', streaming: true, body: '', model: settings.model };
    const base = [...history, userMsg];
    setMessages([...base, bot]);
    setBusy(true);

    const patchBot = (patch) => setMessages((ms) => ms.map((m) => (m.id === botId ? { ...m, ...patch } : m)));
    let frame = 0;
    let latest = '';
    const flush = () => {
      frame = 0;
      const { verdict, text } = splitVerdict(latest);
      patchBot({ verdict, body: text });
    };

    const { stream, done } = ask({
      settings,
      videoBlock,
      history,
      prompt: userMsg.prompt,
      image: userMsg.image,
      onText: (raw) => {
        latest = raw;
        if (!frame) frame = requestAnimationFrame(flush);
      },
    });
    streamRef.current = stream;
    warmed.current.set(`${videoId}|${settings.model}|${settings.effort}`, Date.now());

    let final;
    try {
      const res = await done;
      const { verdict, text } = splitVerdict(res.raw);
      final = {
        streaming: false,
        raw: res.raw,
        verdict: verdict && (VERDICTS[verdict.kind] || verdict.kind === 'general') ? verdict : null,
        body: res.stopReason === 'refusal' && !text ? 'Sorry — I can’t help with that one.' : text,
        usage: res.usage,
        cost: costOf(res.usage, settings.model),
      };
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError) {
        const { verdict, text } = splitVerdict(latest);
        final = { streaming: false, stopped: true, raw: latest, verdict, body: text || '(stopped)' };
      } else {
        const { text, fix } = describeError(err);
        final = { streaming: false, error: text, fix };
      }
    } finally {
      if (frame) cancelAnimationFrame(frame);
      streamRef.current = null;
      setBusy(false);
    }

    const finished = [...base, { ...bot, ...final }];
    setMessages(finished);
    saveChat(videoId, finished);
    if (!final.error) {
      const entry = {
        id: userMsg.id,
        videoId,
        title: tx.meta?.title,
        channel: tx.meta?.channel,
        duration: player.duration || tx.meta?.duration,
        t: at.t,
        q: question,
        verdict: final.verdict?.kind || 'general',
        stamp: final.verdict?.stamp || null,
        model: settings.model,
        at: Date.now(),
      };
      logInsight(entry).then(() => loadInsights().then(setInsights));
    }
  };

  const submit = async (text = input, { withFrame = false } = {}) => {
    const question = text.trim();
    if (!question || busy || !videoBlock) return;
    if (!settings?.apiKey) {
      setTab('settings');
      return;
    }
    const shot = withFrame && !frame ? await attachFrame() : frame;
    if (withFrame && !shot) return;
    setInput('');
    setFrame(null);
    run(question, messages.filter((m) => !m.error), { t: player.t, duration: player.duration, paused: player.paused }, shot);
  };

  const retry = (botId) => {
    const i = messages.findIndex((m) => m.id === botId);
    const q = messages[i - 1];
    if (!q || busy) return;
    const history = messages.slice(0, i - 1).filter((m) => !m.error);
    run(q.text, history, { t: q.t, duration: player.duration, paused: true }, q.image ? { image: q.image, thumb: q.thumb, t: q.frameAt } : null);
  };

  const onType = (e) => {
    const v = e.target.value;
    if (!input && v && settings?.autoPause && !player.paused) {
      send('PAUSE');
      setPausedByMate(true);
    }
    setInput(v);
  };

  const resume = () => {
    send('PLAY');
    setPausedByMate(false);
  };
  useEffect(() => {
    if (!player.paused) setPausedByMate(false);
  }, [player.paused]);

  // ---------- render ----------
  if (!settings) return null;
  const needsKey = !settings.apiKey;
  const title = tx.meta?.title;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5.5v13l10-6.5z" fill="currentColor" /></svg>
          </span>
          <div className="brand-text">
            <span className="name">
              Super Video Mate
            </span>
            <span className="sub" title={title}>{title || (videoId ? 'Loading video…' : 'Open a video')}</span>
          </div>
        </div>
        <button className="icon-btn" onClick={() => send('CLOSE')} title="Hide (Alt+M)" aria-label="Hide sidebar">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
        </button>
      </header>

      <nav className="tabs" role="tablist">
        {[
          ['chat', 'Ask'],
          ['insights', 'Insights'],
          ['settings', 'Settings'],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
            {id === 'settings' && needsKey && <i className="dot-alert" />}
          </button>
        ))}
      </nav>

      {tab === 'settings' && (
        <main className="scroll">
          <Settings notice={needsKey ? 'Add your Anthropic API key to start asking questions.' : null} />
        </main>
      )}

      {tab === 'insights' && (
        <main className="scroll">
          <Insights insights={insights} videoId={videoId} meta={tx.meta} duration={player.duration} onSeek={seek} onCleared={() => setInsights([])} />
        </main>
      )}

      {tab === 'chat' && (
        <>
          <main className="scroll chat" ref={listRef}>
            {tx.status === 'loading' && <div className="banner"><span className="spinner" /> Reading the video’s captions…</div>}
            {tx.status === 'none' && (
              <div className="banner warn">
                {tx.reason === 'no-captions'
                  ? 'This video has no captions, so I only know its title and description.'
                  : 'I couldn’t load this video’s captions, so I only know its title and description.'}
                <button className="chip" onClick={() => { setTx({ status: 'loading' }); send('NEED_TRANSCRIPT', { videoId }); }}>Retry</button>
              </div>
            )}

            {messages.length === 0 && tx.status !== 'loading' && (
              <section className="welcome">
                <h1>I’m watching with you.</h1>
                <p>Ask anything, the moment it comes up. “What does <em>this</em> mean?” is enough — I know where you are.</p>
                <ul className="how">
                  <li style={{ '--vc': VERDICTS.later.color }}><b>Coming up</b> If the video explains it later, I’ll tell you when — and remind you.</li>
                  <li style={{ '--vc': VERDICTS.earlier.color }}><b>Covered earlier</b> I’ll point you to the exact moment to rewatch.</li>
                  <li style={{ '--vc': VERDICTS.assumed.color }}><b>Assumed</b> If the video skips background, I’ll fill the gap.</li>
                </ul>
              </section>
            )}

            {messages.map((m) => (
              <Message
                key={m.id}
                msg={m}
                highlight={highlight === m.id}
                showCost={settings.showCost}
                onSeek={seek}
                onToggleRemind={toggleRemind}
                onRetry={retry}
                onOpenSettings={() => setTab('settings')}
              />
            ))}
          </main>

          <footer className="composer">
            <div className="now">
<span className={`live ${player.paused ? 'paused' : ''}`} aria-hidden="true" />
              <span className="now-time">{fmt(player.t)}</span>
              <span className="now-text">{nowCue?.text || (tx.status === 'ready' ? '…' : '')}</span>
              {pausedByMate && player.paused && !busy && (
                <button className="chip" onClick={resume}>▶ Resume</button>
              )}
            </div>

            {!input && !busy && videoBlock && (
              <div className="chips">
                {CHIPS.map((c) => (
                  <button key={c.label} className="chip" onClick={() => submit(c.q, { withFrame: c.frame })}>{c.label}</button>
                ))}
              </div>
            )}

            {(frame || frameError) && (
              <div className="attachment">
                {frame ? (
                  <>
                    <img src={frame.thumb} alt={`Frame at ${fmt(frame.t)}`} />
                    <span className="attachment-label">Frame at {fmt(frame.t)}<span className="muted"> · Claude will see this</span></span>
                    <button className="ghost-btn" onClick={() => setFrame(null)} aria-label="Remove frame">✕</button>
                  </>
                ) : (
                  <span className="muted small">{frameError}</span>
                )}
              </div>
            )}

            <div className="input-row">
              <button
                className={`cam ${frame ? 'on' : ''}`}
                onClick={() => (frame ? setFrame(null) : attachFrame())}
                disabled={!videoBlock || capturing}
                title={frame ? 'Remove the attached frame' : 'Attach the current video frame (Alt+S)'}
                aria-label="Capture video frame"
                aria-pressed={!!frame}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
                  <circle cx="12" cy="12.5" r="3.4" />
                </svg>
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                placeholder={needsKey ? 'Add your API key in Settings first' : `Ask about ${fmt(player.t)}…`}
                onChange={onType}
                onFocus={maybePrewarm}
                onKeyDown={(e) => {
                  if (e.altKey && e.code === 'KeyS') {
                    e.preventDefault();
                    attachFrame();
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                disabled={!videoBlock}
              />
              {busy ? (
                <button className="send stop" onClick={() => streamRef.current?.abort()} aria-label="Stop">
                  <svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
                </button>
              ) : (
                <button className="send" onClick={() => submit()} disabled={!input.trim() || !videoBlock || capturing} aria-label="Send">
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

// Content script (isolated world). Owns everything that lives in YouTube's DOM:
// the sidebar frame, page layout, player sync, progress-bar markers, toasts and the
// "back to" pill. The sidebar iframe owns the conversation and talks to Claude.
(() => {
  const SIDEBAR_URL = chrome.runtime.getURL('sidebar.html');
  const FRAME_ORIGIN = new URL(SIDEBAR_URL).origin;
  const WIDTH = 400;

  let host = null;
  let frame = null;
  let frameReady = false;
  let open = true;
  let videoId = null;
  let markers = [];
  const transcriptCache = new Map();

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const video = () => $('#movie_player video') || $('video');
  const moviePlayer = () => $('#movie_player');
  const currentVideoId = () =>
    location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
  const fmt = (s) => {
    if (!Number.isFinite(s)) return 'live';
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function toFrame(msg) {
    if (frame?.contentWindow && frameReady) frame.contentWindow.postMessage({ svm: 1, ...msg }, FRAME_ORIGIN);
  }

  // ---------- sidebar shell ----------
  function ensureShell() {
    if (host) return;
    host = el('div');
    host.id = 'svm-host';
    frame = el('iframe');
    frame.id = 'svm-frame';
    frame.src = SIDEBAR_URL;
    frame.allow = 'clipboard-write';
    host.appendChild(frame);

    const launcher = el('button', 'svm-launcher');
    launcher.id = 'svm-launcher';
    launcher.title = 'Open Super Video Mate (Alt+M)';
    launcher.innerHTML = '<span class="svm-launcher-dot"></span><span>Ask Mate</span>';
    launcher.addEventListener('click', () => setOpen(true, { focus: true }));

    document.documentElement.append(host, launcher);
    document.documentElement.style.setProperty('--svm-w', WIDTH + 'px');
  }

  function setOpen(next, { focus = false } = {}) {
    open = next;
    chrome.storage.local.set({ 'svm.open': open });
    applyLayout();
    if (open && focus) {
      frame?.focus();
      toFrame({ type: 'FOCUS_INPUT' });
    }
  }

  function applyLayout() {
    const onWatch = !!currentVideoId();
    const root = document.documentElement;
    root.classList.toggle('svm-active', onWatch);
    root.classList.toggle('svm-open', onWatch && open);
    // The player only re-measures itself on window resize.
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  // ---------- theme ----------
  const isDark = () => document.documentElement.hasAttribute('dark');
  new MutationObserver(() => toFrame({ type: 'THEME', dark: isDark() })).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['dark'],
  });

  // ---------- player sync ----------
  let boundVideo = null;
  let lastSent = 0;
  function sendTime(force) {
    const v = video();
    if (!v) return;
    const now = performance.now();
    if (!force && now - lastSent < 200) return;
    lastSent = now;
    toFrame({ type: 'TIME', t: v.currentTime, duration: v.duration || 0, paused: v.paused });
  }
  function bindVideo() {
    const v = video();
    if (!v || v === boundVideo) return;
    boundVideo = v;
    v.addEventListener('timeupdate', () => sendTime(false));
    for (const ev of ['play', 'pause', 'seeked', 'loadedmetadata']) v.addEventListener(ev, () => sendTime(true));
    v.addEventListener('durationchange', renderMarkers);
  }

  // ---------- transcript (via MAIN-world bridge) ----------
  let reqSeq = 0;
  const pending = new Map();
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'svm-bridge') return;
    if (e.data.type === 'TRANSCRIPT') {
      const resolve = pending.get(e.data.reqId);
      pending.delete(e.data.reqId);
      resolve?.(e.data);
    }
  });
  function fetchTranscript(id) {
    if (transcriptCache.has(id)) return transcriptCache.get(id);
    const reqId = ++reqSeq;
    const p = new Promise((resolve) => {
      pending.set(reqId, resolve);
      window.postMessage({ source: 'svm-content', type: 'GET_TRANSCRIPT', videoId: id, reqId }, '*');
    }).then(({ meta, cues, reason, error }) => {
      const result = { videoId: id, meta, cues, reason, error };
      if (!cues) transcriptCache.delete(id); // allow a retry later
      return result;
    });
    transcriptCache.set(id, p);
    return p;
  }

  // ---------- progress-bar markers ----------
  function renderMarkers() {
    const bar = $('#movie_player .ytp-progress-bar');
    const v = video();
    $('#svm-markers')?.remove();
    if (!bar || !v?.duration || !markers.length) return;
    const layer = el('div');
    layer.id = 'svm-markers';
    for (const m of markers) {
      const dot = el('button', `svm-marker svm-v-${m.verdict || 'general'}`);
      dot.style.left = `${Math.min(100, (m.t / v.duration) * 100)}%`;
      dot.title = `${fmt(m.t)} · ${m.q}`;
      dot.addEventListener('mousedown', (e) => e.stopPropagation());
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(true);
        toFrame({ type: 'OPEN_MESSAGE', id: m.id });
      });
      layer.appendChild(dot);
    }
    bar.appendChild(layer);
  }

  // ---------- overlays inside the player (visible in fullscreen too) ----------
  function overlayRoot() {
    const mp = moviePlayer();
    if (!mp) return null;
    let root = $('#svm-overlay', mp);
    if (!root) {
      root = el('div');
      root.id = 'svm-overlay';
      mp.appendChild(root);
    }
    return root;
  }

  function showToast({ id, kicker, text, actions = [] }) {
    const root = overlayRoot();
    if (!root) return;
    $(`[data-toast="${id}"]`, root)?.remove();
    const card = el('div', 'svm-toast');
    card.dataset.toast = id;
    card.append(el('div', 'svm-toast-kicker', kicker), el('div', 'svm-toast-text', text));
    const row = el('div', 'svm-toast-actions');
    const close = () => {
      card.classList.add('svm-out');
      setTimeout(() => card.remove(), 250);
    };
    for (const a of actions) {
      const b = el('button', a.primary ? 'svm-btn svm-btn-primary' : 'svm-btn', a.label);
      b.addEventListener('click', () => {
        close();
        if (a.action === 'followup') {
          setOpen(true, { focus: true });
          toFrame({ type: 'FOLLOWUP', id, text: a.text });
        }
      });
      row.appendChild(b);
    }
    card.appendChild(row);
    root.appendChild(card);
    setTimeout(close, 15000);
  }

  let returnPill = null;
  function seek(t, returnable) {
    const v = video();
    if (!v) return;
    const from = v.currentTime;
    v.currentTime = Math.max(0, t);
    if (v.paused) v.play().catch(() => {});
    returnPill?.remove();
    returnPill = null;
    if (!returnable || Math.abs(from - t) < 5) return;
    const root = overlayRoot();
    if (!root) return;
    returnPill = el('button', 'svm-return', `↩ Back to ${fmt(from)}`);
    returnPill.addEventListener('click', (e) => {
      e.stopPropagation();
      v.currentTime = from;
      returnPill.remove();
      returnPill = null;
    });
    root.appendChild(returnPill);
    const pill = returnPill;
    setTimeout(() => pill.isConnected && pill.remove(), 60000);
  }

  // ---------- frame capture ----------
  // Draws the current frame of the <video> itself (no YouTube UI on top). YouTube
  // streams through MediaSource, so the canvas stays readable. Frames are capped at
  // 1280px wide — plenty for slides and code, and about 1.2k image tokens.
  function captureFrame() {
    const v = video();
    if (!v || !v.videoWidth) return { error: 'No video frame to capture yet.' };
    const draw = (maxW, quality) => {
      const scale = Math.min(1, maxW / v.videoWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      return { dataUrl: c.toDataURL('image/jpeg', quality), w: c.width, h: c.height };
    };
    try {
      const full = draw(1280, 0.85);
      const thumb = draw(320, 0.7);
      return { t: v.currentTime, image: full.dataUrl, thumb: thumb.dataUrl, w: full.w, h: full.h };
    } catch {
      return { error: 'This video blocks frame capture.' };
    }
  }

  // ---------- messages from the sidebar ----------
  window.addEventListener('message', async (e) => {
    if (e.origin !== FRAME_ORIGIN || e.source !== frame?.contentWindow || !e.data?.svm) return;
    const msg = e.data;
    switch (msg.type) {
      case 'READY':
        frameReady = true;
        toFrame({ type: 'THEME', dark: isDark() });
        announceVideo();
        break;
      case 'NEED_TRANSCRIPT': {
        const result = await fetchTranscript(msg.videoId);
        if (msg.videoId === videoId) toFrame({ type: 'TRANSCRIPT', ...result });
        break;
      }
      case 'SEEK':
        seek(msg.t, msg.returnable);
        break;
      case 'PAUSE':
        video()?.pause();
        break;
      case 'PLAY':
        video()?.play().catch(() => {});
        break;
      case 'CLOSE':
        setOpen(false);
        break;
      case 'MARKERS':
        markers = msg.items || [];
        renderMarkers();
        break;
      case 'TOAST':
        showToast(msg);
        break;
      case 'CAPTURE_FRAME':
        toFrame({ type: 'FRAME', reqId: msg.reqId, ...captureFrame() });
        break;
    }
  });

  // ---------- navigation ----------
  function announceVideo() {
    if (!frameReady) return;
    toFrame({ type: 'VIDEO', videoId });
    sendTime(true);
  }

  function onNavigate() {
    const id = currentVideoId();
    applyLayout();
    if (!id) return;
    ensureShell();
    bindVideo();
    if (id !== videoId) {
      videoId = id;
      markers = [];
      $('#svm-markers')?.remove();
      returnPill?.remove();
      announceVideo();
    }
  }

  document.addEventListener('yt-navigate-finish', onNavigate);
  document.addEventListener('yt-page-data-updated', bindVideo);
  window.addEventListener('popstate', onNavigate);
  // The player bar is re-rendered by YouTube occasionally; keep markers attached.
  setInterval(() => {
    bindVideo();
    if (markers.length && !$('#svm-markers')) renderMarkers();
  }, 2000);

  // ---------- keyboard + toolbar ----------
  window.addEventListener(
    'keydown',
    (e) => {
      if (!currentVideoId()) return;
      if (e.altKey && e.code === 'KeyQ') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true, { focus: true });
      }
      if (e.altKey && e.code === 'KeyS') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true, { focus: true });
        toFrame({ type: 'ATTACH_FRAME' });
      }
    },
    true,
  );
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'TOGGLE' && currentVideoId()) setOpen(!open, { focus: !open });
  });

  chrome.storage.local.get('svm.open', (r) => {
    open = r['svm.open'] !== false;
    onNavigate();
  });
})();

// Runs in YouTube's MAIN world (see manifest). It is the only script that can see the
// player API and the page's own network calls, so it owns transcript extraction.
// Talks to content.js through window.postMessage, tagged with SOURCE.
(() => {
  const SOURCE = 'svm-bridge';
  const captured = new Map(); // videoId -> raw timedtext body the player itself fetched

  // --- Capture the player's own caption requests --------------------------------
  // YouTube increasingly rejects bare timedtext URLs (they need a proof-of-origin
  // token the player adds). When that happens we let the player fetch captions and
  // keep a copy of the response.
  const isTimedText = (url) => typeof url === 'string' && url.includes('/api/timedtext');
  const videoIdOf = (url) => {
    try { return new URL(url, location.origin).searchParams.get('v'); } catch { return null; }
  };
  const remember = (url, body) => {
    const v = videoIdOf(url);
    if (v && body && body.length > 20) captured.set(v, body);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const p = origFetch.apply(this, arguments);
    if (isTimedText(url)) {
      p.then((res) => res.clone().text()).then((body) => remember(url, body)).catch(() => {});
    }
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isTimedText(String(url))) {
      this.addEventListener('load', () => {
        try { remember(String(url), this.responseText); } catch {}
      });
    }
    return origOpen.apply(this, arguments);
  };

  // --- Parsing --------------------------------------------------------------------
  function parseTimedText(body) {
    body = body.trim();
    if (body.startsWith('{')) {
      const data = JSON.parse(body);
      return (data.events || [])
        .filter((e) => e.segs)
        .map((e) => ({
          start: e.tStartMs / 1000,
          end: (e.tStartMs + (e.dDurationMs || 0)) / 1000,
          text: e.segs.map((s) => s.utf8).join('').replace(/\s+/g, ' ').trim(),
        }))
        .filter((c) => c.text);
    }
    const doc = new DOMParser().parseFromString(body, 'text/xml');
    // srv3: <p t="ms" d="ms">…</p>   legacy: <text start="s" dur="s">…</text>
    const ps = [...doc.querySelectorAll('p[t]')];
    if (ps.length) {
      return ps
        .map((p) => {
          const t = +p.getAttribute('t') / 1000;
          return { start: t, end: t + (+p.getAttribute('d') || 0) / 1000, text: p.textContent.replace(/\s+/g, ' ').trim() };
        })
        .filter((c) => c.text);
    }
    const decoder = document.createElement('textarea');
    return [...doc.querySelectorAll('text')]
      .map((el) => {
        const start = +el.getAttribute('start');
        decoder.innerHTML = el.textContent;
        return { start, end: start + (+el.getAttribute('dur') || 0), text: decoder.value.replace(/\s+/g, ' ').trim() };
      })
      .filter((c) => c.text);
  }

  // --- Player access ---------------------------------------------------------------
  const player = () => document.getElementById('movie_player');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function playerResponseFor(videoId) {
    for (let i = 0; i < 40; i++) {
      const pr = player()?.getPlayerResponse?.();
      if (pr?.videoDetails?.videoId === videoId) return pr;
      const initial = window.ytInitialPlayerResponse;
      if (initial?.videoDetails?.videoId === videoId) return initial;
      await sleep(250);
    }
    return null;
  }

  function pickTrack(tracks) {
    const asr = tracks.find((t) => t.kind === 'asr');
    const spoken = asr?.languageCode;
    return (
      tracks.find((t) => t.kind !== 'asr' && spoken && t.languageCode === spoken) ||
      tracks.find((t) => t.kind !== 'asr' && t.languageCode?.startsWith('en')) ||
      asr ||
      tracks[0]
    );
  }

  async function viaPlayerCapture(videoId, track) {
    if (captured.has(videoId)) return captured.get(videoId);
    const p = player();
    if (!p) return null;
    let wasOn = false;
    try {
      wasOn = !!p.isSubtitlesOn?.();
      p.loadModule?.('captions');
      p.setOption?.('captions', 'track', { languageCode: track.languageCode });
      if (!wasOn) p.toggleSubtitlesOn?.();
    } catch {}
    for (let i = 0; i < 30 && !captured.has(videoId); i++) await sleep(200);
    try {
      if (!wasOn) p.toggleSubtitles?.();
    } catch {}
    return captured.get(videoId) || null;
  }

  async function getTranscript(videoId) {
    const pr = await playerResponseFor(videoId);
    if (!pr) return { error: 'Could not read the YouTube player.' };
    const d = pr.videoDetails || {};
    const meta = {
      videoId,
      title: d.title || '',
      channel: d.author || '',
      duration: +d.lengthSeconds || 0,
      description: (d.shortDescription || '').slice(0, 2000),
      isLive: !!d.isLiveContent && !+d.lengthSeconds,
    };
    const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!tracks.length) return { meta, cues: null, reason: 'no-captions' };

    const track = pickTrack(tracks);
    let body = '';
    try {
      const url = new URL(track.baseUrl, location.origin);
      url.searchParams.set('fmt', 'json3');
      body = await (await origFetch(url.toString(), { credentials: 'include' })).text();
    } catch {}
    if (!body || body.length < 20) body = (await viaPlayerCapture(videoId, track)) || '';

    let cues = [];
    try { cues = body ? parseTimedText(body) : []; } catch {}
    if (!cues.length) return { meta, cues: null, reason: 'blocked' };
    return {
      meta: { ...meta, language: track.languageCode, autoCaptions: track.kind === 'asr' },
      cues,
    };
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.source !== 'svm-content') return;
    if (e.data.type === 'GET_TRANSCRIPT') {
      let result;
      try { result = await getTranscript(e.data.videoId); } catch (err) { result = { error: String(err?.message || err) }; }
      window.postMessage({ source: SOURCE, type: 'TRANSCRIPT', reqId: e.data.reqId, videoId: e.data.videoId, ...result }, '*');
    }
  });
})();

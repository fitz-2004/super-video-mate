// Local persistence: per-video chat threads, a transcript cache, and the question
// log that powers Insights (the seed of creator feedback).

const CHAT_PREFIX = 'svm.chat.';
const TRANSCRIPT_PREFIX = 'svm.tx.';
const INDEX_KEY = 'svm.recent';
const INSIGHTS_KEY = 'svm.insights';
const MAX_VIDEOS = 40;
const MAX_INSIGHTS = 3000;

async function touch(videoId) {
  const r = await chrome.storage.local.get(INDEX_KEY);
  const recent = [videoId, ...(r[INDEX_KEY] || []).filter((v) => v !== videoId)];
  const evicted = recent.splice(MAX_VIDEOS);
  await chrome.storage.local.set({ [INDEX_KEY]: recent });
  if (evicted.length) {
    await chrome.storage.local.remove(evicted.flatMap((v) => [CHAT_PREFIX + v, TRANSCRIPT_PREFIX + v]));
  }
}

export async function loadChat(videoId) {
  const r = await chrome.storage.local.get(CHAT_PREFIX + videoId);
  return r[CHAT_PREFIX + videoId] || [];
}

export async function saveChat(videoId, messages) {
  // Never persist half-streamed messages. Full-size frames stay in memory only;
  // the small thumbnail is kept so the thread still shows what was asked about.
  const clean = messages.filter((m) => !m.streaming).map(({ streaming, image, ...m }) => m);
  await chrome.storage.local.set({ [CHAT_PREFIX + videoId]: clean });
  await touch(videoId);
}

export async function loadCachedTranscript(videoId) {
  const r = await chrome.storage.local.get(TRANSCRIPT_PREFIX + videoId);
  return r[TRANSCRIPT_PREFIX + videoId] || null;
}

export async function cacheTranscript(videoId, data) {
  await chrome.storage.local.set({ [TRANSCRIPT_PREFIX + videoId]: { ...data, savedAt: Date.now() } });
  await touch(videoId);
}

export async function loadInsights() {
  const r = await chrome.storage.local.get(INSIGHTS_KEY);
  return r[INSIGHTS_KEY] || [];
}

export async function logInsight(entry) {
  const all = await loadInsights();
  all.push(entry);
  await chrome.storage.local.set({ [INSIGHTS_KEY]: all.slice(-MAX_INSIGHTS) });
}

export async function clearInsights() {
  await chrome.storage.local.remove(INSIGHTS_KEY);
}

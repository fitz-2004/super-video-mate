import Anthropic from '@anthropic-ai/sdk';
import { fmt } from './time.js';
import { compactLines, transcriptText, windowText } from './transcript.js';
import { modelInfo } from './settings.js';

// One streaming call per question. The transcript sits in a cached system block, so
// after the first question on a video, follow-ups read it at a fraction of the price.

const INSTRUCTIONS = `You are Super Video Mate, a tutor sitting beside someone while they watch a YouTube video. You watch in sync with them: every message tells you exactly where they are in the video and what was just said.

## Understanding the question
Viewers ask short, context-dependent questions ("what does this mean?", "why did he say that here?"). Resolve "this", "here", "that", "he/she" against the captions around their current position first, then against what they have already watched. Never ask them to restate context you can see.

## Video first
People watch to learn from the creator's own explanation and visuals. Before answering, decide where the video itself deals with the question, using the full transcript (you can see parts the viewer has not reached yet):

- now: it is being explained right at this moment, or within the next ~30 seconds, or was just explained in the last minute. Anchor your answer to what is on screen; if the explanation is a few seconds away, tell them to keep watching.
- later: the video explains it properly further on. Don't spoil it. Say it's coming at [mm:ss], reassure them it's fine not to get it yet (the creator is setting something up), and suggest they keep watching. Offer at most one sentence of intuition, and say you're here if it's still unclear when they get there. If they explicitly ask for the answer now, give it, but still point to the timestamp.
- earlier: it was covered before their current position. Point to [mm:ss], recap in a sentence or two what was said there, and suggest rewatching that part.
- assumed: the creator assumes background knowledge the video never explains. Fill in exactly the missing background, briefly, and connect it back to the video.
- beyond: the question goes outside what the video covers. Answer briefly and say the video doesn't go into it.
- general: summaries, quizzes, chit-chat, or anything that isn't about locating an explanation.

## Output format
Your first line must be exactly:
@verdict <now|later|earlier|assumed|beyond|general> <timestamp or ->
for example "@verdict later 12:30" or "@verdict assumed -". Use the timestamp where the video addresses the question. Then a blank line, then your reply.

## Style
- Keep it short: usually 2–5 sentences, under 120 words, unless they ask for depth or a quiz/summary needs more. Don't reproduce explanations the video gives better.
- Cite moments as [mm:ss] (or [h:mm:ss]); they become clickable. Only cite timestamps that appear in the transcript.
- Plain text, **bold** for the key term at most. No headings, no long bullet lists.
- Reply in the language the viewer writes in, even if the video is in another language.
- Warm, encouraging, concise — a good TA, not a lecture.
- If there is no transcript, say so honestly once and rely on the title and description.

## Frames
Sometimes the viewer attaches the frame that is on screen. Read it carefully: slides, diagrams, equations, code, charts and labels often carry what the captions don't. Refer to what's visible concretely ("the red curve", "line 3 of the code"), and treat the frame as the most direct meaning of "this" or "here".`;

export function buildVideoBlock(meta, cues) {
  const head = [
    `Title: ${meta?.title || 'Unknown'}`,
    `Channel: ${meta?.channel || 'Unknown'}`,
    `Duration: ${fmt(meta?.duration || 0)}`,
    meta?.autoCaptions ? 'Transcript source: auto-generated captions (may contain recognition errors).' : null,
    meta?.description ? `Description:\n${meta.description}` : null,
  ].filter(Boolean);
  const body = cues?.length
    ? `<transcript>\n${transcriptText(compactLines(cues))}\n</transcript>`
    : '<transcript unavailable="true">No captions could be loaded for this video.</transcript>';
  return `<video>\n${head.join('\n')}\n${body}\n</video>`;
}

function systemBlocks(videoBlock) {
  return [
    { type: 'text', text: INSTRUCTIONS },
    { type: 'text', text: videoBlock, cache_control: { type: 'ephemeral' } },
  ];
}

export function turnContent({ question, t, duration, paused, cues, frameAt }) {
  const onScreen = windowText(cues, t);
  return [
    `<position>${fmt(t)}${Number.isFinite(duration) && duration > 0 ? ` of ${fmt(duration)}` : ' (live stream)'}${paused ? ' (paused)' : ''}</position>`,
    onScreen ? `<just_said>${onScreen}</just_said>` : null,
    frameAt != null ? `<frame>The image is the video frame on screen at ${fmt(frameAt)}.</frame>` : null,
    `<question>${question}</question>`,
  ]
    .filter(Boolean)
    .join('\n');
}

const MAX_HISTORY_TURNS = 8;

function historyMessages(history) {
  const done = history.filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.error && !m.streaming);
  // Keep complete user/assistant pairs only.
  const pairs = [];
  for (let i = 0; i < done.length - 1; i++) {
    if (done[i].role === 'user' && done[i + 1].role === 'assistant') {
      pairs.push(done[i], done[i + 1]);
      i++;
    }
  }
  return pairs.slice(-MAX_HISTORY_TURNS * 2).map((m) => ({
    role: m.role,
    content: m.role === 'user' ? userContent(m.prompt, m.image) : m.raw,
  }));
}

// Frames go before the text, as the API recommends. After a reload only the
// thumbnail survives, so older frames are dropped rather than sent blurry.
export function userContent(prompt, image) {
  if (!image) return prompt;
  return [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.split(',')[1] } },
    { type: 'text', text: prompt },
  ];
}

function client(apiKey) {
  // The key never leaves this extension page; YouTube's page cannot read it.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function requestParams({ settings, videoBlock, messages, maxTokens }) {
  const model = modelInfo(settings.model);
  const params = {
    model: model.id,
    max_tokens: maxTokens,
    system: systemBlocks(videoBlock),
    messages,
    output_config: { effort: settings.effort },
  };
  if (model.fallbacks) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  return params;
}

// Parses "@verdict later 12:30\n\n..." from the head of a (possibly partial) reply.
export function splitVerdict(raw) {
  const m = raw.match(/^\s*@verdict\s+(\w+)\s+(\S+)[^\n]*(?:\n|$)/);
  if (!m) {
    // Still waiting for the first line to finish streaming.
    if (/^\s*@/.test(raw) && !raw.includes('\n')) return { pending: true, verdict: null, text: '' };
    return { verdict: null, text: raw.trim() };
  }
  const kind = m[1].toLowerCase();
  const stamp = m[2] === '-' ? null : m[2];
  return { verdict: { kind, stamp }, text: raw.slice(m[0].length).trim() };
}

/**
 * Streams one answer. Returns { stream, done } — call stream.abort() to stop.
 * onText receives the full raw text so far.
 */
export function ask({ settings, videoBlock, history, prompt, image, onText }) {
  const params = requestParams({
    settings,
    videoBlock,
    messages: [...historyMessages(history), { role: 'user', content: userContent(prompt, image) }],
    maxTokens: 16000,
  });
  // Cache the growing conversation as well as the video block.
  params.cache_control = { type: 'ephemeral' };

  const stream = client(settings.apiKey).beta.messages.stream(params);
  let raw = '';
  stream.on('text', (delta) => {
    raw += delta;
    onText(raw);
  });
  const done = stream.finalMessage().then((message) => ({
    raw,
    usage: message.usage,
    model: message.model,
    stopReason: message.stop_reason,
  }));
  return { stream, done };
}

/**
 * Writes the video block into the prompt cache before the first question, so the
 * first answer starts as fast as follow-ups. Fired when the viewer focuses the box.
 */
export async function prewarm({ settings, videoBlock }) {
  const params = requestParams({
    settings,
    videoBlock,
    messages: [{ role: 'user', content: '.' }],
    maxTokens: 0,
  });
  await client(settings.apiKey).beta.messages.create(params);
}

export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return { text: 'Your Anthropic API key was rejected. Check it in Settings.', fix: 'settings' };
  if (err instanceof Anthropic.PermissionDeniedError) return { text: 'This API key does not have access to the selected model.', fix: 'settings' };
  if (err instanceof Anthropic.NotFoundError) return { text: 'That model is not available to this key. Try another in Settings.', fix: 'settings' };
  if (err instanceof Anthropic.RateLimitError) return { text: 'Rate limited by the API. Give it a few seconds and try again.' };
  if (err instanceof Anthropic.APIConnectionError) return { text: 'Could not reach the Anthropic API. Check your connection.' };
  if (err instanceof Anthropic.APIError) return { text: `API error${err.status ? ` (${err.status})` : ''}: ${err.message}` };
  return { text: String(err?.message || err) };
}

export { Anthropic };

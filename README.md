# Super Video Mate

A Chrome extension that sits beside YouTube videos like a TA who's watching with you. It always knows where you are in the video, so short questions like "what does *this* mean?" work. It also points you back to the video before explaining anything itself:

| Verdict | What the Mate does |
|---|---|
| **Explained later** | Tells you when it's coming, says not to worry yet, and can **remind you** when playback gets there |
| **Covered earlier** | Points to the exact moment, with **Rewatch** and a "↩ Back to" pill on the player |
| **Being explained now** | Answers in terms of what's on screen |
| **Assumed** | Fills in background the creator assumes you already know |
| **Beyond** | Answers briefly and notes that the video doesn't cover it |

**Frame capture:** click 📷 (or press **Alt+S**) to attach the frame on screen, so Claude can read slides, diagrams, equations and code. The captions alone can't show those. **What's on screen?** captures the frame and asks in one click.

Every question is logged with its timestamp and verdict. The **Insights** tab shows them on the video's timeline. This is the start of the creator-feedback side: it shows *why* viewers rewatch a section.

## Setup

```bash
npm install
npm run build        # or: npm run watch
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `dist/`.
2. The settings page opens. Paste an Anthropic API key from https://console.anthropic.com/settings/keys.
3. Open any YouTube video.

Shortcuts: **Alt+Q** asks a question (focuses the box), **Alt+S** attaches the current frame, and **Alt+M** shows or hides the sidebar. The toolbar button also toggles the sidebar.

## Releasing

```bash
npm run package            # build and zip the current version
npm run package -- patch   # bump the version (patch / minor / major), then build and zip
```

The zip lands in `store-assets/super-video-mate-v<version>.zip`, ready to upload in the Chrome Web Store Developer Dashboard. The version is kept in sync in `manifest.json` and `package.json`. Store copy and form answers are in `store-assets/STORE_LISTING.md`.

## How it works

```
youtube.com tab
├── page-bridge.js  (MAIN world)  reads the player's caption tracks; falls back to
│                                  capturing the player's own timedtext request
├── content.js      (isolated)    sidebar shell, page layout, player sync, progress-bar
│                                  markers, reminder toasts, "back to" pill
└── sidebar.html    (iframe, extension origin)
      React app → Claude Messages API (streaming, @anthropic-ai/sdk)
```

- **One call per question.** The old version made an OpenAI embedding call, then a GPT judging call, then a Claude call, one after another. Now a single streamed Claude response starts with a `@verdict …` line that the UI turns into the verdict card.
- **Prompt caching.** The instructions and full transcript form a cached system prefix, and the conversation is cached too. Follow-up questions on the same video read the transcript at the cache price instead of paying full input price. When you click into the question box, a `max_tokens: 0` request warms the cache, so the first answer comes back as fast as later ones.
- **Compact transcript.** Captions are merged into roughly 12-second lines, which cuts timestamp tokens. Only the last 8 turns of the conversation are sent.
- **No server.** No Python server, native host, or Vercel backend. The API key is stored in `chrome.storage.local` and used only from the extension's own page, which YouTube can't read.
- **Models.** Opus 5.5 is the default, with Sonnet 5.5 and Haiku 5.5 available in Settings. The answer style setting (Quick / Thoughtful / Deep) maps to effort `low` / `medium` / `high`. Opus and Sonnet requests use server-side refusal fallbacks (`fallbacks: "default"`).

## Project layout

```
manifest.json
src/extension/   content.js, page-bridge.js, content.css, background.js (shipped as-is)
src/sidebar/     the sidebar React app
src/options/     settings page
src/shared/      Claude client + prompt (mate.js), settings, storage, transcript helpers, theme
```

## Known limits

- Insights are stored only in the browser for now. Collecting questions from all viewers for creators needs a backend.
- Videos with no captions fall back to the title and description.
- YouTube changes its player internals from time to time. If transcripts stop loading, `src/extension/page-bridge.js` is the file to update.

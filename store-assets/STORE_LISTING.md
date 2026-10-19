# Chrome Web Store submission: copy and answers

Paste these into the matching fields in the Chrome Web Store Developer Dashboard.

---

## Store listing tab

**Name:** Super Video Mate

**Summary (max 132 characters):**
An AI tutor that watches YouTube with you, knows where you are, and points you back to the video before explaining.

**Category:** Education

**Language:** English

**Description:**

Ask questions the moment something in a video confuses you. Super Video Mate always knows where you are in the video, so "what does this mean?" is enough.

It treats the video as the best teacher and answers with that in mind:

• Explained later: it tells you the video gets there at 6:00 and that it's fine not to get it yet. Tap "Remind me" and it checks in when you reach that part.
• Covered earlier: it points to the exact moment to rewatch, with a one-click way back to where you were.
• Assumed knowledge: it fills in the background the creator skipped.
• On screen: attach the current frame so it can read slides, diagrams, equations and code.

Also included:
• Clickable timestamps in every answer
• Your questions marked on the video's progress bar
• An Insights view showing where in a video you got stuck
• Light and dark themes that follow YouTube

Requires your own Anthropic API key (console.anthropic.com). Your questions go directly from your browser to Anthropic. The extension has no server and collects no data.

**Screenshots (1280×800 JPEG), upload in this order** from `store-assets/screenshots/`:
1. `1-frame-question-light.jpg` (asking about a slide with the frame attached)
2. `2-remind-me.jpg` (explained later + reminder toast, YouTube dark theme)
3. `3-insights.jpg` (Insights: per-video question timeline and all videos)
4. `5-settings.jpg`

Put raw Mac screenshots in `store-assets/raw/` named `<n>-<name>.png`, then run `scripts/screenshots.sh`.

**Small promo tile (440×280):** `store-assets/promo/small-tile-440x280.jpg` (source: `small-tile.svg`)

**Icon:** `icons/icon128.png` from the zip

---

## Privacy tab

**Single purpose description:**
Helps people understand YouTube videos by answering their questions about the part of the video they are currently watching.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings, API key, per-video chat history, cached captions and question log locally on the device. |
| Host: `https://www.youtube.com/*` | Shows the tutor sidebar on YouTube video pages, reads the current video's captions and playback position, and lets the user jump to timestamps. |
| Host: `https://api.anthropic.com/*` | Sends the user's question, with the video's captions and an optional user-captured frame, to the Anthropic API using the user's own API key, and receives the answer. |

**Remote code:** No, I am not using remote code. (All JavaScript is packaged in the extension; the extension only fetches data from YouTube and the Anthropic API.)

**Data usage — tick these boxes:**
- ☑ **Website content** (video captions, title, description, and an optional frame image, sent to Anthropic to answer questions)
- ☑ **User activity** (the current playback position, sent with each question)
- ☑ **Authentication information** (the user's own Anthropic API key, stored locally and sent only to Anthropic)

Leave everything else unchecked (personally identifiable info, health, financial, location, web history, personal communications).

**Certifications — tick all three:**
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://fitz-2004.github.io/super-video-mate/privacy/ (source: `docs/privacy.md`, published by GitHub Pages from `/docs` on `main`)

---

## Distribution tab

**Visibility:** Public. (Use Unlisted for a link-only beta; switching later needs no new review.)
**Regions:** All regions.
**Pricing:** Free.

---

## Note for reviewers (optional field, if asked)

`page-bridge.js` runs in the page's main world to read the YouTube player's caption track list. If YouTube blocks the direct caption request, it keeps a copy of the player's own `/api/timedtext` response. It does not modify page content or send data anywhere other than the extension itself.

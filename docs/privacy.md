---
title: Privacy Policy
permalink: /privacy/
---

# Super Video Mate: Privacy Policy

_Last updated: October 19, 2026_

Super Video Mate is a Chrome extension that answers your questions about the YouTube video you are watching. This policy explains what data it uses and where that data goes.

## What the extension does not do

- It has no server of its own. We never receive, see or store your questions, answers or viewing activity.
- It does not use analytics, ads or trackers.
- It does not sell or share your data with anyone.

## Data stored on your device

These items are saved in your browser's extension storage (`chrome.storage.local`). They stay on your computer and are deleted when you remove the extension.

- **Your Anthropic API key**, which you enter in Settings.
- **Your settings**: the model, answer style, and the auto-pause and cost display toggles.
- **Your chat history for each video**, for your 40 most recently used videos. If you attached a video frame, only a small thumbnail of it is kept.
- **Cached video captions**, so videos you reopen load instantly.
- **Your question log** (question text, video title, timestamp and answer type), which powers the Insights tab. You can export it as a file or delete it in Insights → Clear.

## Data sent to Anthropic

When you ask a question, the extension sends a request **directly from your browser to Anthropic's API** (api.anthropic.com) using **your own API key**. The request contains:

- the title, channel name, description and captions of the video you are watching
- your current position in the video
- your question and your recent questions and answers about that video
- a still image of the video frame, **only when you choose to attach one**

Anthropic processes this data under its own terms and privacy policy: https://www.anthropic.com/legal/privacy. Your use of the API is governed by the agreement for your Anthropic account.

## Data read from YouTube

The extension reads the caption track and basic video details of the YouTube page you are on so it can answer questions about the video. It does not read your YouTube account, history, subscriptions or comments.

## Contact

Questions about this policy: [fitzgeraldsh24@gmail.com](mailto:fitzgeraldsh24@gmail.com)

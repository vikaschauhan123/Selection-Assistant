# Selection Assistant

A Manifest V3 Chrome extension that adds a floating toolbar to any webpage when you select text — read it aloud, rephrase it with AI, translate it, or look up its definition.

## Features

### Toolbar actions
- **🔊 Read Aloud** — speaks the selection using the browser's built-in Web Speech API, using a preference list of softer-sounding system voices when available. No API key required. Includes a speed control (⏱, cycling 0.75x → 1x → 1.25x → 1.5x → 2x, restarting playback live if changed mid-speech) and click-to-stop.
- **📋 Copy** — copies the raw selected text directly to the clipboard, independent of Rephrase/Translate.
- **✨ Rephrase** — sends the selection to OpenAI or Anthropic and shows a rewritten version. Requires your own API key.
- **🌐 Translate** — translates the selection via Google Translate's free endpoint into a language you choose from a searchable list of 50+ languages, including many Indian regional languages (Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Punjabi, Urdu, Kannada, Malayalam, Odia, Assamese, Nepali, Sanskrit, Sindhi, Konkani, Maithili, Bhojpuri, Manipuri, Dogri). No API key required.
- **📖 Define** — looks up single-word selections via the free [Dictionary API](https://dictionaryapi.dev), showing part of speech and definitions.

### Toolbar behavior
- Every button has a native hover tooltip.
- **Drag to move** — a ✛ handle lets you drag the toolbar anywhere on screen (cursor switches to a 4-way move icon).
- **Minimize** — collapses the toolbar to a small dot; click it again to restore.
- Both the dragged position and minimized state persist across new text selections on the same page (reset on refresh).
- A master **enable/disable toggle** in the popup turns the whole toolbar on or off instantly on every open tab, via `chrome.storage.onChanged` — no page reload required.
- Automatically repositions to stay on-screen (flips above/below and left/right of the selection based on available space) and automatically inverts its color scheme (light toolbar on dark pages, dark toolbar on light pages) so it's always visible against the underlying site.

### Result panel
- Copy-to-clipboard icon button on every successful result.
- Clear, human-readable error messages — including specific OpenAI/Anthropic quota and rate-limit detection, and a dedicated guidance panel (with direct links to get an API key) when Rephrase is used with no key saved.
- Same automatic positioning and light/dark inversion as the toolbar.
- A built-in [user guide](guide.html), linked from the popup footer.

## Install (unpacked, for local use / development)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this repository's folder.
4. The extension icon appears in your toolbar.

## Setup

Open the extension's popup (click its toolbar icon):

1. **Enable toolbar on selection** — a switch that turns the whole extension on/off. Takes effect immediately on all open tabs, no reload needed.
2. **API Key** (only needed for Rephrase) — paste a key and the provider is auto-detected from its prefix:
   - `sk-ant-...` → Anthropic
   - `sk-...` → OpenAI
3. **Target language** — type to search, then pick a language from the results for Translate.
4. Click **Save**. Settings are stored in `chrome.storage.sync`.

See [guide.html](guide.html) for the full user guide, including troubleshooting and where to get an API key.

## Project structure

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 config: permissions, content script (all frames), background service worker, popup |
| `background.js` | Service worker — handles all network calls (Translate, Define, Rephrase) and provider-specific error handling |
| `content.js` | Injected into every page/frame — selection detection, toolbar/panel rendering and drag/minimize state, viewport clamping, dark/light theme detection, speech synthesis, enable/disable listener |
| `content.css` | Styling for the floating toolbar and result panel, including dark/light inverted themes |
| `popup.html` / `popup.js` | Settings UI — enable/disable toggle, API key input with provider auto-detection, searchable language picker |
| `guide.html` | Self-contained in-extension user guide, linked from the popup footer |
| `icons/` | Extension icons (16/32/48/128px) |
| `README.md` | Developer-facing documentation (this file) |
| `STORE_LISTING.md` | Copy-paste-ready content for the Chrome Web Store Developer Dashboard (description, category, permission justifications, privacy disclosures) |

## Why network calls live in the background service worker

Content scripts run inside the page's own context and can be blocked by a site's Content Security Policy. All `fetch` calls (Google Translate, Dictionary API, OpenAI, Anthropic) are made from `background.js` instead, and the content script talks to it via `chrome.runtime.sendMessage`.

## Error handling

- Rephrase with no API key saved shows a guidance panel with links to get an OpenAI or Anthropic key.
- OpenAI `429` / `insufficient_quota` and Anthropic `429` (`rate_limit_error`) / out-of-credits responses are caught specifically and shown as plain-language messages, not raw JSON.
- Any other failure (network error, malformed response, dictionary miss) surfaces its underlying message in the same floating result panel — nothing fails silently to the console only.

## Permissions

- `storage` — persists your API key, provider, and target language.
- Host permissions for `translate.googleapis.com`, `api.dictionaryapi.dev`, `api.openai.com`, `api.anthropic.com` — used only by the background service worker for the corresponding feature.
- Content script runs on `<all_urls>` (including frames) to detect text selection anywhere, including inside iframes such as Gmail's compose box.

## Privacy

- Rephrase sends the selected text to whichever provider your saved key belongs to.
- Translate sends the selected text to Google's public translation endpoint.
- Define sends the selected word to api.dictionaryapi.dev.
- Read Aloud never leaves the browser (local Web Speech API).
- Your API key is stored only in your own browser's `chrome.storage.sync` and is sent directly from your browser to the provider — never through any third-party server.

## Publishing to the Chrome Web Store

1. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) (one-time $5 fee).
2. Zip the project: `zip -r selection-assistant.zip . -x ".*"`
3. Upload the zip in the [developer dashboard](https://chrome.google.com/webstore/devconsole). Use [STORE_LISTING.md](STORE_LISTING.md) for the exact listing content — name, description, category, permission justifications, and privacy disclosures, ready to paste in.
4. Submit for review.

## No build step

Everything is vanilla JavaScript, HTML, and CSS — no bundler, no dependencies. Load it unpacked and it just works.

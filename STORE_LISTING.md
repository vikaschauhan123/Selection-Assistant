# Chrome Web Store Listing — Selection Assistant

This is the content to copy into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) when publishing. For the *process* (zipping, uploading, review), see the "Publishing" section in [README.md](README.md). This file is the *content* that goes into each field.

---

## 1. Store listing tab

### Extension name
```
Selection Assistant
```

### Summary (short description — max 132 characters)
```
Select text on any page to hear it, rephrase it with AI, translate it, or look up its definition — right where you're reading.
```
(126 characters)

### Description (detailed)
```
Selection Assistant adds a small floating toolbar whenever you select text on any webpage — no switching tabs, no copy-pasting into another app.

FEATURES

🔊 Read Aloud — hear the selected text using your browser's built-in voice, with adjustable playback speed (0.75x–2x). No API key, no setup.

✨ Rephrase — send the selection to your own OpenAI or Anthropic API key and get a rewritten version instantly.

🌐 Translate — translate the selection into any of 50+ languages (including Hindi, Tamil, Telugu, Bengali, and other Indian regional languages), powered by Google Translate. No API key needed.

📖 Define — select a single word to see its part of speech and definitions, powered by a free dictionary API.

DESIGNED TO STAY OUT OF YOUR WAY

- The toolbar and result panel automatically reposition themselves to stay on-screen, and automatically switch between light and dark styling to stay visible against both light and dark websites.
- Drag the toolbar anywhere, minimize it to a small dot, and it remembers where you left it for your next selection.
- One-click copy button on every result.
- A single settings toggle lets you turn the toolbar off entirely, instantly, with no page reload.

YOUR OWN API KEY, YOUR OWN DATA

Rephrase requires your own OpenAI or Anthropic API key, entered once in the extension's settings — auto-detected from the key's prefix. Your key is stored only in your browser's own synced storage and is sent directly from your browser to OpenAI or Anthropic; it never passes through any other server. Read Aloud never leaves your browser at all.

Read Aloud, Translate, and Define work immediately with zero configuration.
```

### Category
```
Productivity
```
Accessibility is a reasonable secondary fit given Read Aloud, but Productivity better reflects the extension's primary use (reading/writing assistance across any page). Pick whichever the dashboard allows as a single choice; Productivity is recommended.

### Language
```
English
```
(The extension's UI is in English; Translate output language is user-selectable and unrelated to this field.)

---

## 2. Graphic assets

### Icon
Already included at `icons/icon128.png` (128×128) — the dashboard pulls this from the manifest automatically.

### Screenshots (required — at least 1, up to 5)
Size: **1280×800** or **640×800** (16:10), PNG or JPEG, no alpha channel.

Suggested shots:
1. The toolbar open on a selection, showing all buttons (Read, Speed, Copy, Rephrase, Translate, Define).
2. A Rephrase result panel with the copy button visible.
3. The settings popup with the API key field and language search open.
4. A Translate result showing a non-English target language (e.g. Hindi).
5. The toolbar in its dark-inverted style on a dark-themed site.

### Promotional images (optional, only used in some placements)
- Small promo tile: 440×280
- Marquee promo tile: 1400×560
Not required to publish — skip unless you want them.

---

## 3. Privacy practices tab

### Single purpose description
```
Selection Assistant's single purpose is to let users read, rephrase, translate, or define text they select on any webpage, via a floating toolbar shown at the point of selection.
```

### Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Used to save the user's API key, selected AI provider, target translation language, and the toolbar on/off preference in `chrome.storage.sync`, so settings persist across browser sessions and sync across the user's signed-in devices. |
| Host permission: `translate.googleapis.com` | The background service worker calls Google's public translation endpoint to fulfill the Translate feature. |
| Host permission: `api.dictionaryapi.dev` | The background service worker calls this free dictionary API to fulfill the Define feature. |
| Host permission: `api.openai.com` | The background service worker calls the OpenAI Chat Completions API to fulfill the Rephrase feature, using the user's own API key. |
| Host permission: `api.anthropic.com` | The background service worker calls the Anthropic Messages API to fulfill the Rephrase feature, using the user's own API key. |
| Content script on `<all_urls>` (incl. all frames) | Needed to detect text selection and show the floating toolbar on any webpage the user visits, including selections made inside iframes (e.g. Gmail's compose box). |

### Data usage disclosure
When asked "What user data do you plan to collect from users of this item?", check/describe:
- **Personally identifiable information**: No.
- **Health information**: No.
- **Financial and payment information**: No.
- **Authentication information**: Yes — the user's own AI provider API key, entered by the user, stored in `chrome.storage.sync`, used only to call that provider on the user's behalf. Never transmitted anywhere except directly to OpenAI/Anthropic.
- **Personal communications**: No.
- **Location**: No.
- **Web history**: No — the extension does not track or log browsing history. It only acts on text the user explicitly selects, at the moment of selection.
- **User activity**: No.
- **Website content**: Yes — the specific text the user selects is sent to the relevant API (OpenAI/Anthropic for Rephrase, Google Translate for Translate, api.dictionaryapi.dev for Define) solely to fulfill that feature. Nothing is logged or stored by the extension developer.

Certify: **"I do not sell or transfer user data to third parties outside of approved use cases"** and **"I do not use or transfer user data for purposes unrelated to my item's single purpose"** — both true here, since each API call is made only in direct response to the user's own action, for the feature they invoked.

### Privacy policy URL
The Chrome Web Store requires a **publicly reachable URL**, not a local file. `guide.html` (bundled in the extension) already has a full Privacy section, but it's only reachable at `chrome-extension://<id>/guide.html` after install — not before, and not from the dashboard's field.

Before submitting, publish that content (or a copy of it) somewhere public, e.g.:
- A GitHub Pages site for this repo (`https://<username>.github.io/<repo>/guide.html` or similar), or
- Any plain hosted page with the same disclosures.

Then paste that public URL into the Privacy policy field.

### Remote code
```
No, I am not using remote code.
```
All code ships inside the extension package; nothing is fetched and executed dynamically.

---

## 4. Distribution tab

- **Visibility**: Public (or "Unlisted" if you only want people with the link to install it).
- **Pricing**: Free.
- **Regions**: All regions (default), unless you want to restrict distribution.

---

## 5. Support fields (optional but recommended)

- **Homepage URL**: link to this repo (e.g. the GitHub repository URL), if public.
- **Support URL**: same repo's issues page, or an email/contact page.
- **Support email**: your contact email for user questions.

---

## 6. Pre-submission checklist

- [ ] Version number in `manifest.json` bumped if this is an update.
- [ ] `zip -r selection-assistant.zip . -x ".*"` run from the project root (excludes `.claude/`, `.git/`, etc.).
- [ ] At least 1 screenshot ready (1280×800).
- [ ] Privacy policy hosted publicly and URL ready to paste.
- [ ] Tested the unpacked build end-to-end (Read Aloud, Rephrase with a real key, Translate, Define) right before packaging.

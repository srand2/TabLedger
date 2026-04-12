# TabLedger

`TabLedger` is a Manifest V3 browser extension for turning open tabs into a reusable Browsing Library. It captures tabs across open windows, lets you review and enrich them in a draft workspace, and saves structured sessions into bookmarks plus extension storage for later filtering, editing, and reopening.

## What it does

- captures tabs across all open browser windows
- groups draft tabs into editable categories
- lets you edit per-tab `Category`, `Tags`, `Description`, and `Summary`
- saves reviewed sessions into a bookmark-backed **Browsing Library**
- keeps richer tab/session metadata in `chrome.storage.local`
- lets you filter and reopen saved tabs from the in-dashboard library explorer
- supports draft AI fill with Gemini directly from the extension
- reuses existing draft and library categories during AI fill to reduce duplicates
- auto-merges obvious near-duplicate AI categories such as `AI Tool` and `AI Tools`

## Current UX

### Draft workspace

- `Capture All Windows` scans all open normal browser windows
- each tab appears in a draft card with editable metadata
- categories can be renamed inline with explicit `Save` and `Cancel`
- tab fields are collapsible to reduce visual noise in large sessions
- favicons are shown when available

### Browsing Library

- saved sessions appear in the right-hand explorer
- you can filter by session, category, tag, title, URL, description, or summary
- you can reopen all matching tabs for a filtered view
- saved tabs can be edited or deleted from the explorer

### AI fill

- AI runs only when you click `Fill with AI` on a tab or `Use AI` for the draft
- Gemini is configured in the dashboard Settings panel
- AI prefers reusing known categories from the current draft and saved library
- manual category edits remain authoritative and are not auto-overwritten by AI merge logic

## Project files

- `popup.html` / `popup.js`: quick launcher into the workspace
- `dashboard.html` / `dashboard.js`: main UI for capture, review, AI fill, and library exploration
- `background.js`: bookmark persistence and saved-library edit/delete/reopen flows
- `styles.css`: shared styles for popup and dashboard
- `manifest.json`: Chrome extension manifest
- `ai-sidecar.js`: optional standalone local Gemini proxy kept for separate use
- `ai-api-integrate.md`: notes for broader AI architecture ideas

## Load the extension in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `/home/shay/Projects/ChromeExtension`.

If you change `manifest.json`, reload the unpacked extension before testing again.

## Configure Gemini

TabLedger now calls Gemini directly from the extension. You do not need to run `ai-sidecar.js` for normal dashboard AI fill.

1. Load the extension and open the workspace.
2. Click the settings gear.
3. Under `AI`, paste your Gemini API key.
4. Optionally change the model. The default is `gemini-2.5-flash`.

Settings stored under `tabLedgerSettings` currently include:

```js
{
  dedupeWithinSession: false,
  dedupeAcrossSessions: false,
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash"
}
```

## How to use it

### Capture and review

1. Click the extension icon.
2. Click `Capture All Windows` or open the full workspace.
3. Review the generated draft.
4. Edit any category, tags, description, or summary fields you want to keep.

### Use AI

1. Make sure a Gemini API key is saved in Settings.
2. Click `Fill with AI` on one tab or `Use AI` for the whole draft.
3. TabLedger sends only the tab `title`, `url`, and `hostname` to Gemini.
4. The returned category, tags, description, and summary are applied in place.

Important behavior:

- AI does not run automatically.
- AI only updates draft items, not saved library entries.
- existing categories are passed to Gemini so it prefers reuse over inventing a new label
- deterministic category normalization collapses obvious variants
- ambiguous near-matches can be resolved with a small Gemini adjudication step

### Save to the Browsing Library

1. Set or keep a session name.
2. Click `Save to Library`.
3. TabLedger creates bookmark folders under `Browsing Library`.
4. Rich tab metadata remains in extension storage so the library explorer can filter and edit cleanly later.

### Reopen from the library

In the `Library Explorer` panel you can:

- open an entire saved session
- filter down to matching tabs
- open all filtered matches at once
- edit or delete individual saved items

## Storage model

Native bookmarks store the folder structure, title, and URL. TabLedger stores richer data in extension storage, including:

- session metadata
- per-tab category
- per-tab tags
- per-tab description
- per-tab summary
- saved-session mappings used by the library explorer

This keeps the bookmark structure simple while still supporting richer filtering and editing.

## Optional sidecar

`ai-sidecar.js` still exists as a standalone local Gemini proxy, but the dashboard no longer depends on it for AI fill.

If you want to run it separately:

```bash
export GEMINI_API_KEY="your-key-here"
export GEMINI_MODEL="gemini-2.5-flash"
node ai-sidecar.js
```

It listens on `http://127.0.0.1:4317` by default and exposes:

- `GET /health`
- `POST /v1/fill-tab`

## Troubleshooting

### AI fill says to add a Gemini API key

- open the dashboard Settings panel
- add a valid Gemini API key
- reload the extension if you recently changed permissions in `manifest.json`

### AI fill fails with a Gemini request error

- verify the API key
- try the default model `gemini-2.5-flash`
- check network access from the browser environment

### AI categories still look too fragmented

- run `Use AI` on the full draft so later tabs can reuse earlier accepted categories
- review whether a category was manually edited; manual category labels are intentionally not auto-merged away
- check saved library categories, because AI may reuse an existing library label as the canonical name

### The library explorer looks out of sync

- reload the workspace tab
- reload the extension from `chrome://extensions`
- recapture tabs if you want a fresh draft state

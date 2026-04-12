# TabLedger

`TabLedger` is a Manifest V3 browser extension for turning open tabs into a reusable Browsing Library. It captures tabs across open windows, lets you review and enrich them in a guided 3-phase draft workflow, and saves structured sessions into bookmarks plus extension storage for later filtering, editing, and reopening.

## What it does

- captures tabs across all open browser windows
- guides you through a 3-phase workflow: Capture → Review → Save
- groups draft tabs into editable categories
- lets you edit per-tab `Category`, `Tags`, `Description`, and `Summary`
- saves reviewed sessions into a bookmark-backed **Browsing Library**
- keeps richer tab/session metadata in `chrome.storage.local`
- lets you filter and reopen saved tabs from the in-dashboard library explorer
- supports draft AI fill with Gemini directly from the extension
- reuses existing draft and library categories during AI fill to reduce duplicates
- auto-merges obvious near-duplicate AI categories such as `AI Tool` and `AI Tools`

## Workflow

### Phase 1 — Capture

Click `Capture & Review` in the popup, or `Capture All Windows` in the dashboard. TabLedger scans all open normal browser windows and builds a draft.

### Phase 2 — Review

Tabs appear grouped by category in the Draft pane. Click any tab row to expand its fields. Edit `Category`, `Tags`, `Description`, or `Summary` as needed.

- **Category rows** show `Save` (disabled until you rename) and `Remove` (removes all tabs in that category from the draft)
- **Fill with AI** enriches a single tab; **Use AI** runs the whole draft at once
- Switch to the **Library** tab at any time to reference saved sessions — phase nav buttons always return you to the Draft view

### Phase 3 — Save

Click `Name & Save →` to advance. Enter a session name, then click `Save to Library →`. TabLedger creates bookmark folders and stores rich metadata. The view switches to the Library and the newly saved session is highlighted.

## Current UX details

### Draft workspace

- click a tab card's title row to expand/collapse its fields — the `▸` glyph rotates to confirm
- categories can be renamed inline; `Save` enables only when the name has changed
- `Remove` (red) on a category deletes all its tabs from the draft immediately
- `Expand All` / `Collapse All` controls the whole draft at once
- favicons are shown when available
- completion dots (gray / teal / indigo) indicate pending / AI-filled / user-reviewed state

### Browsing Library

- accessible via the `Library` tab at any time during capture or review
- saved sessions appear with filter, open, and delete controls
- you can filter by session, category, tag, title, URL, description, or summary
- you can reopen all matching tabs for a filtered view
- saved tabs can be edited or deleted from the explorer

### AI fill

- AI runs only when you click `Fill with AI` on a tab or `Use AI` for the draft
- Gemini is configured in the dashboard Settings panel
- AI prefers reusing known categories from the current draft and saved library
- manual category edits remain authoritative and are not auto-overwritten by AI merge logic

## Project files

- `popup.html` / `popup.js` — quick launcher with `Capture & Review` and `Open Library` buttons
- `dashboard.html` / `dashboard.js` — main UI: capture, review, AI fill, save, and library exploration
- `background.js` — bookmark persistence and saved-library edit/delete/reopen flows
- `styles.css` — shared styles for popup and dashboard
- `manifest.json` — Chrome extension manifest
- `ai-sidecar.js` — optional standalone local Gemini proxy kept for separate use

## Load the extension in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

If you change `manifest.json`, reload the unpacked extension before testing again.

## Configure Gemini

TabLedger calls Gemini directly from the extension. You do not need to run `ai-sidecar.js` for normal dashboard AI fill.

1. Load the extension and open the dashboard.
2. Click the settings gear (top right of the hero card).
3. Under **AI**, paste your Gemini API key.
4. Optionally change the model. The default is `gemini-2.5-flash`.

Settings stored under `tabLedgerSettings`:

```js
{
  dedupeWithinSession: false,
  dedupeAcrossSessions: false,
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash"
}
```

## Storage model

Native bookmarks store the folder structure, title, and URL. TabLedger stores richer data in extension storage:

- session metadata
- per-tab category, tags, description, summary
- saved-session mappings used by the library explorer

This keeps the bookmark structure simple while still supporting richer filtering and editing.

## Optional sidecar

`ai-sidecar.js` still exists as a standalone local Gemini proxy, but the dashboard no longer depends on it.

```bash
export GEMINI_API_KEY="your-key-here"
export GEMINI_MODEL="gemini-2.5-flash"
node ai-sidecar.js
```

Listens on `http://127.0.0.1:4317` and exposes `GET /health` and `POST /v1/fill-tab`.

## Troubleshooting

**AI fill says to add a Gemini API key** — open Settings, add a valid key, reload the extension if permissions changed.

**AI fill fails with a request error** — verify the key, try the default model `gemini-2.5-flash`, check network access.

**AI categories look fragmented** — run `Use AI` on the full draft so later tabs can reuse earlier accepted categories. Check whether a category was manually edited (manual labels are not auto-merged).

**Library explorer looks out of sync** — reload the workspace tab or reload the extension from `chrome://extensions`.

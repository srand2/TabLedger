# Architecture

**Analysis Date:** 2026-04-18

## Pattern Overview

**Overall:** Manifest V3 browser extension with a document-driven dashboard and a message-based service-worker backend.

**Key Characteristics:**
- Runtime code is loaded directly from root-level assets in `manifest.json`, `popup.html`, and `dashboard.html`; no `src/` directory, bundler, or import graph is present.
- The main application lives in one stateful page script, `dashboard.js`, which owns a single mutable `state` object, binds DOM events, and re-renders sections of `dashboard.html` imperatively.
- Cross-context coordination is string-contract based: `popup.js` and `dashboard.js` call `chrome.runtime.sendMessage`, while `dashboard.js` and `background.js` mirror the same storage keys such as `tabGardenDraft`, `savedSessions`, `bookmarkMetadata`, `aiEnrichmentQueue`, and `tabLedgerSettings`.
- Durable library data is split between Chrome bookmarks and `chrome.storage.local`: bookmarks hold the tree users can reopen, while `savedSessions` and `bookmarkMetadata` in `background.js` carry richer metadata for filtering, AI status, and editing.
- AI runs in two execution models: direct request/response calls from `dashboard.js` for draft and library edits, and a resumable queue in `background.js` for bookmark-import enrichment.

## Layers

**Manifest And Surface Wiring:**
- Purpose: Declare the extension’s runtime surfaces and permissions.
- Location: `manifest.json`
- Contains: MV3 metadata, permission list, popup wiring, service worker wiring, Gemini host permission.
- Depends on: Chrome extension runtime.
- Used by: Chrome when loading the unpacked extension.

**Popup Launcher Surface:**
- Purpose: Provide the smallest possible entry surface for opening the main workspace.
- Location: `popup.html`, `popup.js`
- Contains: Two buttons that request either capture mode or library mode.
- Depends on: `chrome.runtime.sendMessage` and the `open-dashboard` message handled in `background.js`.
- Used by: Browser action popup defined in `manifest.json`.

**Dashboard Application Layer:**
- Purpose: Own capture, review, save, search, filter, import progress, sync controls, and AI-driven editing.
- Location: `dashboard.html`, `dashboard.js`, `styles.css`
- Contains: DOM templates, button bindings, the mutable `state` store, draft item builders, archive rendering, direct Gemini calls, and local draft/settings persistence.
- Depends on: `chrome.tabs`, `chrome.storage.local`, `chrome.runtime.sendMessage`, `fetch`, and root-level CSS from `styles.css`.
- Used by: Tabs opened through `background.js::openDashboard()` and restored directly from `dashboard.html`.

**Background Service Layer:**
- Purpose: Own privileged bookmark operations, library mutations, import, queued AI enrichment, and sync.
- Location: `background.js`
- Contains: MV3 service worker startup hooks, runtime message switchboard, bookmark CRUD, deduplication helpers, storage helpers, AI queue control, and sync push/pull logic.
- Depends on: `chrome.bookmarks`, `chrome.windows`, `chrome.tabs`, `chrome.storage.local`, `chrome.storage.sync`, and `fetch`.
- Used by: `popup.js` and `dashboard.js` through message types such as `open-dashboard`, `create-bookmark-archive`, `update-archive-item`, `import-bookmarks`, and `sync-now`.

**Browser Persistence Layer:**
- Purpose: Persist drafts, settings, saved sessions, bookmark metadata, queue state, and cross-device sync payloads.
- Location: `dashboard.js`, `background.js`, Chrome storage/bookmark APIs
- Contains: `tabGardenDraft`, `tabLedgerSettings`, `savedSessions`, `bookmarkMetadata`, `aiEnrichmentQueue`, `aiEnrichmentControl`, `sync:session:<id>`, and `sync:index`.
- Depends on: `chrome.storage.local`, `chrome.storage.sync`, `chrome.bookmarks`.
- Used by: Both runtime scripts as the extension’s shared data contract.

## Data Flow

**Launch And Capture Flow:**

1. `popup.js` sends `open-dashboard` with `{ capture: "all" }` or `{ view: "library" }`.
2. `background.js::openDashboard()` opens `dashboard.html` with query parameters that encode the launch intent.
3. `dashboard.js::init()` restores the last draft, settings, and saved sessions from `chrome.storage.local`, then applies the launch intent from `window.location.search`.
4. `dashboard.js::scanTabs()` queries all normal-window tabs, filters unsupported URLs with `isBookmarkableTab()`, then converts each tab into a draft record through `buildDraftItem()`.
5. `dashboard.js::persistDraft()` stores the draft under `tabGardenDraft`, and `render()` redraws the review UI from the in-memory `state`.

**Draft Review And Save Flow:**

1. `dashboard.js` renders category and tab cards from `<template>` nodes in `dashboard.html`.
2. User edits mutate the in-memory draft through helpers such as `updateDraftField()`, `renameCategory()`, and `replaceItem()`.
3. `dashboard.js::handleSaveBookmarks()` serializes the draft and sends `create-bookmark-archive` to `background.js`.
4. `background.js::createBookmarkArchive()` validates the payload, deduplicates URLs with `buildArchiveItemsForSave()`, ensures the `Browsing Library` root bookmark folder exists, creates a session folder plus category folders, and writes bookmark metadata into `savedSessions` and `bookmarkMetadata`.
5. `dashboard.js` clears `tabGardenDraft`, reloads recent archives from storage, switches to the Library view, and highlights the newly saved session.

**Library Edit And Reopen Flow:**

1. `dashboard.js::loadRecentArchives()` reads `savedSessions` and `bookmarkMetadata`, then normalizes them with `buildArchiveSessions()`.
2. Search and filter controls in `dashboard.html` narrow the in-memory archive view through `matchesArchiveItem()` and archive filter helpers in `dashboard.js`.
3. Library item edits call `update-archive-item` or `update-archive-category`.
4. `background.js` updates both bookmark-tree placement and storage metadata, then returns the normalized result envelope.
5. Reopen actions call `open-archive-urls`, and `background.js::openArchiveUrls()` opens a new window and recreates tabs from the stored URLs.

**Import And Queued AI Flow:**

1. The import panel in `dashboard.html` calls `get-bookmark-folders` to populate selectable bookmark folders.
2. `dashboard.js::handleImportRun()` sends `import-bookmarks` with `{ folderId, useAi }`.
3. `background.js::importBookmarksAsSession()` traverses the bookmark tree with `buildSessionsFromNode()`, creates TabLedger session folders under the `Browsing Library` root, writes session records into `savedSessions`, and optionally appends session IDs to `aiEnrichmentQueue`.
4. `background.js::drainAiEnrichmentQueue()` processes queued sessions one at a time, calls Gemini, updates bookmark folders and metadata, and records `aiEnrichmentStatus` on each session.
5. `dashboard.js` listens to `chrome.storage.onChanged` and re-renders the Library view as queued AI work completes.

**Direct AI Editing Flow:**

1. Draft or Library AI buttons in `dashboard.html` trigger `runAiFillForItem()` or `runAiFillForArchiveItem()` in `dashboard.js`.
2. `dashboard.js` reads the Gemini API key and model from `tabLedgerSettings`, builds a structured prompt, and calls Gemini directly with `fetch`.
3. Draft AI writes back into the local draft and persists `tabGardenDraft`.
4. Library AI sends `update-archive-item` so the service worker can keep bookmarks and storage metadata in sync.

**Cross-Device Sync Flow:**

1. `dashboard.js::handleSyncNow()` sends `sync-now`.
2. `background.js::syncNow()` converts each local session into a lightweight sync payload and writes it to `chrome.storage.sync` under `sync:session:<id>`.
3. The same function reads remote sync records, skips the current device via `deviceId`, and imports unseen sessions back into `savedSessions`.
4. `dashboard.js` reloads the Library view after pull operations.

**State Management:**
- Use the mutable `state` object in `dashboard.js` as the only in-page source of truth for view mode, draft items, filters, selection state, AI progress, and import/sync UI state.
- Persist recoverable UI state in `chrome.storage.local`: `tabGardenDraft` for unfinished capture work and `tabLedgerSettings` for dedupe and Gemini settings.
- Treat `savedSessions`, `bookmarkMetadata`, and bookmark folders as durable library state owned by `background.js`.
- Use `chrome.storage.onChanged` rather than direct shared-memory assumptions when background work changes library sessions.

## Key Abstractions

**Draft Item:**
- Purpose: Represent one captured browser tab before it becomes part of the saved library.
- Examples: `dashboard.js::buildDraftItem()`, `dashboard.js::normalizeDraftItem()`
- Pattern: Plain object with `id`, `title`, `url`, `hostname`, `category`, `tags`, `description`, `summary`, `capturedAt`, and `fieldSources`.

**Saved Session / Archive Session:**
- Purpose: Represent a persisted library session composed of categorized bookmark items.
- Examples: `background.js::createBookmarkArchive()`, `background.js::importBookmarksAsSession()`, `dashboard.js::normalizeArchiveSession()`
- Pattern: Plain object with session metadata plus an `items` array and `categoryMeta`; stored in `savedSessions` and mirrored in Chrome bookmarks.

**Bookmark Metadata Entry:**
- Purpose: Preserve rich per-bookmark data that Chrome bookmarks cannot store natively.
- Examples: `background.js::getArchiveMetadataEntry()`, `background.js::buildExistingLibraryUrlSet()`, `dashboard.js::buildMetadataFallbackSessions()`
- Pattern: Object map keyed by bookmark ID in `bookmarkMetadata`.

**Field Source Tracking:**
- Purpose: Record whether `category`, `tags`, `description`, and `summary` came from heuristics, AI, or the user.
- Examples: `dashboard.js::FIELD_SOURCES`, `dashboard.js::normalizeDraftFieldSources()`, `background.js::applyArchiveFieldSourceUpdates()`
- Pattern: Per-item nested object used for dedupe scoring and UI completion state.

**AI Enrichment Queue:**
- Purpose: Resume long-running import enrichment across service-worker restarts.
- Examples: `background.js::drainAiEnrichmentQueue()`, `background.js::pauseAiEnrichmentQueue()`, `background.js::resumeAiEnrichmentQueue()`
- Pattern: Array of session IDs in `aiEnrichmentQueue` plus a control object in `aiEnrichmentControl`.

## Entry Points

**Extension Manifest:**
- Location: `manifest.json`
- Triggers: Chrome extension load.
- Responsibilities: Declare MV3 permissions, browser action popup, service worker, icon assets, and Gemini host permission.

**Popup Surface:**
- Location: `popup.html`, `popup.js`
- Triggers: User clicks the extension icon.
- Responsibilities: Launch the dashboard in capture mode or library mode and close the popup when the request succeeds.

**Dashboard Surface:**
- Location: `dashboard.html`, `dashboard.js`
- Triggers: Tab created by `background.js::openDashboard()` or direct navigation to the extension page.
- Responsibilities: Restore local state, render the workspace, capture tabs, edit drafts, invoke AI, save sessions, import bookmarks, filter the library, and trigger sync.

**Service Worker:**
- Location: `background.js`
- Triggers: Extension startup, installation, and messages from popup/dashboard.
- Responsibilities: Resume queued AI work, mutate bookmarks safely, persist library data, reopen sessions, import bookmarks, and push/pull sync records.

## Extension Lifecycle

**Install And Startup:**
- `background.js` registers `runtime.onInstalled` and `runtime.onStartup` listeners that immediately call `drainAiEnrichmentQueue()` so interrupted import enrichment can resume after browser restarts.

**Popup To Dashboard Transition:**
- `popup.js` never opens pages directly. It sends intent to `background.js`, which constructs the `dashboard.html` URL and opens a new tab with query parameters.

**Dashboard Boot:**
- `dashboard.js::init()` binds DOM events, restores draft/settings/library state, applies launch intent, renders once, then subscribes to `chrome.storage.onChanged` for background-driven library refreshes.

**Active Use:**
- Capture, review, AI editing, save, import, delete, and sync all happen as explicit user actions from `dashboard.js`, with privileged operations delegated to `background.js`.

**Background Continuations:**
- Bookmark import AI keeps running after the import button returns because `background.js` owns the queue and persists its progress in `chrome.storage.local`.

## Error Handling

**Strategy:** Catch errors at every browser API, storage, and network boundary; return structured `{ ok, error }` responses from `background.js`; surface user-readable messages through `dashboard.js::setStatus()` and `setSyncStatus()`.

**Patterns:**
- `background.js` wraps each `runtime.onMessage` branch in promise handling that logs with `console.error` and responds with a stable envelope.
- `dashboard.js` uses `try`/`catch` around each async UI action and converts failures into status banners instead of throwing uncaught errors into the page.
- Bookmark tree inconsistencies are tolerated where possible. For example, `background.js::updateArchiveItem()` continues persisting storage changes even if a bookmark move fails.
- Data is normalized aggressively through helpers such as `normalizeDraftItem()`, `normalizeArchiveItem()`, `normalizeSettings()`, `normalizeArchiveFieldSources()`, and `normalizeArchiveUrl()` before render or persistence.

## Cross-Cutting Concerns

**Logging:** Use `console.error` in `background.js`, `dashboard.js`, and `popup.js` for operational failures; no external logging service is wired in.

**Validation:** Use `background.js::validatePayload()`, `dashboard.js::isBookmarkableTab()`, `background.js::buildArchiveItemsForSave()`, and the various `normalize*` helpers to reject malformed data and stabilize storage shape.

**Authentication:** The extension has no user account system. Gemini calls use the API key stored in `tabLedgerSettings` inside `chrome.storage.local`, and both `dashboard.js` and `background.js` send it to Google as the `x-goog-api-key` header.

---

*Architecture analysis: 2026-04-18*

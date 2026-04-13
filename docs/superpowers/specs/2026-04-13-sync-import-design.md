# TabLedger Sync + Import Design

**Date:** 2026-04-13

## Overview

Two features that extend TabLedger's core value proposition — deduplication, categorization, and tagging of browser sessions:

1. **Cross-device sync** — manually push/pull sessions across Chrome profiles via `storage.sync`
2. **Browser bookmark import** — convert existing bookmark folders into TabLedger sessions, with background AI enrichment

## Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| Sync trigger | Manual "Sync Now" button | User wants conscious control |
| Sync payload | URLs, titles, categories, tags | Tags are lightweight and essential; AI summaries stay local |
| Session cap | Removed (was `.slice(0, 20)`) | Cap breaks import of large bookmark libraries |
| Sync storage | One key per session (`sync:session:<id>`) | Avoids 8 KB per-key limit; each session gets its own budget |
| Import mapping | Every folder at every depth = one session | Preserves granular structure; matches Option B |
| Loose bookmarks | Collected into "Loose Bookmarks" session | Nothing silently dropped |
| AI enrichment timing | Background after save (Approach A) | Sessions usable instantly; AI failure doesn't block import |
| AI scope | Categories + tags per tab | Summaries/descriptions left for manual editing |

## Storage Architecture

### `chrome.storage.local`

| Key | Contents |
|---|---|
| `savedSessions` | Full session records (uncapped). New field: `aiEnrichmentStatus: "pending" | "done" | "failed"` |
| `bookmarkMetadata` | Per-bookmark rich metadata (unchanged) |
| `aiEnrichmentQueue` | Array of session IDs awaiting AI enrichment. Survives restarts. |
| `deviceId` | Stable random ID for this Chrome profile |

### `chrome.storage.sync`

| Key | Contents |
|---|---|
| `sync:session:<id>` | Lightweight session: `{id, title, createdAt, deviceId, categories, tags, urls}` |
| `sync:index` | `string[]` — all session IDs on this device, used to detect remote deletions |

## Import Flow

1. User clicks "↓ Import" in Library header → panel expands
2. User picks scope (all folders or specific folder) and toggles AI enrichment
3. On "Import Bookmarks": background parses bookmark tree via `chrome.bookmarks.getTree()`
4. `buildSessionsFromNode()` walks the tree — every non-root folder = one session; loose bookmarks at root → "Loose Bookmarks" session
5. Sessions written to `storage.local` immediately with `aiEnrichmentStatus: "pending"`
6. Session IDs added to `aiEnrichmentQueue`
7. `drainAiEnrichmentQueue()` fires: for each session, one Gemini call returns `[{url, category, tags}]`
8. Results update items in storage; `aiEnrichmentStatus` set to `"done"` or `"failed"`
9. Dashboard `storage.onChanged` listener re-renders as each session completes
10. Failed sessions show "⚠ Retry AI" badge; clicking re-queues them

## Sync Flow

1. User clicks "⇅ Sync" → `syncNow()` fires
2. Push: for each local session, write lightweight record to `sync:session:<id>`, update `sync:index`
3. Pull: read all `sync:session:*` keys, skip own `deviceId`, skip IDs already in local storage, import remainder as lightweight sessions
4. Status bar shows result: "Synced — 3 pushed, 2 pulled" or "Already up to date"

## UI Components Added

- **Library header**: Sync button (spinning icon during sync), Import toggle button
- **Sync status bar**: appears below header, auto-hides after 4s on success
- **Import panel**: collapsible, scope radios, folder dropdown (lazy-loaded), AI toggle, progress rows + bar
- **Session card**: AI enrichment badge (pulsing "✦ AI enriching…" while pending, "⚠ Retry AI" on failure)

## Error Handling

- **Import parse error**: message shown via `setStatus()`, progress hidden, button re-enabled
- **Gemini API failure**: session marked `aiEnrichmentStatus: "failed"`, retry available per-session
- **Sync storage full**: URLs trimmed to fit 8 KB budget (metadata preserved)
- **Sync network failure**: error shown in status bar, no partial state left behind

## Files Changed

| File | Changes |
|---|---|
| `background.js` | Added: `getBookmarkFolders`, `importBookmarksAsSession`, `buildSessionsFromNode`, `drainAiEnrichmentQueue`, `enrichSessionWithAi`, `retryAiEnrichment`, `syncNow`, `callGeminiApi`, `getDeviceId`. Removed: 20-session cap. |
| `dashboard.html` | Import panel, sync button, AI badge slot in session template |
| `dashboard.js` | Import/sync handlers, storage change listener, AI badge rendering |
| `styles.css` | Import panel, progress bar, sync button animation, AI badge pulse |
| `manifest.json` | No changes needed — `storage` permission covers both local and sync |

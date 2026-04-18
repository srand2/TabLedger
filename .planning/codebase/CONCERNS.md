# Codebase Concerns

**Analysis Date:** 2026-04-18

## Tech Debt

**Monolithic core scripts:**
- Issue: Nearly all product behavior lives in two large files: `dashboard.js` (~4.7k lines) owns rendering, state, filtering, AI calls, and edit flows; `background.js` (~2.0k lines) owns message handling, bookmarks, storage, sync, import, and AI queueing. The UI and data layers are tightly coupled and hard to change safely.
- Files: `dashboard.js`, `background.js`, `popup.js`
- Impact: Small edits have wide regression surface, shared invariants are implicit, and code review/testing cost stays high.
- Fix approach: Extract shared domain modules first (`session-store`, `bookmark-repository`, `ai-client`, `sync-service`), then move UI-only rendering out of `dashboard.js`.

**Duplicated persistence model:**
- Issue: Session data is stored twice: once in `savedSessions` and again in `bookmarkMetadata`. `createBookmarkArchive()` and `importBookmarksAsSession()` write both copies, and later update/delete paths must keep them aligned manually.
- Files: `background.js` (`createBookmarkArchive`, `importBookmarksAsSession`, `updateArchiveItem`, `deleteArchiveItem`, `bulkDeleteArchiveItems`), `dashboard.js` (`buildArchiveSessions`)
- Impact: Drift between bookmark tree, session list, and metadata store is easy to introduce and hard to repair.
- Fix approach: Pick one canonical store for session metadata, derive secondary indexes from it, and add a repair/rebuild path for legacy data.

**AI client logic is implemented twice:**
- Issue: Gemini request building, schema validation, and response parsing exist in both `dashboard.js` and `background.js`, with different prompts and different error handling paths.
- Files: `dashboard.js` (`requestAiFillPayload`, `callGeminiApi`, `callGeminiJsonPrompt`), `background.js` (`enrichSessionWithAi`, `callGeminiApi`)
- Impact: Model/API changes require duplicated edits and can produce inconsistent behavior between draft AI fill and import-time enrichment.
- Fix approach: Move Gemini access into a single shared client and keep prompts/schema definitions in one place.

**Tooling and docs drift:**
- Issue: The repo has no package manifest, linter config, or CI entrypoint, and `CLAUDE.md` still describes older file sizes and a smaller architecture surface.
- Files: `CLAUDE.md`, `tests/test_dedup.js`
- Impact: Refactors rely on manual verification, and automation/agent guidance becomes less trustworthy as the codebase grows.
- Fix approach: Add a minimal runnable test command, lint command, and regenerate/verify contributor docs against the current file graph.

**Machine-specific packaging and generated artifacts in the repo:**
- Issue: Packaging is hardcoded to a single Windows path, and generated Playwright/browser-profile/virtualenv outputs live under the repo tree.
- Files: `package-extension.sh`, `output/package`, `output/playwright/review/profile`, `output/playwright/review/profile-fresh`, `output/playwright/verify/chrome-profile`, `output/playwright/verify/venv`
- Impact: Release workflow is not portable, searches are noisy, and accidental artifact churn is likely.
- Fix approach: Parameterize output destinations, keep generated profiles outside the repo, and ensure artifacts are ignored unless intentionally versioned.

## Known Bugs

**Cross-device sync can overwrite or skip unrelated sessions because session IDs are local bookmark IDs:**
- Symptoms: One device can overwrite another device's synced session, or a remote session can be skipped as "already local" even when it is unrelated.
- Files: `background.js` (`createBookmarkArchive`, `importBookmarksAsSession`, `syncNow`)
- Trigger: Two profiles produce the same bookmark folder ID and then both run sync.
- Workaround: No reliable in-product workaround. Manual cleanup of extension sync storage is required if collisions happen.

**Deleted sessions can reappear after sync:**
- Symptoms: A session removed on one device can be pulled back in from another device on a later sync.
- Files: `background.js` (`syncNow`)
- Trigger: Delete a session locally, then run sync on another device that still has the old `sync:session:*` key.
- Workaround: No UI-level tombstone or cleanup flow exists; stale sync keys must be removed manually.

**Bulk delete underreports deletions for synced sessions without local bookmark IDs:**
- Symptoms: The UI can remove bookmarkless synced items/sessions, but the returned deleted tab count is `0`.
- Files: `background.js` (`bulkDeleteArchiveItems`), `dashboard.js` (`handleDeleteFilteredTabs`)
- Trigger: Delete filtered tabs from sessions imported from `chrome.storage.sync` that have empty `bookmarkId` arrays.
- Workaround: Delete full sessions one at a time if accurate status messaging matters.

**URL dedupe can collapse distinct pages that use `ref` semantically:**
- Symptoms: Distinct URLs such as branch, reference, or navigation links can be treated as duplicates and skipped.
- Files: `background.js` (`TRACKING_PARAMS`, `normalizeArchiveUrl`, `buildArchiveItemsForSave`), `tests/test_dedup.js`
- Trigger: Enable dedupe and save/import URLs where `ref` is meaningful rather than tracking.
- Workaround: Disable dedupe settings when saving sessions that rely on semantic query parameters.

## Security Considerations

**Gemini API key is stored in plaintext extension storage:**
- Risk: The user-supplied API key is persisted in `chrome.storage.local` and then written back into the settings UI input. Any future content script, debugging surface, or compromised extension page would be able to read it.
- Files: `dashboard.js` (`DEFAULT_SETTINGS`, `render`, `persistSettings`)
- Current mitigation: The extension has no content scripts and does not sync the key to `chrome.storage.sync`.
- Recommendations: Prefer session-scoped storage when possible, add a "do not persist key" option, and isolate secrets from general settings objects.

**AI requests send full tab URLs and titles to Google without redaction controls:**
- Risk: Sensitive internal URLs, query strings, or document names are sent to Gemini whenever the user runs AI features.
- Files: `manifest.json`, `dashboard.js` (`buildGeminiPrompt`, `callGeminiJsonPrompt`), `background.js` (`buildEnrichmentPrompt`, `callGeminiApi`)
- Current mitigation: AI runs only when the user explicitly invokes it, and the host permission is limited to `https://generativelanguage.googleapis.com/*`.
- Recommendations: Add host allow/block lists, redact query strings by default, and warn before sending non-public/internal domains.

**Bookmark-tree failures are silently downgraded into storage-only success paths:**
- Risk: A category move, folder cleanup, rename, or delete can fail in the bookmark tree while local metadata still reports success.
- Files: `background.js` (`updateArchiveItem`, `removeBookmarkTree`, `removeBookmarkNode`, `removeBookmarkFolderIfEmpty`, `renameBookmarkFolders`)
- Current mitigation: Metadata fallback sessions in `dashboard.js` keep the library UI usable even when bookmark nodes are stale or missing.
- Recommendations: Persist explicit reconciliation errors, surface a "repair library" action, and fail closed for operations that must keep bookmarks and metadata in sync.

## Performance Bottlenecks

**Full UI rerenders on routine edits and storage updates:**
- Problem: `render()` rebuilds the visible draft and library panes, and the `chrome.storage.onChanged` listener reloads and re-renders all archives whenever `savedSessions` changes.
- Files: `dashboard.js` (`init`, `render`, `renderCategories`, `renderArchiveExplorer`, `buildArchiveSessions`)
- Cause: The app uses full-tree reconstruction instead of incremental updates or virtualization.
- Improvement path: Diff only changed sessions/items, debounce storage-driven refreshes, and virtualize long archive/session lists.

**Draft persistence rewrites the entire draft object repeatedly:**
- Problem: Editing a single field writes the full draft state, including the entire `items` array, back to `chrome.storage.local`.
- Files: `dashboard.js` (`persistDraft`, draft field listeners in `renderTabItem`)
- Cause: Persistence is snapshot-based rather than patch-based.
- Improvement path: Debounce writes, persist dirty items separately, or checkpoint at explicit milestones instead of every blur/change.

**Sync uses namespace-wide reads and per-session writes:**
- Problem: `syncNow()` loops over every local session with separate `storage.sync.set()` calls and then pulls the whole sync namespace with `get(null)`.
- Files: `background.js` (`syncNow`)
- Cause: Sync state has no manifest/diff layer and no cleanup of stale per-session keys.
- Improvement path: Maintain an explicit sync index, delete tombstoned keys, batch writes, and stop using `get(null)` for steady-state sync.

**Large session saves duplicate metadata payloads:**
- Problem: Saving or importing a session writes one copy of each item into `savedSessions` and another into `bookmarkMetadata`.
- Files: `background.js` (`createBookmarkArchive`, `importBookmarksAsSession`)
- Cause: The current design stores both session-centric and bookmark-centric copies eagerly.
- Improvement path: Normalize storage and derive lookup tables lazily or during startup hydration.

## Fragile Areas

**Bookmark/storage consistency boundary:**
- Files: `background.js` (`createBookmarkArchive`, `importBookmarksAsSession`, `updateArchiveItem`, `deleteArchiveItem`, `bulkDeleteArchiveItems`)
- Why fragile: Each mutation spans multiple bookmark API calls plus one or more `chrome.storage.local` writes, with no rollback or transaction boundary.
- Safe modification: Centralize all bookmark+storage mutations behind one repository/service layer and add invariants/reconciliation checks after writes.
- Test coverage: No automated tests exercise these flows.

**Concurrent background mutations:**
- Files: `background.js`
- Why fragile: Most handlers use read-modify-write cycles over full arrays/objects (`getStoredArray()` / `getStoredObject()` then `storage.local.set()`), so overlapping operations can lose updates.
- Safe modification: Serialize writes through a mutation queue or optimistic-lock/versioned writes.
- Test coverage: No concurrency or overlap tests exist.

**Cross-device sync model:**
- Files: `background.js` (`getDeviceId`, `syncNow`), `dashboard.js` (`handleSyncNow`)
- Why fragile: Sync identity is derived from bookmark folder IDs, there are no tombstones, no conflict handling, and no schema versioning for synced records.
- Safe modification: Introduce stable UUIDs per session, a sync manifest, and delete markers before extending the feature further.
- Test coverage: No tests cover multi-device or conflict scenarios.

**Search/filter/render pipeline for large libraries:**
- Files: `dashboard.js` (`getArchiveView`, `matchesArchiveItem`, `buildArchiveHaystack`, `renderArchiveExplorer`)
- Why fragile: Filtering repeatedly walks every session and item, then rebuilds DOM from scratch; performance cliffs appear as the library grows.
- Safe modification: Cache normalized search fields, separate data transforms from rendering, and profile before adding more library features.
- Test coverage: No performance or large-fixture tests exist.

## Scaling Limits

**Local storage footprint grows with every saved tab and AI summary:**
- Current capacity: Not measured in code. Each session item is duplicated across `savedSessions` and `bookmarkMetadata`, and draft items are stored as full snapshots.
- Limit: Large libraries with descriptions, summaries, and tags will increase write cost and storage size faster than tab count alone suggests.
- Scaling path: Store canonical item records once, split large datasets into keyed chunks, and compress/archive inactive sessions.

**Sync quota headroom is thin for many sessions or long URL lists:**
- Current capacity: The code trims oversized per-session payloads toward an ~8k JSON target but does not manage the total `chrome.storage.sync` budget or stale keys.
- Limit: Session count, URL length, and uncollected sync keys can hit per-item and total sync quotas quickly.
- Scaling path: Add quota-aware chunking, manifest-based sync, stale-key cleanup, and conflict/tombstone support.

## Dependencies at Risk

**Chrome bookmark node IDs:**
- Risk: Local bookmark folder IDs are treated as durable application identifiers and sync keys even though they are only stable inside one browser profile.
- Impact: Cross-device sync collisions, missed imports, and hard-to-repair identity bugs.
- Migration plan: Introduce a stable UUID for each session and keep bookmark IDs as local implementation details only.

**Google Gemini REST API:**
- Risk: AI behavior depends on user-provided API keys, user-entered model names, and duplicated request code in two files.
- Impact: AI fill and import-time enrichment can fail or diverge independently.
- Migration plan: Centralize the Gemini client, validate model names, and treat AI as an optional adapter behind one internal interface.

## Missing Critical Features

**Stable sync identity and deletion tracking:**
- Problem: Cross-device sync has no session UUIDs, tombstones, or conflict resolution.
- Blocks: Reliable multi-device behavior and safe expansion of sync features.

**Data repair/reconciliation tooling:**
- Problem: The extension has no built-in way to rebuild `savedSessions` from bookmarks, prune orphaned metadata, or report bookmark/storage divergence.
- Blocks: Safe recovery from partial failures and support/debug workflows.

**Automated integration coverage for core extension flows:**
- Problem: There is no automated test harness for save/import/delete/edit/sync/AI queue behavior.
- Blocks: Safe modularization of `dashboard.js` and `background.js`.

## Test Coverage Gaps

**Bookmark, sync, and AI workflows:**
- What's not tested: `createBookmarkArchive()`, `importBookmarksAsSession()`, `updateArchiveItem()`, `deleteArchiveItem()`, `bulkDeleteArchiveItems()`, `syncNow()`, and the AI enrichment queue.
- Files: `background.js`
- Risk: Storage/bookmark drift, sync regressions, and quota edge cases can ship unnoticed.
- Priority: High

**UI state transitions and rendering behavior:**
- What's not tested: Draft capture, review/save phase changes, archive filtering, bulk-selection flows, AI modal behavior, and sync status updates.
- Files: `dashboard.js`, `dashboard.html`, `styles.css`
- Risk: Regressions in the main user workflow are only caught manually.
- Priority: High

**The only checked-in test file copies logic instead of importing it:**
- What's not tested: Whether the production implementations in `background.js` stay aligned with the duplicated helpers in `tests/test_dedup.js`.
- Files: `tests/test_dedup.js`, `background.js`
- Risk: The test suite can keep passing while production code changes underneath it.
- Priority: Medium

**Large-library and concurrent-mutation scenarios:**
- What's not tested: High-tab-count drafts, many-session libraries, overlapping background writes, and storage listener churn.
- Files: `background.js`, `dashboard.js`
- Risk: Performance cliffs and lost-update bugs will only appear under real usage volume.
- Priority: Medium

---

*Concerns audit: 2026-04-18*

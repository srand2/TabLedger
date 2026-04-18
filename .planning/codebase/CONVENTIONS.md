# Coding Conventions

**Analysis Date:** 2026-04-18

## Naming Patterns

**Files:**
- Use lowercase descriptive runtime filenames at repo root for extension entry points: `background.js`, `dashboard.js`, `popup.js`, `styles.css`, `manifest.json`.
- Place standalone regression scripts under `tests/` with `test_*.js` names. Current example: `tests/test_dedup.js`.

**Functions:**
- Use camelCase names with verb prefixes that signal role. `dashboard.js` and `background.js` consistently use `handle*`, `render*`, `normalize*`, `build*`, `get*`, `set*`, `clear*`, `toggle*`, and `is*` forms such as `handleSaveBookmarks`, `renderArchiveExplorer`, `normalizeSettings`, `buildDefaultSessionName`, `getArchiveView`, and `isAiRequestAborted`.
- Prefix event handlers with `handle` in `dashboard.js`; reserve `render*` for DOM redraws, `normalize*` and `clean*` for data coercion, and `validate*` for boundary checks in `background.js`.
- Use noun-style names for shared registries and caches in `dashboard.js`: `state`, `elements`, `capabilities`, `ICONS`.

**Variables:**
- Use camelCase for locals and state keys in `dashboard.js`, including long descriptive names such as `bulkAiCurrentItemId`, `selectedArchiveItemKeys`, and `importEnrichmentControlPaused`.
- Use UPPER_SNAKE_CASE for storage keys, defaults, limits, and timeouts in `dashboard.js` and `background.js`, for example `DRAFT_KEY`, `SETTINGS_KEY`, `DEFAULT_SETTINGS`, and `AI_ENRICHMENT_REQUEST_TIMEOUT_MS`.
- Prefer constant lookup objects over repeated string literals: `FIELD_SOURCES` in `dashboard.js`, `TRACKING_PARAMS` in `background.js`, and `ICONS` in `dashboard.js`.

**Types:**
- No TypeScript or runtime schema library is present in `background.js`, `dashboard.js`, or `popup.js`.
- Data shapes are enforced by validators and normalizers instead of declared types: `validatePayload`, `getStoredObject`, and `getStoredArray` in `background.js`; `normalizeSettings`, `normalizeDraftItem`, `normalizeArchiveSession`, and `normalizeArchiveItem` in `dashboard.js`.

## Code Style

**Formatting:**
- No formatter config is checked in. `.prettierrc*`, `eslint.config.*`, `biome.json`, `tsconfig.json`, and `jsconfig.json` are not detected at repo root.
- Follow the observed style in `dashboard.js`, `background.js`, `popup.js`, and `tests/test_dedup.js`: 2-space indentation, semicolonless statements, double-quoted strings, and compact early returns for guards.
- Break long objects and conditionals across lines instead of compressing them. This is the dominant pattern in `dashboard.js` and `background.js`.

**Linting:**
- No lint config is checked in, so conventions are enforced by repetition rather than tooling.
- Defensive coercion is the main substitute for static checks. `dashboard.js` and `background.js` repeatedly use `String(...)`, `Boolean(...)`, `Array.isArray(...)`, `typeof value === "object"`, and `instanceof Error` before branching.

## Import Organization

**Order:**
1. No ESM or CommonJS imports are used in `background.js`, `dashboard.js`, or `popup.js`.
2. Each runtime script aliases the browser API at the top with `const extensionApi = globalThis.browser ?? chrome;`.
3. Browser globals such as `document`, `window`, `fetch`, `URL`, `Blob`, and `AbortController` are used directly in `dashboard.js`, `background.js`, and `popup.js`.

**Path Aliases:**
- Not used. The codebase is organized as flat root scripts plus `tests/test_dedup.js`.

## State Management

**Dashboard state:**
- Keep UI state in one top-level mutable `state` object in `dashboard.js`. It owns draft items, archive filters, current phase, selected sessions, AI progress, and settings.
- Update collections by explicit reassignment with `map`, `filter`, spreads, and `new Set(...)` patterns instead of helper libraries. See `updateItem`, `updateDraftField`, `renameCategory`, `toggleCategory`, `clearAiRequest`, and `clearAiAbortController` in `dashboard.js`.
- Persist user-facing state explicitly with `persistDraft`, `persistSettings`, and `clearDraftState` in `dashboard.js`; persistence targets `chrome.storage.local`.

**DOM organization:**
- Cache DOM nodes once in the `elements` object near the top of `dashboard.js`, then reuse those references in handlers and render functions.
- Use manual redraws rather than fine-grained binding. `dashboard.js` calls `render()` for draft state and `renderArchiveExplorer()` for library state after mutations.
- Bind events centrally in `bindEvents()` inside `dashboard.js` instead of attaching handlers inline across the file.

**Background state:**
- Treat `background.js` as the persistence and service layer. Storage reads and writes flow through `getStoredObject`, `getStoredArray`, `getStoredSettings`, and other top-level helpers.
- Keep cross-request service state in file-scoped variables only when workflows span multiple async steps. AI queue control in `background.js` uses `aiEnrichmentDrainPromise`, `aiEnrichmentCurrentController`, `aiEnrichmentCurrentSessionId`, and `aiEnrichmentInterruptReason`.

## Error Handling

**Patterns:**
- Throw plain `Error` instances with user-readable messages inside service and validation helpers in `background.js`, including `validatePayload`, `ensureArchiveRoot`, `deleteArchiveItem`, and `callGeminiApi`.
- Normalize background failures into a consistent RPC envelope inside `extensionApi.runtime.onMessage` in `background.js`: success branches return `{ ok: true, result }`, failure branches return `{ ok: false, error }`.
- Catch UI-side async failures in `dashboard.js`, log them with `console.error(...)`, and surface the final copy through `setStatus(...)` or `setSyncStatus(...)`.
- Use fallback helpers rather than silent coercion for user-facing operations. `dashboard.js` relies on `getErrorMessage`, `createGeminiRequestError`, `normalizeSettings`, and `getHostname`.
- Swallow cleanup-only failures deliberately with ignored catch bindings like `_error` in `background.js` when bookmark cleanup should not block storage repair.

## Logging

**Framework:** `console`

**Patterns:**
- Use `console.error(...)` for exceptional paths only in `dashboard.js` and `background.js`. No debug logger, log levels, or telemetry abstraction is present.
- Keep user-facing copy separate from console messages. `dashboard.js` pairs `console.error("Failed to save bookmarks", error)` with `setStatus(...)`; `background.js` pairs `console.error(...)` with `sendResponse({ ok: false, error })`.

## Comments

**When to Comment:**
- Comment only when intent or constraints are non-obvious. Examples include SVG usage notes in `dashboard.js`, dedup algorithm steps in `background.js`, and section dividers such as `// ── Import ──`, `// ── Sync ──`, and `// ── AI enrichment queue ──`.
- Most straightforward handlers in `dashboard.js`, `background.js`, and `popup.js` are left uncommented and rely on descriptive names instead.

**JSDoc/TSDoc:**
- Not used in `background.js`, `dashboard.js`, `popup.js`, or `tests/test_dedup.js`.

## Function Design

**Size:**
- The codebase favors many named top-level helpers inside very large script files. `dashboard.js` and `background.js` each contain dozens of top-level functions rather than nested closures or extracted modules.
- Keep pure helpers near orchestration flows instead of moving them to shared utilities. Examples in `background.js` include `normalizeArchiveUrl`, `getUniqueUrls`, `scoreItemEnrichment`, and `buildArchiveItemsForSave`.

**Parameters:**
- Pass plain objects at boundary crossings and primitives for local helpers. `background.js` uses payload objects for `createBookmarkArchive(payload)`, `deleteArchiveItem(payload)`, and `importBookmarksAsSession({ folderId = null, useAi = false } = {})`.
- Use default parameters for optional behavior rather than overloaded argument parsing. Examples include `openDashboard(intent = {})` in `background.js` and `callGeminiJsonPrompt(..., temperature = 0.2, signal = null)` in `dashboard.js`.

**Return Values:**
- Pure helpers in `dashboard.js` and `background.js` return normalized primitives or plain objects, such as `normalizeSettings`, `groupByCategory`, and `getUniqueUrls`.
- Long-running UI helpers return structured result objects when callers need more than success/failure. `runAiFillForItem` and `runAiFillForArchiveItem` in `dashboard.js` return objects like `{ ok, changed, aborted }`.
- Cross-script communication uses a consistent response shape across `popup.js`, `dashboard.js`, and `background.js`: inspect `response?.ok`, then read either `result` or `error`.

## Module Design

**Exports:**
- No `export` or `import` syntax is used. `manifest.json`, `dashboard.html`, and `popup.html` load standalone scripts directly.
- Shared logic is duplicated instead of imported when tests need it. `normalizeArchiveUrl`, `getUniqueUrls`, `scoreItemEnrichment`, and `buildArchiveItemsForSave` exist in both `background.js` and `tests/test_dedup.js`.

**Barrel Files:**
- Not used. No index files or module directories are present.

## Recurring Patterns

**UI workflow pattern:**
- `dashboard.js` repeats a common async sequence for user actions: guard clause, `setBusy(...)` or status update, async Chrome API call or `runtime.sendMessage`, storage persistence or reload, `render()` or `renderArchiveExplorer()`, then final success or error copy.

**RPC pattern:**
- `popup.js` and `dashboard.js` do not manipulate bookmarks directly. They send typed messages such as `open-dashboard`, `create-bookmark-archive`, `update-archive-item`, `import-bookmarks`, and `sync-now` to `background.js`.

**Normalization-first pattern:**
- Values are normalized before persistence or comparison. `dashboard.js` uses `cleanCategory`, `normalizeTags`, `normalizeSettings`, and `normalizeArchiveFieldSources`; `background.js` uses `normalizeArchiveUrl`, `normalizeStringList`, and `normalizeArchiveFieldSources`.

**Cancelable AI pattern:**
- AI flows in `dashboard.js` and `background.js` pair request tokens with `AbortController`, then reject stale responses through `isCurrentAiRequest`, `clearAiRequest`, `clearAiAbortController`, and queue-control helpers.

---

*Convention analysis: 2026-04-18*

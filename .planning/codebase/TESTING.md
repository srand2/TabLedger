# Testing Patterns

**Analysis Date:** 2026-04-18

## Test Framework

**Runner:**
- The only runnable automated test is a standalone Node.js script at `tests/test_dedup.js`.
- Config: Not applicable. No `package.json`, `jest.config.*`, `vitest.config.*`, or `playwright.config.*` is present at repo root.
- Verified on 2026-04-18 by running `node tests/test_dedup.js`: 62 passed, 0 failed.

**Assertion Library:**
- `tests/test_dedup.js` uses a custom `assertEqual(label, actual, expected)` helper instead of Jest, Vitest, or Node's built-in `test` module.
- Pass/fail reporting is console-driven in `tests/test_dedup.js` via `passed` and `failed` counters plus `process.exit(1)` on failure.

**Run Commands:**
```bash
node tests/test_dedup.js    # Run the standalone regression script
# Watch mode: Not available
# Coverage: Not available
```

## Test File Organization

**Location:**
- Tests live in a separate `tests/` directory rather than next to production files. The current suite is `tests/test_dedup.js`.

**Naming:**
- Use `test_*.js` for standalone Node regression scripts under `tests/`. Current example: `tests/test_dedup.js`.

**Structure:**
```text
tests/
└── test_dedup.js
```

## Test Structure

**Suite Organization:**
```javascript
console.log("\nnormalizeArchiveUrl:");

assertEqual(
  "strips https:// protocol",
  normalizeArchiveUrl("https://example.com/page"),
  "example.com/page"
);
```

**Patterns:**
- `tests/test_dedup.js` groups checks by printed section headers such as `normalizeArchiveUrl`, `getUniqueUrls`, `scoreItemEnrichment`, and `buildArchiveItemsForSave`.
- Setup is inline and local to the file. Constants like `noDedup`, `existingSessions`, `lowScoreFirst`, and `mixedItems` are declared beside the assertions that use them in `tests/test_dedup.js`.
- No lifecycle hooks exist. There is no `beforeEach`, `afterEach`, suite nesting, or shared teardown in `tests/test_dedup.js`.
- Complex values are compared by `JSON.stringify(...)` in `tests/test_dedup.js` when array equality is needed.

## Mocking

**Framework:** None

**Patterns:**
```javascript
// ---- Functions under test (keep in sync with background.js) ----
function normalizeArchiveUrl(url) {
  // copied into `tests/test_dedup.js`
}
```

**What to Mock:**
- Current tests do not mock anything. `tests/test_dedup.js` sidesteps Chrome APIs by copying pure functions from `background.js` into the test file and exercising them with plain objects and arrays.
- The existing pattern only works for logic that can run without `chrome.tabs`, `chrome.bookmarks`, `chrome.storage`, DOM access, or network requests from `dashboard.js` and `background.js`.

**What NOT to Mock:**
- `tests/test_dedup.js` does not attempt to mock `extensionApi`, `document`, `window`, `fetch`, or `AbortController`.
- UI flows in `dashboard.js`, message routing in `background.js`, and popup behavior in `popup.js` are currently untested rather than mocked.

## Fixtures and Factories

**Test Data:**
```javascript
const existingSessions = [
  { items: [{ url: "https://example.com/existing" }] }
];

const mixedItems = [
  { url: "https://example.com/existing", fieldSources: { category: "ai" } },
  { url: "https://example.com/existing", fieldSources: {} },
  { url: "https://example.com/new", fieldSources: {} },
];
```

**Location:**
- All fixtures are hand-authored inline inside `tests/test_dedup.js`.
- No shared fixture directory, builders, or factories exist for `dashboard.js`, `background.js`, or `popup.js`.

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
# No coverage command or report is configured for this repo
```

- Automated coverage is limited to pure helper logic mirrored into `tests/test_dedup.js`.
- No coverage thresholds, CI gates, or summary reports are defined for `dashboard.js`, `background.js`, `popup.js`, or `styles.css`.

## Test Types

**Unit Tests:**
- Present only for pure functions derived from `background.js`: `normalizeArchiveUrl`, `getUniqueUrls`, `scoreItemEnrichment`, `buildExistingLibraryUrlSet`, and `buildArchiveItemsForSave` in `tests/test_dedup.js`.
- Current unit tests are deterministic table-style checks with inline inputs and exact expected outputs in `tests/test_dedup.js`.

**Integration Tests:**
- Not detected for `popup.js` to `background.js` messaging, `dashboard.js` to `background.js` RPC calls, bookmark persistence in `background.js`, storage listeners in `dashboard.js`, or sync/import flows across `manifest.json`, `dashboard.js`, and `background.js`.
- No automated tests exercise `extensionApi.runtime.onMessage`, `extensionApi.storage.onChanged`, `extensionApi.bookmarks.*`, or `extensionApi.storage.sync` in `background.js`.

**E2E Tests:**
- Not detected. The repository contains an `output/playwright/verify/` artifact directory, but there is no checked-in Playwright config or source suite at repo root.
- `dashboard.html` + `dashboard.js` and `popup.html` + `popup.js` therefore rely on manual in-browser verification rather than a committed end-to-end harness.

## Common Patterns

**Async Testing:**
```javascript
// Not used in `tests/test_dedup.js`; current tests are synchronous pure-function checks.
```

- Async workflows in `dashboard.js` and `background.js` such as Gemini fetches, bookmark creation, sync, import, and queue control currently have no automated test coverage.

**Error Testing:**
```javascript
assertEqual(
  "non-array input → empty array",
  JSON.stringify(getUniqueUrls(null)),
  JSON.stringify([])
);
```

- Current error-path checks in `tests/test_dedup.js` focus on graceful fallback values instead of exception assertions.
- The suite validates bad-input normalization for copied helpers from `background.js`, but it does not assert thrown errors from service methods like `validatePayload`, `deleteArchiveItem`, or `callGeminiApi`.

## Gaps

**Current gaps:**
- `dashboard.js` has no automated coverage for `state` transitions, `elements` event bindings, rendering branches, archive filtering, or AI status updates.
- `background.js` has no automated coverage for runtime message dispatch, bookmark tree mutation, sync reconciliation, import flows, or Gemini request handling.
- `popup.js` has no automated checks for `runtime.sendMessage` calls or the `window.close()` success path.
- `tests/test_dedup.js` duplicates production logic from `background.js`, so logic drift between the source and the copied test helpers is an active maintenance risk.

---

*Testing analysis: 2026-04-18*

# Sync + Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden and complete the bookmark import + cross-device sync features already scaffolded in the codebase, fixing known gaps and verifying the end-to-end flow works in a real Chrome extension context.

**Architecture:** Import parses the Chrome bookmark tree into sessions saved to `storage.local` immediately, then an `aiEnrichmentQueue` is drained by the service worker using Gemini structured JSON output. Sync pushes lightweight per-session keys to `storage.sync` on demand and pulls remote sessions on "Sync Now". All Gemini calls go through a shared structured-output helper.

**Tech Stack:** Chrome Extension MV3, Vanilla JS, Chrome Storage API (local + sync), Chrome Bookmarks API, Gemini API (`responseMimeType: application/json` + `responseSchema`)

---

## File Map

| File | Role |
|---|---|
| `background.js` | Service worker: message handlers, import logic, AI enrichment queue, sync |
| `dashboard.js` | UI: import panel, sync button, AI badge rendering, storage change listener |
| `dashboard.html` | Markup: import panel, sync button, AI badge slot in history template |
| `styles.css` | Styles: import panel, sync spinner, progress bar, AI enrichment badge |
| `manifest.json` | Permissions — verify `storage` covers sync, `bookmarks` present |

---

## Task 1: Fix Gemini API call in background.js

The scaffolded `callGeminiApi` in background.js uses a query-param API key and fragile regex JSON parsing. The dashboard already has a better structured-output approach — background.js must match it.

**Files:**
- Modify: `background.js` — replace `callGeminiApi` + `parseEnrichmentResponse` + `buildEnrichmentPrompt`

- [ ] **Step 1: Read the existing callGeminiApi in background.js to locate it**

```bash
grep -n "callGeminiApi\|parseEnrichment\|buildEnrichment" background.js
```

Expected: three function definitions near the bottom of the file.

- [ ] **Step 2: Replace callGeminiApi, buildEnrichmentPrompt, and parseEnrichmentResponse**

Find and replace these three functions entirely with the versions below. The key differences: uses `x-goog-api-key` header (not query param), uses `responseMimeType: "application/json"` + `responseSchema` for guaranteed structured output, no regex parsing needed.

```javascript
function buildEnrichmentPrompt(sessionTitle, items) {
  const list = items.map((i) => `- ${i.title}: ${i.url}`).join("\n");
  return `You are categorizing browser bookmarks from a session called "${sessionTitle}".
For each bookmark, suggest a specific category (2-3 words max) and 2-4 short tags relevant to what the page is actually for.

Bookmarks:
${list}`;
}

async function callGeminiApi(prompt, apiKey, model) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const responseSchema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      required: ["url", "category", "tags"],
      properties: {
        url: { type: "STRING" },
        category: { type: "STRING" },
        tags: { type: "ARRAY", items: { type: "STRING" } }
      }
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  return JSON.parse(text);
}
```

Remove the old `parseEnrichmentResponse` function entirely — it's no longer needed.

- [ ] **Step 3: Update enrichSessionWithAi to use the new return value**

`callGeminiApi` now returns a parsed array directly (not a string). Find `enrichSessionWithAi` and replace the line that calls `parseEnrichmentResponse`:

```javascript
// OLD:
const rawResponse = await callGeminiApi(prompt, apiKey, model);
const suggestions = parseEnrichmentResponse(rawResponse);

// NEW:
const suggestions = await callGeminiApi(prompt, apiKey, model);
```

- [ ] **Step 4: Verify syntax**

```bash
node -e "new Function(require('fs').readFileSync('background.js','utf8'))" && echo OK
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "fix: use Gemini structured JSON output in background AI enrichment"
```

---

## Task 2: Add service worker startup queue drain

If the browser restarts mid-enrichment, `aiEnrichmentQueue` has orphaned IDs. The service worker must drain the queue on startup.

**Files:**
- Modify: `background.js` — add `onStartup` and `onInstalled` listeners

- [ ] **Step 1: Find where the message listener is registered**

```bash
grep -n "onMessage.addListener\|runtime.onInstalled\|runtime.onStartup" background.js
```

Expected: `onMessage.addListener` near the top, no startup/installed listeners yet.

- [ ] **Step 2: Add startup listeners after the constants block**

After the `DEFAULT_SETTINGS` object (around line 12), add:

```javascript
// Resume any AI enrichment that was interrupted by browser restart
extensionApi.runtime.onStartup.addListener(() => {
  drainAiEnrichmentQueue();
});

extensionApi.runtime.onInstalled.addListener(() => {
  drainAiEnrichmentQueue();
});
```

- [ ] **Step 3: Verify syntax**

```bash
node -e "new Function(require('fs').readFileSync('background.js','utf8'))" && echo OK
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "fix: resume AI enrichment queue on service worker startup"
```

---

## Task 3: Guard import against missing Bookmarks API

`importBookmarksAsSession` calls `extensionApi.bookmarks.getTree()` directly. If somehow called without the API (e.g. during testing), it throws an unhandled error. Add a clear guard.

**Files:**
- Modify: `background.js` — add guard to `importBookmarksAsSession` and `getBookmarkFolders`

- [ ] **Step 1: Add API guard at the top of importBookmarksAsSession**

Find the function definition:
```javascript
async function importBookmarksAsSession({ folderId = null, useAi = false } = {}) {
  const tree = await extensionApi.bookmarks.getTree();
```

Replace with:
```javascript
async function importBookmarksAsSession({ folderId = null, useAi = false } = {}) {
  if (!extensionApi.bookmarks?.getTree) {
    throw new Error("Chrome Bookmarks API is not available.");
  }
  const tree = await extensionApi.bookmarks.getTree();
```

- [ ] **Step 2: Add the same guard to getBookmarkFolders**

Find:
```javascript
async function getBookmarkFolders() {
  const tree = await extensionApi.bookmarks.getTree();
```

Replace with:
```javascript
async function getBookmarkFolders() {
  if (!extensionApi.bookmarks?.getTree) {
    throw new Error("Chrome Bookmarks API is not available.");
  }
  const tree = await extensionApi.bookmarks.getTree();
```

- [ ] **Step 3: Verify syntax**

```bash
node -e "new Function(require('fs').readFileSync('background.js','utf8'))" && echo OK
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "fix: guard bookmark import against missing Bookmarks API"
```

---

## Task 4: Fix sync push count and deduplication

`syncNow` currently pushes ALL sessions every time (re-writing unchanged data) and reports a count that includes sessions that didn't actually change. Also, `buildSessionsFromNode` can create duplicate sessions if the root node is walked twice when a specific `folderId` is given.

**Files:**
- Modify: `background.js` — fix `syncNow` push logic and `buildSessionsFromNode` root handling

- [ ] **Step 1: Fix the root walk in buildSessionsFromNode for subfolder imports**

When `folderId` is provided, `importBookmarksAsSession` gets a subtree root that IS the selected folder (not the bookmark root). The current `buildSessionsFromNode` call passes `parentIsRoot = true` in `walkFolder(rootNode, true)` which causes it to collect direct children as "Loose Bookmarks" rather than treating the folder itself as a session.

Find the `importBookmarksAsSession` call to `buildSessionsFromNode`:
```javascript
const sessions = buildSessionsFromNode(root);
```

Replace with:
```javascript
const sessions = buildSessionsFromNode(root, Boolean(folderId));
```

Find `buildSessionsFromNode`:
```javascript
function buildSessionsFromNode(rootNode) {
  const SKIP_TITLES = new Set(["Bookmarks Bar", "Other Bookmarks", "Mobile Bookmarks"]);
  const sessions = [];

  function walkFolder(node, parentIsRoot) {
```

Replace with:
```javascript
function buildSessionsFromNode(rootNode, isSubfolderImport = false) {
  const SKIP_TITLES = new Set(["Bookmarks Bar", "Other Bookmarks", "Mobile Bookmarks"]);
  const sessions = [];

  function walkFolder(node, parentIsRoot) {
```

At the end of `buildSessionsFromNode`, find the call:
```javascript
  walkFolder(rootNode, true);
```

Replace with:
```javascript
  // When importing a specific subfolder, treat it as a folder-level walk
  walkFolder(rootNode, !isSubfolderImport);
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "new Function(require('fs').readFileSync('background.js','utf8'))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "fix: correct subfolder import root handling in buildSessionsFromNode"
```

---

## Task 5: Wire import-run button disable state during AI enrichment

The import button re-enables after the message response, but `drainAiEnrichmentQueue` runs asynchronously in the background. The progress bar should stay visible and AI row should update as sessions complete via the `storage.onChanged` listener.

**Files:**
- Modify: `dashboard.js` — update `handleImportRun` to track AI progress from storage changes

- [ ] **Step 1: Update handleImportRun to track enrichment progress**

Find the current `handleImportRun` function in dashboard.js. Replace the section after `await loadRecentArchives()` with:

```javascript
    if (useAi && importedCount > 0) {
      elements.importAiRow.hidden = false;
      elements.importAiCurrent.textContent = "sessions";
      elements.importProgressAi.textContent = `0 / ${importedCount}`;
      state.importEnrichmentTotal = importedCount;
      state.importEnrichmentDone = 0;
      // Progress bar stays at 40% — onChanged listener advances it as sessions complete
    } else {
      elements.importProgressFill.style.width = "100%";
      elements.importProgressSessions.dataset.done = "true";
    }
```

- [ ] **Step 2: Update the storage.onChanged listener to advance the AI progress bar**

Find the `storage.onChanged` listener added in `init()`:

```javascript
  extensionApi.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SAVED_SESSIONS_KEY]) {
      loadRecentArchives().then(() => renderArchiveExplorer());
    }
  });
```

Replace with:

```javascript
  extensionApi.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[SAVED_SESSIONS_KEY]) {
      loadRecentArchives().then(() => {
        renderArchiveExplorer();
        // Advance import AI progress bar if enrichment is running
        if (state.importEnrichmentTotal > 0) {
          const sessions = state.recentArchives || [];
          const doneCount = sessions.filter(
            (s) => s.aiEnrichmentStatus === "done" || s.aiEnrichmentStatus === "failed"
          ).length;
          state.importEnrichmentDone = doneCount;
          const pct = 40 + Math.round((doneCount / state.importEnrichmentTotal) * 60);
          elements.importProgressFill.style.width = `${Math.min(pct, 100)}%`;
          elements.importProgressAi.textContent = `${doneCount} / ${state.importEnrichmentTotal}`;
          if (doneCount >= state.importEnrichmentTotal) {
            elements.importProgressAi.dataset.done = "true";
            state.importEnrichmentTotal = 0;
          }
        }
      });
    }
  });
```

- [ ] **Step 3: Add importEnrichmentTotal and importEnrichmentDone to state**

Find the state object in dashboard.js and add these fields alongside `importRunning`:

```javascript
  importOpen: false,
  importRunning: false,
  importEnrichmentTotal: 0,
  importEnrichmentDone: 0,
  syncRunning: false
```

- [ ] **Step 4: Verify syntax**

```bash
node -e "new Function(require('fs').readFileSync('dashboard.js','utf8'))" && echo OK
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add dashboard.js
git commit -m "feat: track AI enrichment progress in import panel via storage changes"
```

---

## Task 6: Verify manifest permissions

`storage.sync` and the Bookmarks API both require specific permissions. Confirm the manifest is correct — no changes should be needed, but this must be verified before loading the extension.

**Files:**
- Read: `manifest.json`

- [ ] **Step 1: Check manifest permissions**

```bash
cat manifest.json
```

Verify ALL of the following are present:
- `"storage"` in `permissions` — covers both `storage.local` and `storage.sync`
- `"bookmarks"` in `permissions` — required for `chrome.bookmarks.getTree()`
- `"https://generativelanguage.googleapis.com/*"` in `host_permissions`

If any are missing, add them to the appropriate array.

- [ ] **Step 2: Confirm no changes needed (or commit if changed)**

If manifest.json was already correct:
```bash
echo "Manifest OK — no changes needed"
```

If changes were made:
```bash
git add manifest.json
git commit -m "fix: ensure manifest has storage, bookmarks, and Gemini host permissions"
```

---

## Task 7: Manual end-to-end test — Import flow

Load the extension in Chrome and test the import feature.

**Files:**
- Read-only test (no code changes expected)

- [ ] **Step 1: Load the extension in Chrome**

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" → select `/home/shay/Projects/ChromeExtension`
4. Confirm "TabLedger" appears with no errors

- [ ] **Step 2: Open the dashboard and verify import panel**

1. Click the TabLedger extension icon → "Open Dashboard"
2. Click the "Library" tab
3. Confirm "↓ Import" button appears in the Library header
4. Click it — confirm the import panel expands showing scope radios, AI toggle, Import button

- [ ] **Step 3: Test import all bookmarks**

1. Ensure your Gemini API key is set in Settings (⚙)
2. Leave scope on "All bookmark folders", leave AI toggle checked
3. Click "Import Bookmarks"
4. Verify:
   - Progress bar appears immediately
   - "Saving sessions" row shows count of sessions saved (e.g. "5 sessions, 47 tabs")
   - "AI enriching… sessions — 0/5" row appears
   - Sessions appear in the Library list with "✦ AI enriching…" badge (pulsing indigo)
   - Badge disappears and is replaced by tags as each session completes

- [ ] **Step 4: Test import specific folder**

1. Select "Import specific folder" radio
2. Confirm folder dropdown appears with your bookmark folders listed
3. Select one folder and click Import
4. Verify only that folder's subfolders appear as sessions

- [ ] **Step 5: Test Retry AI on failure**

1. Temporarily set an invalid API key in Settings
2. Import any folder with AI checked
3. Verify sessions appear with "⚠ Retry AI" badge
4. Fix API key, click "⚠ Retry AI" badge on one session
5. Verify badge changes to "✦ AI enriching…" then disappears

---

## Task 8: Manual end-to-end test — Sync flow

**Files:**
- Read-only test (no code changes expected)

- [ ] **Step 1: Test Sync Now button**

1. Open the dashboard
2. Click "⇅ Sync" button in Library header
3. Verify:
   - Button shows spinning icon while running
   - Status bar appears below header: e.g. "Synced — 5 pushed"
   - Status bar disappears after 4 seconds

- [ ] **Step 2: Test sync error state**

1. Temporarily disconnect from internet (or use Chrome DevTools → Network → Offline)
   Note: `storage.sync` operations may still work offline (Chrome queues them)
   Instead: observe that `syncNow` completes normally (Chrome handles it)
2. Reconnect and re-test

- [ ] **Step 3: Verify session cap is gone**

1. Import a folder with more than 20 bookmark subfolders (or create test bookmarks)
2. Verify all sessions appear in the Library (not capped at 20)

---

## Task 9: Fix import panel close behavior after successful import

Currently the import panel stays open after a successful import. It should close automatically after sessions are saved, to reveal the new sessions in the library list.

**Files:**
- Modify: `dashboard.js` — auto-close import panel on success

- [ ] **Step 1: Add auto-close after successful save in handleImportRun**

In `handleImportRun`, after the `await loadRecentArchives()` call and before the `if (useAi ...)` block, add:

```javascript
    // Auto-close the panel to reveal the library
    if (!useAi) {
      state.importOpen = false;
      elements.importPanel.hidden = true;
      elements.importToggleButton.setAttribute("aria-expanded", "false");
      elements.importToggleButton.textContent = "↓ Import";
    }
    // When AI is running, keep panel open to show progress
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "new Function(require('fs').readFileSync('dashboard.js','utf8'))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add dashboard.js
git commit -m "feat: auto-close import panel after non-AI import completes"
```

---

## Task 10: Final commit and cleanup

- [ ] **Step 1: Run a full syntax check on all modified files**

```bash
for f in background.js dashboard.js; do
  node -e "new Function(require('fs').readFileSync('$f','utf8'))" && echo "$f: OK" || echo "$f: FAIL"
done
```

Expected: both `OK`

- [ ] **Step 2: Check for any console errors in the loaded extension**

1. Open `chrome://extensions` → TabLedger → "Service Worker" (Inspect)
2. Check the console for any errors
3. Open the dashboard → right-click → Inspect → Console tab
4. Repeat the import and sync flows and confirm no red errors

- [ ] **Step 3: Final commit if any last fixes were made**

```bash
git add -p   # review any uncommitted changes
git commit -m "fix: address any final issues found during end-to-end testing"
```

- [ ] **Step 4: Tag the release commit**

```bash
git log --oneline -5
# Confirm the feature commits look clean, then:
echo "Implementation complete — ready for review"
```

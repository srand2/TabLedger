# Plan B: Guided Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-form dashboard with a 3-phase guided workflow (Capture → Review → Save) that reduces cognitive load, auto-triggers AI fill on capture, moves the Library Explorer to a dedicated tab, and adds per-tab completion indicators.

**Architecture:** `state.phase` (`"capture" | "review" | "save"`) is written as a `data-phase` attribute on the app shell in `render()`. CSS rules keyed on this attribute show/hide controls per phase with no JS branching. A `.view-tab-bar` with Draft/Library buttons replaces the side-by-side resizable layout — clicking a tab applies a class to `#layout-panel` that hides the inactive pane. Per-tab completion (`"pending" | "ai" | "user"`) is derived at render time from existing `fieldSources` tracking. Auto-AI-fill fires after a successful `scanTabs()` when a Gemini API key is configured, scheduled via `setTimeout(0)` so the scan's `finally` block runs first.

**Tech Stack:** Vanilla JS, Chrome Extension Manifest V3, CSS custom properties, `chrome.storage.local`

---

## File Map

| File | Changes |
|---|---|
| `dashboard.html` | Add phase strip, phase-nav buttons, session/filter wrappers, view tab bar, completion dot in tab template |
| `dashboard.js` | Add `state.phase`, `state.activeView`, new elements, phase transitions, view tab switching, completion helper |
| `styles.css` | Phase strip styles, phase-aware visibility rules, view tab bar styles, layout view modes, completion dot styles |
| `popup.html` | Update copy and button label for single primary CTA |

---

## Task 1: Phase State + Phase Strip UI

**Files:**
- Modify: `dashboard.html` (add `#phase-strip` inside `.controls-panel`)
- Modify: `dashboard.js` (add `state.phase`, `elements.phaseStrip`, `updatePhaseStrip()`)
- Modify: `styles.css` (phase strip CSS)

- [ ] **Step 1: Add `phase` to `state` in `dashboard.js`**

In the `state` object (around line 32), add `phase` as the last field:

```js
const state = {
  sessionName: "",
  filterQuery: "",
  archiveFilterQuery: "",
  items: [],
  skippedCount: 0,
  lastScannedAt: null,
  recentArchives: [],
  collapsedCategories: [],
  collapsedArchiveSessions: [],
  archiveFilters: {
    sessions: [],
    categories: [],
    tags: []
  },
  bulkAiRunning: false,
  editingArchiveItemKey: null,
  archiveItemEditor: null,
  libraryWidth: DEFAULT_LIBRARY_WIDTH,
  settings: { ...DEFAULT_SETTINGS },
  settingsOpen: false,
  aiRequestTokens: {},
  aiStatuses: {},
  expandedTabIds: new Set(),
  geminiApiKeyVisible: false,
  phase: "capture",             // NEW — "capture" | "review" | "save"
  activeView: "draft"           // NEW — "draft" | "library"
};
```

- [ ] **Step 2: Add `#phase-strip` to `dashboard.html` inside `.controls-panel`**

Find `<section class="panel controls-panel">`. Insert the phase strip as its first child, before `<div class="session-row">`:

```html
<section class="panel controls-panel">
  <div id="phase-strip" class="phase-strip" role="list" aria-label="Workflow progress">
    <div class="phase-step" data-phase="capture" role="listitem">
      <span class="phase-number" aria-hidden="true">1</span>
      <span class="phase-label">Capture</span>
    </div>
    <div class="phase-connector" aria-hidden="true"></div>
    <div class="phase-step" data-phase="review" role="listitem">
      <span class="phase-number" aria-hidden="true">2</span>
      <span class="phase-label">Review</span>
    </div>
    <div class="phase-connector" aria-hidden="true"></div>
    <div class="phase-step" data-phase="save" role="listitem">
      <span class="phase-number" aria-hidden="true">3</span>
      <span class="phase-label">Save</span>
    </div>
  </div>
  <div class="session-row">
    <!-- existing session-row content unchanged below -->
```

- [ ] **Step 3: Add phase strip CSS to `styles.css`**

Append after the `.settings-panel .field small a:hover` rule (around line 314):

```css
/* === Phase strip === */
.phase-strip {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.phase-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
}

.phase-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: rgba(15, 23, 42, 0.8);
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
}

.phase-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.phase-step.is-active .phase-number {
  border-color: var(--action);
  background: rgba(99, 102, 241, 0.2);
  color: #e0e7ff;
}

.phase-step.is-active .phase-label {
  color: #e0e7ff;
}

.phase-step.is-done .phase-number {
  border-color: var(--success);
  background: rgba(20, 184, 166, 0.15);
  color: #99f6e4;
}

.phase-connector {
  flex: 1;
  height: 1.5px;
  background: var(--border);
  min-width: 20px;
  max-width: 48px;
}
```

- [ ] **Step 4: Add `phaseStrip` to `elements` in `dashboard.js`**

In the `elements` object (after `historyTemplate`), add:

```js
phaseStrip: document.getElementById("phase-strip"),
```

- [ ] **Step 5: Add `updatePhaseStrip()` helper in `dashboard.js`**

Add after the `handleToggleGeminiApiKeyVisibility()` function (around line 1226):

```js
function updatePhaseStrip() {
  if (!elements.phaseStrip) {
    return;
  }

  const PHASE_ORDER = ["capture", "review", "save"];
  const currentIndex = PHASE_ORDER.indexOf(state.phase);

  elements.phaseStrip.querySelectorAll(".phase-step").forEach((step, index) => {
    step.classList.toggle("is-active", index === currentIndex);
    step.classList.toggle("is-done", index < currentIndex);
  });
}
```

- [ ] **Step 6: Call `updatePhaseStrip()` from `render()`**

In `render()`, after `applyLayoutSizing()`:

```js
  applyLayoutSizing();
  updatePhaseStrip();   // NEW
  renderCategories();
  renderArchiveExplorer();
```

- [ ] **Step 7: Manual test in Chrome**

Load the extension at `chrome://extensions`, click "TabLedger" to open the dashboard.

Expected:
- Phase strip appears at the top of the controls panel: "1 Capture  2 Review  3 Save"
- Step 1 "Capture" has indigo ring and indigo label (`.is-active`)
- Steps 2 and 3 are gray/muted

- [ ] **Step 8: Commit**

```bash
git add dashboard.html dashboard.js styles.css
git commit -m "feat: add 3-phase progress strip to dashboard"
```

---

## Task 2: Phase Navigation Buttons (Proceed to Save / Back to Review)

**Files:**
- Modify: `dashboard.html` (add 2 buttons to `.hero-actions`)
- Modify: `dashboard.js` (add to `elements`, `bindEvents`, write `data-phase` in `render`)

- [ ] **Step 1: Add phase-nav buttons to `.hero-actions` in `dashboard.html`**

Find `<div class="hero-actions">` and replace its contents:

```html
<div class="hero-actions">
  <button id="scan-all" class="primary-button">Capture All Windows</button>
  <button id="proceed-to-save" class="primary-button" type="button">
    Proceed to Save →
  </button>
  <button id="save-bookmarks" class="ghost-button" disabled>
    Save to Library
  </button>
  <button id="export-json" class="ghost-button" disabled>
    Export JSON
  </button>
  <button id="back-to-review" class="ghost-button" type="button">
    ← Back to Review
  </button>
</div>
```

- [ ] **Step 2: Add `elements` references in `dashboard.js`**

In the `elements` object, add after `toggleGeminiApiKeyVisibilityButton`:

```js
proceedToSaveButton: document.getElementById("proceed-to-save"),
backToReviewButton: document.getElementById("back-to-review"),
```

- [ ] **Step 3: Add event listeners in `bindEvents()`**

After `elements.settingsToggleButton.addEventListener(...)`, add:

```js
elements.proceedToSaveButton.addEventListener("click", () => {
  state.phase = "save";
  render();
});

elements.backToReviewButton.addEventListener("click", () => {
  state.phase = "review";
  render();
});
```

- [ ] **Step 4: Write `data-phase` on the app shell in `render()`**

In `render()`, add as the very first line:

```js
function render() {
  document.querySelector(".dashboard-shell").dataset.phase = state.phase;   // NEW
  elements.sessionNameInput.value = state.sessionName;
  // ... rest of render unchanged
```

- [ ] **Step 5: Manual test in Chrome**

Open dashboard. Open DevTools console. Run:

```js
state.phase = "save"; render();
```

Expected: `data-phase="save"` appears on `<main class="app-shell dashboard-shell">` in the Elements panel. All five hero-action buttons are visible (no CSS visibility rules yet — wired in Task 4).

Run `state.phase = "capture"; render();` to restore.

- [ ] **Step 6: Commit**

```bash
git add dashboard.html dashboard.js
git commit -m "feat: add phase navigation buttons and data-phase attribute"
```

---

## Task 3: Wrap Session Name and Filter for Independent Visibility

**Files:**
- Modify: `dashboard.html` (wrap each field in an addressable div)
- Modify: `styles.css` (add flex pass-through styles for the wrappers)

The phase CSS in Task 4 hides session name in Review and filter in Save. They need independent wrapper elements.

- [ ] **Step 1: Wrap session name label in `dashboard.html`**

Find the `<div class="session-row">` content. Wrap the session-name `<label>` in a `<div id="session-name-field">`:

Before:
```html
<div class="session-row">
  <label class="field">
    <span>Session name</span>
    <input
      id="session-name"
      type="text"
      placeholder="Incident review, research batch, sprint planning..."
    />
  </label>
  <label class="field compact-search">
```

After:
```html
<div class="session-row">
  <div id="session-name-field">
    <label class="field">
      <span>Session name</span>
      <input
        id="session-name"
        type="text"
        placeholder="Incident review, research batch, sprint planning..."
      />
    </label>
  </div>
  <label class="field compact-search">
```

- [ ] **Step 2: Wrap filter label in `dashboard.html`**

Wrap the filter `<label class="field compact-search">` in `<div id="filter-query-field">`:

Before:
```html
  <label class="field compact-search">
    <span>Filter</span>
    <input
      id="filter-query"
      type="text"
      placeholder="Search by title, URL, tag, or summary"
    />
  </label>
  <div class="summary-strip">
```

After:
```html
  <div id="filter-query-field">
    <label class="field compact-search">
      <span>Filter</span>
      <input
        id="filter-query"
        type="text"
        placeholder="Search by title, URL, tag, or summary"
      />
    </label>
  </div>
  <div class="summary-strip">
```

- [ ] **Step 3: Add flex pass-through CSS to `styles.css`**

The session-row is a flex container. The wrapper divs must behave like their inner labels so layout is unchanged. Append after the `.phase-connector` rule:

```css
/* Wrapper divs for phase-conditional session-row fields */
#session-name-field {
  flex: 1 1 auto;
  min-width: 0;
}

#filter-query-field {
  min-width: 0;
}
```

- [ ] **Step 4: Verify JS element lookups still work**

`elements.sessionNameInput = document.getElementById("session-name")` and `elements.filterQueryInput = document.getElementById("filter-query")` find by ID — the added wrapper div doesn't break them. No JS change needed.

- [ ] **Step 5: Manual test in Chrome**

Open dashboard. Verify:
- Session name and filter inputs still work (type text, see it applied)
- Layout of the session-row looks identical to before

- [ ] **Step 6: Commit**

```bash
git add dashboard.html styles.css
git commit -m "refactor: wrap session-name and filter fields for phase-aware visibility"
```

---

## Task 4: Phase-Aware CSS Visibility Rules

**Files:**
- Modify: `styles.css` (add `[data-phase]` selectors)

Three phases, three sets of rules. Each phase hides the controls irrelevant to it.

**Capture** (no draft) — only "Capture All Windows" and the empty draft state:
- Hide: `#proceed-to-save`, `#save-bookmarks`, `#export-json`, `#back-to-review`
- Hide: `.session-row`, `.toolbar-row`, `.view-tab-bar`

**Review** (editing tabs) — filter, AI fill, per-tab editing:
- Hide: `#scan-all`, `#save-bookmarks`, `#export-json`, `#back-to-review`
- Hide: `#session-name-field`

**Save** (naming + saving) — session name and save buttons:
- Hide: `#scan-all`, `#proceed-to-save`
- Hide: `#filter-query-field`, `.toolbar-row`

- [ ] **Step 1: Append phase visibility rules to `styles.css`**

Append after the `body.is-resizing-layout` rules (around line 981):

```css
/* === Phase-aware visibility === */

/* Capture: only Capture All Windows visible in hero-actions */
.dashboard-shell[data-phase="capture"] #proceed-to-save,
.dashboard-shell[data-phase="capture"] #save-bookmarks,
.dashboard-shell[data-phase="capture"] #export-json,
.dashboard-shell[data-phase="capture"] #back-to-review,
.dashboard-shell[data-phase="capture"] .session-row,
.dashboard-shell[data-phase="capture"] .toolbar-row,
.dashboard-shell[data-phase="capture"] .view-tab-bar {
  display: none;
}

/* Review: editing controls + AI fill visible, save actions hidden */
.dashboard-shell[data-phase="review"] #scan-all,
.dashboard-shell[data-phase="review"] #save-bookmarks,
.dashboard-shell[data-phase="review"] #export-json,
.dashboard-shell[data-phase="review"] #back-to-review,
.dashboard-shell[data-phase="review"] #session-name-field {
  display: none;
}

/* Save: session name + save actions visible, editing controls hidden */
.dashboard-shell[data-phase="save"] #scan-all,
.dashboard-shell[data-phase="save"] #proceed-to-save,
.dashboard-shell[data-phase="save"] #filter-query-field,
.dashboard-shell[data-phase="save"] .toolbar-row {
  display: none;
}
```

- [ ] **Step 2: Manual test — Capture phase**

Open dashboard with no existing draft (or after "Clear Draft"). Verify:
- Hero shows only "Capture All Windows"
- Controls panel shows only phase strip (no session-row, no toolbar-row)
- Empty state is visible in the draft area

- [ ] **Step 3: Manual test — Review phase**

In DevTools console: `state.phase = "review"; render();`

Verify:
- Hero shows only "Proceed to Save →"
- Session name field is hidden; filter and summary strip are visible
- "Use AI" and "Collapse All" buttons in draft heading are visible

- [ ] **Step 4: Manual test — Save phase**

In DevTools console: `state.phase = "save"; render();`

Verify:
- Hero shows "Save to Library", "Export JSON", "← Back to Review"
- Session name field is visible; filter is hidden
- toolbar-row (tip text + "Clear Draft") is hidden

- [ ] **Step 5: Restore and commit**

In DevTools: `state.phase = "capture"; render();`

```bash
git add styles.css
git commit -m "feat: phase-aware CSS visibility rules for capture/review/save phases"
```

---

## Task 5: Phase Transitions in JS

**Files:**
- Modify: `dashboard.js` (`scanTabs`, `handleSaveBookmarks`, `handleResetDraft`, `restoreDraft`)

Wire the phase state to the actual workflow actions.

- [ ] **Step 1: Advance to "review" after `scanTabs()` succeeds**

In `scanTabs()`, find:

```js
    await persistDraft();
    render();

    setStatus(
      `${state.items.length} tabs grouped into ${getAllGroups().length} categories.${...}`,
      "success"
    );
```

Change to (set phase before `render()` so the strip and visibility rules apply on first render):

```js
    await persistDraft();
    state.phase = "review";
    render();

    setStatus(
      `${state.items.length} tabs grouped into ${getAllGroups().length} categories.${state.skippedCount ? ` ${state.skippedCount} unsupported tab${state.skippedCount === 1 ? " was" : "s were"} skipped.` : ""}`,
      "success"
    );
```

- [ ] **Step 2: Reset to "capture" after `handleSaveBookmarks()` succeeds**

In `handleSaveBookmarks()`, after `await clearDraftState();`, add:

```js
    await clearDraftState();
    state.phase = "capture";   // NEW
    await loadRecentArchives();
    render();
```

- [ ] **Step 3: Reset to "capture" in `handleResetDraft()`**

```js
async function handleResetDraft() {
  await clearDraftState();
  state.phase = "capture";   // NEW
  render();
  setStatus("Cleared the current draft.", "success");
}
```

- [ ] **Step 4: Restore to "review" when a draft is loaded in `restoreDraft()`**

In `restoreDraft()`, at the end, after setting status:

```js
  if (state.items.length) {
    setStatus(`Restored ${state.items.length} tabs from the last draft.`, "success");
    state.phase = "review";   // NEW — restored draft is ready to review
  }
```

- [ ] **Step 5: Manual test — full capture-review-save flow**

1. Open dashboard with no draft → phase strip shows "Capture" active, hero shows only "Capture All Windows"
2. Click "Capture All Windows" → phase strip advances to "Review", hero shows "Proceed to Save →"
3. Click "Proceed to Save →" → phase strip shows "Save", hero shows save/export/back buttons
4. Click "← Back to Review" → returns to Review phase
5. Click "Save to Library" → phase resets to "Capture", draft is cleared

- [ ] **Step 6: Manual test — draft restoration**

With tabs captured, close and reopen the dashboard. Expected: phase is "Review" (not "Capture").

- [ ] **Step 7: Commit**

```bash
git add dashboard.js
git commit -m "feat: wire phase transitions through scan, save, and reset actions"
```

---

## Task 6: View Tab Bar (Draft / Library)

**Files:**
- Modify: `dashboard.html` (add `.view-tab-bar` between controls-panel and layout-panel)
- Modify: `dashboard.js` (add to `elements`, `bindEvents`, `render`)
- Modify: `styles.css` (tab bar styles + layout view mode styles)

- [ ] **Step 1: Add `.view-tab-bar` HTML to `dashboard.html`**

Find the closing `</section>` of `controls-panel` and the opening `<section id="layout-panel"`. Insert the tab bar between them:

```html
      </section>

      <div class="view-tab-bar" role="tablist" aria-label="View selector">
        <button
          id="view-tab-draft"
          class="view-tab"
          role="tab"
          aria-selected="true"
          aria-controls="draft-pane"
          type="button"
        >
          Draft
        </button>
        <button
          id="view-tab-library"
          class="view-tab"
          role="tab"
          aria-selected="false"
          aria-controls="library-pane"
          type="button"
        >
          Library
        </button>
      </div>

      <section id="layout-panel" class="panel layout-panel">
```

- [ ] **Step 2: Add `elements` references in `dashboard.js`**

In the `elements` object, add after `layoutResizer`:

```js
viewTabDraftButton: document.getElementById("view-tab-draft"),
viewTabLibraryButton: document.getElementById("view-tab-library"),
```

- [ ] **Step 3: Add tab click listeners in `bindEvents()`**

After `elements.layoutResizer.addEventListener(...)` lines, add:

```js
elements.viewTabDraftButton.addEventListener("click", () => {
  state.activeView = "draft";
  render();
});

elements.viewTabLibraryButton.addEventListener("click", () => {
  state.activeView = "library";
  render();
});
```

- [ ] **Step 4: Apply view state in `render()`**

In `render()`, just before `applyLayoutSizing()`, add:

```js
  // View tab state
  const isDraftView = state.activeView === "draft";
  elements.viewTabDraftButton.classList.toggle("is-active", isDraftView);
  elements.viewTabDraftButton.setAttribute("aria-selected", String(isDraftView));
  elements.viewTabLibraryButton.classList.toggle("is-active", !isDraftView);
  elements.viewTabLibraryButton.setAttribute("aria-selected", String(!isDraftView));
  elements.layoutPanel.classList.toggle("view-draft", isDraftView);
  elements.layoutPanel.classList.toggle("view-library", !isDraftView);
```

- [ ] **Step 5: Add tab bar and layout view CSS to `styles.css`**

Append after the `#filter-query-field` rule (after Task 3's additions):

```css
/* === View tab bar === */
.view-tab-bar {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(11, 18, 32, 0.7);
  align-self: flex-start;
  width: fit-content;
}

.view-tab {
  min-height: 28px;
  padding: 4px 16px;
  border-radius: 9px;
  font-size: 0.84rem;
  font-weight: 600;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.view-tab:hover:not(.is-active) {
  background: rgba(31, 41, 55, 0.6);
  color: var(--text);
}

.view-tab.is-active {
  background: rgba(31, 41, 55, 0.9);
  color: var(--text);
  border-color: var(--border);
}

/* Layout panel: show only the active view pane, full width */
.layout-panel.view-draft,
.layout-panel.view-library {
  grid-template-columns: 1fr;
}

.layout-panel.view-draft .history-column,
.layout-panel.view-draft .layout-resizer {
  display: none;
}

.layout-panel.view-library .draft-column,
.layout-panel.view-library .layout-resizer {
  display: none;
}
```

- [ ] **Step 6: Manual test in Chrome**

After capturing tabs:
- "Draft" and "Library" tab buttons appear above the layout panel
- "Draft" tab is active by default — tab ledger is full-width
- Click "Library" → library explorer expands to full width, tab ledger hidden
- Click "Draft" → tab ledger returns

Verify at narrow window width (< 920px): both views still render correctly stacked.

- [ ] **Step 7: Commit**

```bash
git add dashboard.html dashboard.js styles.css
git commit -m "feat: Draft/Library view tab bar replaces side-by-side resizable layout"
```

---

## Task 7: Per-Tab Completion Indicators

**Files:**
- Modify: `dashboard.html` (add `.tab-completion-dot` to `#tab-template`)
- Modify: `dashboard.js` (add `getTabCompletion()`, apply in `renderTabItem`)
- Modify: `styles.css` (completion dot CSS)

Each tab card gets a small colored dot derived from its `fieldSources`:
- **Gray** — `"pending"` — all sources are `"heuristic"` (no AI or user edits)
- **Amber** — `"ai"` — at least one source is `"ai"`, none are `"user"`
- **Teal** — `"user"` — at least one source is `"user"`

- [ ] **Step 1: Add `.tab-completion-dot` to `#tab-template` in `dashboard.html`**

Inside `#tab-template`, find the `.tab-title-row` div. Add the dot span between `.tab-heading-copy` and `.tab-meta-actions`:

```html
<div class="tab-title-row">
  <div class="tab-heading-copy">
    <h3 class="tab-title"></h3>
    <a class="tab-link" target="_blank" rel="noreferrer"></a>
  </div>
  <span
    class="tab-completion-dot"
    aria-hidden="true"
    title="Pending"
  ></span>
  <div class="tab-meta-actions">
    <button
      class="ghost-button small-button tab-expand-toggle"
      ...
```

- [ ] **Step 2: Add completion dot CSS to `styles.css`**

After the `.tab-favicon` rule (around line 722):

```css
.tab-completion-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
  background: var(--muted);
  opacity: 0.4;
  transition: background-color 200ms ease, opacity 200ms ease;
}

.tab-card[data-completion="ai"] .tab-completion-dot {
  background: var(--warning);
  opacity: 1;
}

.tab-card[data-completion="user"] .tab-completion-dot {
  background: var(--success);
  opacity: 1;
}
```

- [ ] **Step 3: Add `getTabCompletion()` helper to `dashboard.js`**

Add after `getErrorMessage()` (around line 2133):

```js
function getTabCompletion(item) {
  const sources = normalizeDraftFieldSources(item);
  const values = Object.values(sources);
  if (values.some((s) => s === FIELD_SOURCES.user)) {
    return "user";
  }
  if (values.some((s) => s === FIELD_SOURCES.ai)) {
    return "ai";
  }
  return "pending";
}
```

- [ ] **Step 4: Apply completion state in `renderTabItem()`**

In `renderTabItem()`, after the block that sets `categoryInput.value`, `tagsInput.value`, etc., add:

```js
  const completionDot = tabNode.querySelector(".tab-completion-dot");
  const completion = getTabCompletion(item);
  tabNode.dataset.completion = completion;
  const completionTitles = { pending: "Pending", ai: "AI filled", user: "Reviewed" };
  completionDot.title = completionTitles[completion];
```

- [ ] **Step 5: Manual test in Chrome**

Capture tabs. Verify:
- All tab cards show a small gray dot (pending)
- Click "Fill with AI" on one tab → dot turns amber after AI fills fields
- Edit a field on any tab → dot turns teal/green immediately on next render (after blur/change)

Use DevTools to inspect `.tab-card[data-completion]` attribute to confirm values.

- [ ] **Step 6: Commit**

```bash
git add dashboard.html dashboard.js styles.css
git commit -m "feat: per-tab completion indicators (pending/ai-filled/reviewed)"
```

---

## Task 8: Auto-Trigger AI Fill on Capture

**Files:**
- Modify: `dashboard.js` (modify `scanTabs()`)

After a successful capture, if a Gemini API key is configured, automatically start bulk AI fill. This replaces the static status message with a running fill. The fill is scheduled via `setTimeout(0)` so the scan's `finally` block runs `setBusy(false)` first, leaving the UI in the correct idle state before the AI phase begins.

- [ ] **Step 1: Replace the status message block in `scanTabs()` with conditional auto-fill**

Find this block in `scanTabs()` (the result of Task 5 Step 1):

```js
    await persistDraft();
    state.phase = "review";
    render();

    setStatus(
      `${state.items.length} tabs grouped into ${getAllGroups().length} categories.${state.skippedCount ? ` ${state.skippedCount} unsupported tab${state.skippedCount === 1 ? " was" : "s were"} skipped.` : ""}`,
      "success"
    );
```

Replace with:

```js
    await persistDraft();
    state.phase = "review";
    render();

    const captureCount = state.items.length;
    const groupCount = getAllGroups().length;
    const skippedSuffix = state.skippedCount
      ? ` ${state.skippedCount} unsupported tab${state.skippedCount === 1 ? " was" : "s were"} skipped.`
      : "";
    const hasApiKey = String(state.settings.geminiApiKey || "").trim().length > 0;

    if (hasApiKey) {
      setStatus(`${captureCount} tabs captured. Starting AI fill...`);
      // Schedule after the scan's finally block runs setBusy(false)
      setTimeout(() => { void handleBulkFillWithAi(); }, 0);
    } else {
      setStatus(
        `${captureCount} tabs grouped into ${groupCount} categories.${skippedSuffix}`,
        "success"
      );
    }
```

- [ ] **Step 2: Manual test — no API key**

Ensure Settings has no Gemini API key. Click "Capture All Windows":
- Phase advances to Review
- Status shows "N tabs grouped into M categories."
- No AI fill runs (no loading indicators on tab cards)

- [ ] **Step 3: Manual test — with API key**

Add a valid Gemini API key in Settings (⚙). Click "Capture All Windows":
- Phase advances to Review
- Status shows "N tabs captured. Starting AI fill..."
- AI bulk fill begins automatically (tab cards show "Generating..." status)
- After fill completes, completion dots update from gray to amber/teal
- Final status shows "AI reviewed N tabs and updated M."

- [ ] **Step 4: Commit**

```bash
git add dashboard.js
git commit -m "feat: auto-trigger bulk AI fill after tab capture when API key is set"
```

---

## Task 9: Streamline the Popup

**Files:**
- Modify: `popup.html` (update copy and primary button label)

The popup now has a single clear primary action that starts the guided capture flow.

- [ ] **Step 1: Update `popup.html`**

Find and replace the `popup-copy` paragraph and `popup-actions` div:

Before:
```html
<p class="popup-copy">
  Review open tabs, assign categories, and save them into your Browsing Library.
</p>
<div class="popup-actions">
  <button id="capture-all" class="primary-button">Capture All Windows</button>
  <button id="open-dashboard" class="ghost-button">Open Workspace</button>
</div>
```

After:
```html
<p class="popup-copy">
  Capture open tabs, get AI-generated metadata, then save to your Browsing Library.
</p>
<div class="popup-actions">
  <button id="capture-all" class="primary-button">Capture &amp; Review</button>
  <button id="open-dashboard" class="ghost-button">Open Workspace</button>
</div>
```

- [ ] **Step 2: Manual test**

Click the extension toolbar icon. Verify:
- Popup shows "Capture & Review" as the indigo primary button
- "Open Workspace" is the secondary ghost button
- Clicking "Capture & Review" opens the dashboard and triggers capture (`?capture=all`), landing in Review phase
- Clicking "Open Workspace" opens the dashboard without capture

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "feat: streamline popup to single Capture & Review primary action"
```

---

## Self-Review

**Spec coverage:**
- ✅ 3-phase step indicator: Capture → Review → Save → Task 1
- ✅ Phase-aware UI (each phase shows only relevant controls) → Tasks 2, 3, 4, 5
- ✅ Move Library Explorer to its own tab → Task 6
- ✅ Auto-trigger AI fill on capture → Task 8
- ✅ Per-tab completion indicators → Task 7
- ✅ Streamline popup to single clear action → Task 9
- ✅ Phase navigation (Proceed to Save / Back to Review) → Tasks 2, 5

**No placeholders:** All steps contain actual HTML, CSS, or JS code.

**Type consistency:**
- `state.phase` written in Task 1 Step 1, used in Tasks 2, 4, 5 ✅
- `state.activeView` written in Task 1 Step 1, used in Task 6 ✅
- `elements.proceedToSaveButton` / `elements.backToReviewButton` defined Task 2 Step 2, wired Task 2 Step 3 ✅
- `elements.viewTabDraftButton` / `elements.viewTabLibraryButton` defined Task 6 Step 2, used Task 6 Steps 3–4 ✅
- `getTabCompletion()` defined Task 7 Step 3, called Task 7 Step 4 ✅
- `.view-tab-bar` referenced in Task 4 capture CSS (harmless before Task 6 adds the element) ✅
- `#session-name-field` / `#filter-query-field` added Task 3, referenced in Task 4 CSS ✅

**Task ordering:** Tasks 1–2 (state + data-phase attribute) must precede Tasks 4–5 (CSS rules + phase transitions). Task 3 (wrappers) must precede Task 4 (CSS that targets the wrapper IDs). Task 6 can run in any order after Task 1. Tasks 7–9 are independent.

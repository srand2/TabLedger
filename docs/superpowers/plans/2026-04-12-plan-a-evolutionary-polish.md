# Plan A: Evolutionary Polish — UX Fixes & Refinements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every structural, interaction, and copy issue identified in the post-Plan-B UX audit, bringing the dashboard to a polished, production-quality state.

**Architecture:** All changes are confined to the existing Vanilla JS / CSS / HTML stack. The largest structural fix (`data-active-view` on the shell) follows the exact same pattern already used for `data-phase` — one attribute written in `render()`, CSS rules keyed on it. Every other fix is a targeted edit: one CSS rule, one HTML attribute, one JS function amendment.

**Tech Stack:** Vanilla JS, Chrome Extension Manifest V3, CSS custom properties

---

## File Map

| File | Changes |
|---|---|
| `dashboard.js` | Write `data-active-view` in `render()`; focus management in view-tab listeners; highlight saved session in `handleSaveBookmarks()`; add sr-only text to completion dot in `renderTabItem()` |
| `dashboard.html` | Add `data-active-view` shell attribute; add `tabindex="-1"` to pane headings; add `aria-label` to view tabs; add `.category-edit-hint` glyph to category template; add `.sr-only` span to completion dot; copy tweaks (`#proceed-to-save`, filter label, skipped tooltip) |
| `styles.css` | `[data-active-view="library"]` hide rules; fix Review-phase `#back-to-review`; `.category-edit-hint` hover styles; `.just-saved` flash animation; `.sr-only` utility; active view-tab visual weight |

---

## Task 1: `data-active-view` attribute + hide controls-panel in Library view

**Files:**
- Modify: `dashboard.js` (line 441 — `render()` first line)
- Modify: `styles.css` (append after the Save-phase visibility block, line 1208)

The single most important structural fix. Writing `data-active-view` on the shell in `render()` (parallel to `data-phase`) lets CSS hide the entire workflow controls-panel when the Library tab is active.

- [ ] **Step 1: Add `data-active-view` write to `render()` in `dashboard.js`**

Find line 441:
```js
function render() {
  elements.dashboardShell.dataset.phase = state.phase;
```

Change to:
```js
function render() {
  elements.dashboardShell.dataset.phase = state.phase;
  elements.dashboardShell.dataset.activeView = state.activeView;
```

- [ ] **Step 2: Add Library-view CSS hide rules to `styles.css`**

Append at the very end of `styles.css` (after line 1208):

```css
/* === Active-view visibility === */

/* Library view: hide the entire workflow controls panel */
.dashboard-shell[data-active-view="library"] .controls-panel {
  display: none;
}
```

- [ ] **Step 3: Manual test in Chrome**

Load the extension. Click the "Library" tab.

Expected:
- Phase strip, session-row, filter input, summary strip, and toolbar-row all disappear
- The library pane fills full width with its own header, filter, and sessions
- Hero card (branding + settings + action buttons) remains visible

Click the "Draft" tab — controls-panel reappears.

- [ ] **Step 4: Commit**

```bash
git add dashboard.js styles.css
git commit -m "fix: hide workflow controls-panel when Library view is active"
```

---

## Task 2: Fix "← Back to Review" appearing in the Review phase

**Files:**
- Modify: `styles.css` (line 1175 — Review-phase hide block)

`#back-to-review` is only hidden in Capture phase. It should also be hidden in Review (it only makes sense in Save).

- [ ] **Step 1: Add `#back-to-review` to the Review-phase hide list**

Find the Review-phase block (lines 1171–1178):
```css
/* Review: editing controls + AI fill visible, save actions hidden */
.dashboard-shell[data-phase="review"] #scan-all,
.dashboard-shell[data-phase="review"] #save-bookmarks,
.dashboard-shell[data-phase="review"] #export-json,
.dashboard-shell[data-phase="review"] #back-to-review,
.dashboard-shell[data-phase="review"] #session-name-field {
  display: none;
}
```

It already exists! Verify the selector `.dashboard-shell[data-phase="review"] #back-to-review` is in the block. If it is, this task is already complete — confirm and commit a no-op comment fix or skip.

If somehow missing, add it:
```css
.dashboard-shell[data-phase="review"] #scan-all,
.dashboard-shell[data-phase="review"] #save-bookmarks,
.dashboard-shell[data-phase="review"] #export-json,
.dashboard-shell[data-phase="review"] #back-to-review,
.dashboard-shell[data-phase="review"] #session-name-field {
  display: none;
}
```

- [ ] **Step 2: Manual test in Chrome**

After capturing tabs (Review phase): confirm "← Back to Review" button is NOT visible in the hero actions. Only "Proceed to Save →" should appear.

In Save phase: confirm "← Back to Review" IS visible.

- [ ] **Step 3: Commit (only if a change was made)**

```bash
git add styles.css
git commit -m "fix: hide back-to-review button in review phase"
```

---

## Task 3: Category rename edit affordance (pencil hint on hover)

**Files:**
- Modify: `dashboard.html` (inside `#category-template`)
- Modify: `styles.css` (after `.category-rename-actions` rule)

The rename UI is invisible until the user accidentally clicks the category name. A `✎` glyph that appears on hover makes the affordance discoverable.

- [ ] **Step 1: Add edit hint glyph to `#category-template` in `dashboard.html`**

Find the category-template. The current `.category-header` structure is:
```html
<div class="category-header">
  <button class="category-toggle" ...>...</button>
  <label class="field compact-field">
    <span>Tab</span>
    <input class="category-name-input" type="text" />
  </label>
  <div class="category-rename-actions" hidden>...</div>
  <span class="category-pill item-count-pill"></span>
</div>
```

Add `.category-edit-hint` immediately after the `<label>`:
```html
<div class="category-header">
  <button class="category-toggle" type="button" aria-expanded="true">
    <span class="toggle-glyph" aria-hidden="true">▾</span>
  </button>
  <label class="field compact-field">
    <span>Tab</span>
    <input class="category-name-input" type="text" />
  </label>
  <span class="category-edit-hint" aria-hidden="true" title="Click name to rename">✎</span>
  <div class="category-rename-actions" hidden>
    <button class="secondary-button small-button category-rename-save" type="button">Save</button>
    <button class="ghost-button small-button category-rename-cancel" type="button">Cancel</button>
  </div>
  <span class="category-pill item-count-pill"></span>
</div>
```

- [ ] **Step 2: Add `.category-edit-hint` CSS to `styles.css`**

After the `.category-rename-actions` rule (around line 629–633):

```css
.category-edit-hint {
  font-size: 0.78rem;
  color: var(--muted);
  opacity: 0;
  transition: opacity 120ms ease;
  flex-shrink: 0;
  cursor: text;
  user-select: none;
}

.category-card:hover .category-edit-hint {
  opacity: 1;
}

/* Hide hint while rename actions are visible */
.category-header:has(.category-rename-actions:not([hidden])) .category-edit-hint {
  display: none;
}
```

- [ ] **Step 3: Manual test in Chrome**

Capture tabs. Hover over a category card header — the `✎` glyph should fade in next to the category name. Click the name input — the glyph disappears and Save/Cancel buttons appear.

- [ ] **Step 4: Commit**

```bash
git add dashboard.html styles.css
git commit -m "feat: show edit hint glyph on category header hover"
```

---

## Task 4: Post-save highlight animation

**Files:**
- Modify: `dashboard.js` (inside `handleSaveBookmarks()`, after `render()` at line 366)
- Modify: `styles.css` (append `@keyframes` and `.just-saved` rule)

After saving, the newly saved session card in the Library should flash to confirm the save succeeded.

- [ ] **Step 1: Add the flash animation CSS to `styles.css`**

Append at the end of `styles.css`:

```css
/* === Post-save highlight === */
@keyframes savedFlash {
  0%   { box-shadow: 0 0 0 2px var(--success), 0 0 20px rgba(20, 184, 166, 0.25); }
  60%  { box-shadow: 0 0 0 2px var(--success), 0 0 20px rgba(20, 184, 166, 0.25); }
  100% { box-shadow: none; }
}

.history-card.just-saved {
  animation: savedFlash 2s ease-out forwards;
}
```

- [ ] **Step 2: Find and highlight the saved session card in `handleSaveBookmarks()`**

In `dashboard.js`, find `handleSaveBookmarks()`. After `render()` at line 366, and before the `skippedSummary` block:

```js
    await clearDraftState();
    state.phase = "capture";
    state.activeView = "library";
    await loadRecentArchives();
    render();

    // Highlight newly saved session card
    const savedTitle = response.result.sessionTitle;
    if (savedTitle) {
      const cards = document.querySelectorAll(".history-card");
      const match = [...cards].find(
        (c) => c.querySelector(".history-title-button")?.textContent === savedTitle
      );
      if (match) {
        match.scrollIntoView({ behavior: "smooth", block: "nearest" });
        match.classList.add("just-saved");
        match.addEventListener(
          "animationend",
          () => match.classList.remove("just-saved"),
          { once: true }
        );
      }
    }

    const skippedSummary = [];
```

- [ ] **Step 3: Manual test in Chrome**

Capture tabs, name the session, click "Save to Library". Expected:
- View switches to Library
- The newly saved session card pulses with a teal glow for ~2 seconds
- The glow fades out cleanly

- [ ] **Step 4: Commit**

```bash
git add dashboard.js styles.css
git commit -m "feat: flash-highlight newly saved session in Library after save"
```

---

## Task 5: Copy, label, and tooltip quick wins

**Files:**
- Modify: `dashboard.html` (four targeted text/attribute changes)

All small, batch them in one commit.

- [ ] **Step 1: Update `#proceed-to-save` button text**

Find:
```html
<button id="proceed-to-save" class="primary-button" type="button">
  Proceed to Save →
</button>
```

Change to:
```html
<button id="proceed-to-save" class="primary-button" type="button">
  Name &amp; Save →
</button>
```

- [ ] **Step 2: Update the filter field label**

Find inside `#filter-query-field`:
```html
<label class="field compact-search">
  <span>Filter</span>
```

Change to:
```html
<label class="field compact-search">
  <span>Search Draft</span>
```

- [ ] **Step 3: Add tooltip to the "skipped" count label**

Find:
```html
<div>
  <strong id="skipped-count">0</strong>
  <span>skipped</span>
</div>
```

Change to:
```html
<div>
  <strong id="skipped-count">0</strong>
  <span title="URLs skipped due to duplicates or unsupported tab types (e.g. chrome://)">skipped</span>
</div>
```

- [ ] **Step 4: Add `aria-label` to view tab buttons**

Find:
```html
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
```

Change to:
```html
<button
  id="view-tab-draft"
  class="view-tab"
  role="tab"
  aria-selected="true"
  aria-controls="draft-pane"
  aria-label="Switch to Draft view"
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
  aria-label="Switch to Library view"
  type="button"
>
  Library
</button>
```

- [ ] **Step 5: Commit**

```bash
git add dashboard.html
git commit -m "fix: copy tweaks — Name & Save, Search Draft, skipped tooltip, view tab aria-labels"
```

---

## Task 6: Completion dot screen-reader text

**Files:**
- Modify: `dashboard.html` (add `.sr-only` span inside `.tab-completion-dot` in `#tab-template`)
- Modify: `styles.css` (add `.sr-only` utility class)
- Modify: `dashboard.js` (update `renderTabItem()` to set sr-only text, line ~600)

The completion dot is `aria-hidden` with only a `title` tooltip. Screen readers get nothing. A visually-hidden `<span>` inside the dot carries the text equivalent.

- [ ] **Step 1: Add `.sr-only` utility to `styles.css`**

Append at end of `styles.css`:

```css
/* === Screen reader only utility === */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 2: Add `.sr-only` span inside `.tab-completion-dot` in `dashboard.html`**

Find inside `#tab-template`:
```html
<span
  class="tab-completion-dot"
  aria-hidden="true"
  title="Pending"
></span>
```

Change to (remove `aria-hidden`, add sr-only child):
```html
<span class="tab-completion-dot" title="Pending">
  <span class="sr-only tab-completion-sr">Pending</span>
</span>
```

- [ ] **Step 3: Update `renderTabItem()` in `dashboard.js` to keep sr-only text in sync**

Find the completion block in `renderTabItem()` (around line 596–600):
```js
  const completionDot = tabNode.querySelector(".tab-completion-dot");
  const completion = getTabCompletion(item);
  tabNode.dataset.completion = completion;
  const completionTitles = { pending: "Pending", ai: "AI filled", user: "Reviewed" };
  completionDot.title = completionTitles[completion];
```

Change to:
```js
  const completionDot = tabNode.querySelector(".tab-completion-dot");
  const completionSr = tabNode.querySelector(".tab-completion-sr");
  const completion = getTabCompletion(item);
  tabNode.dataset.completion = completion;
  const completionTitles = { pending: "Pending", ai: "AI filled", user: "Reviewed" };
  completionDot.title = completionTitles[completion];
  if (completionSr) {
    completionSr.textContent = completionTitles[completion];
  }
```

- [ ] **Step 4: Manual test**

Open DevTools Accessibility tree. Navigate to a tab card. Confirm the completion dot announces "Pending", "AI filled", or "Reviewed" as a text node.

- [ ] **Step 5: Commit**

```bash
git add dashboard.html dashboard.js styles.css
git commit -m "fix: add screen-reader text to tab completion dot"
```

---

## Task 7: Focus management on view tab switch

**Files:**
- Modify: `dashboard.html` (add `tabindex="-1"` to the two pane `<h2>` headings)
- Modify: `dashboard.js` (add `.focus()` call after `render()` in view tab click handlers, lines 208–216)

When a keyboard user activates Draft or Library tab, focus should move into the newly active pane so they don't have to tab through the entire page.

- [ ] **Step 1: Make pane headings programmatically focusable in `dashboard.html`**

Find inside `#draft-pane`:
```html
<h2>Tab Ledger</h2>
```
Change to:
```html
<h2 tabindex="-1">Tab Ledger</h2>
```

Find inside `#library-pane`:
```html
<h2>Library Explorer</h2>
```
Change to:
```html
<h2 tabindex="-1">Library Explorer</h2>
```

- [ ] **Step 2: Add `.focus()` in `bindEvents()` view tab click handlers in `dashboard.js`**

Find (lines 208–216):
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

Change to:
```js
  elements.viewTabDraftButton.addEventListener("click", () => {
    state.activeView = "draft";
    render();
    document.querySelector("#draft-pane h2")?.focus();
  });

  elements.viewTabLibraryButton.addEventListener("click", () => {
    state.activeView = "library";
    render();
    document.querySelector("#library-pane h2")?.focus();
  });
```

- [ ] **Step 3: Manual test**

Tab to the "Library" view button and press Enter. Focus should jump to "Library Explorer" heading inside the library pane (no visible focus ring because `tabindex="-1"` only allows programmatic focus — add `:focus { outline: none }` only if you see an unwanted ring).

- [ ] **Step 4: Commit**

```bash
git add dashboard.html dashboard.js
git commit -m "fix: move focus into active pane when switching Draft/Library tabs"
```

---

## Task 8: Visual polish — empty state glyphs + view tab active weight

**Files:**
- Modify: `styles.css` (two CSS-only improvements)

Two quick visual improvements that require no HTML changes.

**A: Stronger active view tab.** Currently the active tab is only differentiated by a border. Give it a more substantial background so it reads clearly as selected.

**B: Empty state subtle illustration.** The draft pane empty state gets a CSS-only ledger glyph above the heading, using the existing `--category` and `--border` color tokens.

- [ ] **Step 1: Strengthen active view tab appearance in `styles.css`**

Find:
```css
.view-tab.is-active {
  background: rgba(31, 41, 55, 0.9);
  color: var(--text);
  border-color: var(--border);
}
```

Change to:
```css
.view-tab.is-active {
  background: rgba(99, 102, 241, 0.15);
  color: var(--text);
  border-color: rgba(99, 102, 241, 0.45);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.08);
}
```

- [ ] **Step 2: Add decorative glyph to the draft empty state via CSS**

Append to `styles.css`:

```css
/* === Empty state decorative glyph === */
#categories > .empty-state::before {
  content: "";
  display: block;
  width: 38px;
  height: 38px;
  margin: 0 auto 14px;
  border: 1.5px solid var(--border);
  border-left: 3px solid var(--category);
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.06);
  opacity: 0.7;
}

#recent-archives > .empty-state::before {
  content: "";
  display: block;
  width: 38px;
  height: 38px;
  margin: 0 auto 14px;
  border: 1.5px solid var(--border);
  border-left: 3px solid var(--tags);
  border-radius: 8px;
  background: rgba(20, 184, 166, 0.06);
  opacity: 0.7;
}
```

- [ ] **Step 3: Manual test**

With no draft: confirm the Draft tab shows a small decorative box above "No draft yet". With no library entries: confirm Library shows a teal-accented box. Active Draft/Library tab has an indigo-tinted background instead of a plain dark one.

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "polish: stronger active view tab, decorative empty-state glyphs"
```

---

## Self-Review

**Spec coverage:**
- ✅ Library view hides workflow controls → Task 1 (`data-active-view` + CSS)
- ✅ "Back to Review" in Review phase → Task 2
- ✅ Category rename affordance → Task 3 (pencil glyph)
- ✅ Post-save highlight → Task 4 (flash animation)
- ✅ "Proceed to Save" copy → Task 5
- ✅ "Filter" label → Task 5
- ✅ Skipped tooltip → Task 5
- ✅ View tab aria-labels → Task 5
- ✅ Completion dot screen reader text → Task 6
- ✅ Focus management on view switch → Task 7
- ✅ Visual: empty state glyphs + active tab weight → Task 8

**Placeholder scan:** All steps have actual code. No TBDs.

**Type consistency:**
- `state.activeView` already exists (added in Plan B Task 1)
- `elements.dashboardShell` already exists (added in Plan B Task 2 refactor)
- `response.result.sessionTitle` used in Task 4 — verified it exists at line 378: `response.result.sessionTitle`
- `.history-title-button` used in Task 4 querySelector — verified at line 860 of dashboard.js
- `.tab-completion-sr` added in Task 6 HTML and read in Task 6 JS — consistent

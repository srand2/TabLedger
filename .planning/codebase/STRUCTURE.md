# Codebase Structure

**Analysis Date:** 2026-04-18

## Directory Layout

```text
[project-root]/
├── manifest.json                 # MV3 wiring for popup, permissions, and service worker
├── background.js                 # Service worker backend and bookmark/storage orchestration
├── dashboard.html                # Main workspace markup and DOM templates
├── dashboard.js                  # Main application logic and view state
├── popup.html                    # Browser action popup markup
├── popup.js                      # Popup launcher behavior
├── styles.css                    # Shared styling for popup and dashboard
├── package-extension.sh          # Packaging and watch script for distributable bundles
├── tests/                        # Manual Node-based verification scripts
├── docs/superpowers/             # Design specs and implementation plans
├── media/                        # README screenshots
├── obsidian-extension/           # External analysis JSON artifacts
├── output/                       # Generated packaging and Playwright output directories
├── .planning/codebase/           # Generated codebase maps
└── .superpowers/                 # Local workflow scratch space
```

## Directory Purposes

**Project Root:**
- Purpose: Hold all executable extension source files in a flat layout.
- Contains: `manifest.json`, root-level HTML/JS/CSS entry points, icons, `README.md`, and `package-extension.sh`.
- Key files: `manifest.json`, `background.js`, `dashboard.html`, `dashboard.js`, `popup.html`, `popup.js`, `styles.css`

**`tests/`:**
- Purpose: Keep lightweight verification scripts that run outside Chrome.
- Contains: Standalone Node.js scripts that inline pure helper logic from runtime files.
- Key files: `tests/test_dedup.js`

**`docs/superpowers/`:**
- Purpose: Store internal design docs and implementation plans for extension features.
- Contains: Dated Markdown specs under `docs/superpowers/specs/` and dated implementation plans under `docs/superpowers/plans/`.
- Key files: `docs/superpowers/specs/2026-04-13-sync-import-design.md`, `docs/superpowers/plans/2026-04-13-sync-import.md`

**`media/`:**
- Purpose: Provide image assets referenced by `README.md`.
- Contains: Screenshots of the popup, review flow, library, and filters.
- Key files: `media/popup.png`, `media/review.png`, `media/library.png`

**`obsidian-extension/`:**
- Purpose: Keep scan output from an external extension-analysis workflow.
- Contains: JSON analysis artifacts, not runtime code.
- Key files: `obsidian-extension/extensionAnalysis.json`, `obsidian-extension/extensionDetails.json`, `obsidian-extension/scan.json`

**`output/`:**
- Purpose: Hold generated artifacts from packaging and verification runs.
- Contains: `output/package/` for packaging output targets and `output/playwright/` for browser-test output directories.
- Key files: `output/package`, `output/playwright/review`, `output/playwright/verify`

**`.planning/codebase/`:**
- Purpose: Store generated mapping documents consumed by other GSD workflows.
- Contains: Architecture, structure, stack, conventions, testing, and concern maps when generated.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`

**`.superpowers/`:**
- Purpose: Hold local workflow support files outside the shipped extension.
- Contains: Scratch or brainstorming data.
- Key files: `.superpowers/brainstorm`

## Key File Locations

**Entry Points:**
- `manifest.json`: Declare extension permissions, browser action popup, and `background.js` as the MV3 service worker.
- `popup.html`: Render the browser action popup shell.
- `popup.js`: Translate popup button clicks into `open-dashboard` messages.
- `dashboard.html`: Define the main workspace shell, import panel, sync controls, modal, and HTML templates.
- `dashboard.js`: Boot the dashboard, own the UI state machine, and orchestrate capture/review/save/library flows.
- `background.js`: Receive runtime messages, mutate bookmarks, manage AI queue state, and perform sync.

**Configuration:**
- `manifest.json`: Runtime permissions and Chrome surface wiring.
- `package-extension.sh`: Packaging inputs, watched files, and output paths for distributable bundles.
- `.claude/settings.local.json`: Local assistant tooling settings; not part of the extension runtime.

**Core Logic:**
- `dashboard.js`: Capture pipeline, view rendering, direct Gemini calls, import/sync UI, local storage restore/persist, and archive filtering.
- `background.js`: Bookmark CRUD, dedupe rules, library mutation, bookmark import, queued AI enrichment, sync push/pull, and storage helpers.
- `styles.css`: Shared visual system for both `popup.html` and `dashboard.html`.

**Testing:**
- `tests/test_dedup.js`: Manual Node runner for URL normalization and dedupe behavior copied from `background.js`.
- `output/playwright/`: Artifact directories from browser-level verification runs; committed test source files are not detected under this path.

## Naming Conventions

**Files:**
- Keep executable extension assets at the repository root with lowercase names: `background.js`, `dashboard.js`, `popup.js`, `styles.css`, `manifest.json`.
- Pair UI surfaces by shared basename: `popup.html` with `popup.js`, and `dashboard.html` with `dashboard.js`.
- Use descriptive lowercase or kebab-style support filenames for scripts and docs: `package-extension.sh`, `2026-04-13-sync-import-design.md`.
- Keep image assets descriptive and flat: `icon-16.png`, `media/library-filter.png`.

**Directories:**
- Use lowercase directory names for support areas: `tests`, `media`, `docs`, `output`.
- Use hyphenated lowercase when a directory name needs multiple words: `obsidian-extension`.
- Keep dated planning docs grouped by concern rather than by runtime feature tree: `docs/superpowers/specs/`, `docs/superpowers/plans/`.

## Where to Add New Code

**New Feature:**
- Dashboard-only behavior: add markup in `dashboard.html`, event/state/render logic in `dashboard.js`, and styling in `styles.css`.
- Feature that needs privileged bookmark, tab, window, or sync access: add a message branch plus implementation in `background.js`, then invoke it from `dashboard.js` or `popup.js` with `chrome.runtime.sendMessage`.
- Manifest-level capability: update `manifest.json` when a new surface, permission, or host permission is required.
- Tests: add a new standalone script in `tests/`, following the `test_<feature>.js` pattern used by `tests/test_dedup.js`.

**New Component/Module:**
- New extension page or popup-like surface: place the HTML and JS files at repo root beside `dashboard.html` and `popup.html`, then wire the surface from `manifest.json` or `background.js`.
- New dashboard subview: prefer adding new `<template>` blocks to `dashboard.html` and render helpers to `dashboard.js` instead of creating a separate framework-style component tree.
- New background capability: place feature-local helpers near the owning handler in `background.js`; that file is the service boundary for persistence and bookmark mutations.

**Utilities:**
- Shared helpers are inlined inside `dashboard.js` and `background.js`. Follow that pattern for feature-local helpers.
- Extract a new standalone JS utility file only when the logic is reused across multiple root entry points and you are also updating the loading strategy explicitly. The current runtime uses plain non-module scripts, so extracted files are not picked up automatically.

## Special Directories

**`output/`:**
- Purpose: Generated packaging and verification output.
- Generated: Yes
- Committed: Yes

**`obsidian-extension/`:**
- Purpose: External analysis snapshots.
- Generated: Yes
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: Generated codebase reference documents for GSD planning and execution.
- Generated: Yes
- Committed: Yes

**`docs/superpowers/`:**
- Purpose: Human-authored project plans and specs.
- Generated: No
- Committed: Yes

**`media/`:**
- Purpose: Documentation screenshots.
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-04-18*

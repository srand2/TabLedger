# Technology Stack

**Analysis Date:** 2026-04-18

## Languages

**Primary:**
- JavaScript (version not pinned; classic non-module scripts) - extension runtime and UI logic in `background.js`, `dashboard.js`, and `popup.js`

**Secondary:**
- HTML5 - extension pages in `dashboard.html` and `popup.html`
- CSS3 - shared styling in `styles.css`
- Bash - manual packaging workflow in `package-extension.sh`
- JSON - extension manifest configuration in `manifest.json`

## Runtime

**Environment:**
- Chrome/Chromium extension runtime, Manifest V3 - declared in `manifest.json`
- Background service worker - `background.js` is registered by `manifest.json`
- Extension pages loaded directly from source files - `popup.html` loads `popup.js`, and `dashboard.html` loads `dashboard.js`
- Optional Node.js runtime for ad hoc tests only - `tests/test_dedup.js`

**Package Manager:**
- Not detected - no `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, or other package manifest exists at the repo root
- Lockfile: missing

## Extension Platform

**Platform details:**
- Browser action popup: `manifest.json` maps `action.default_popup` to `popup.html`
- Full workspace page: `background.js` opens `dashboard.html` with `extensionApi.runtime.getURL(...)`
- Permissions: `tabs`, `bookmarks`, and `storage` in `manifest.json`
- Host permissions: only `https://generativelanguage.googleapis.com/*` in `manifest.json`
- Compatibility shim: `background.js`, `dashboard.js`, and `popup.js` all use `globalThis.browser ?? chrome`
- Not detected in `manifest.json`: `content_scripts`, `options_page`, `side_panel`, `commands`, `web_accessible_resources`, `externally_connectable`, or OAuth configuration

## Frameworks

**Core:**
- None detected - the extension is hand-written vanilla JavaScript, HTML, and CSS in `background.js`, `dashboard.js`, `popup.js`, `dashboard.html`, `popup.html`, and `styles.css`
- Chrome Extension platform APIs act as the main runtime dependency - `tabs`, `bookmarks`, `storage`, `runtime`, and `windows` are used in `background.js` and `dashboard.js`

**Testing:**
- No test framework detected - `tests/test_dedup.js` is a standalone Node script with inline assertions
- Manual load-unpacked workflow is documented in `README.md`

**Build/Dev:**
- `package-extension.sh` - packages the core extension files into a ZIP, copies them to `/mnt/c/Users/omri/Documents/TabLedger-Chrome-Ext`, extracts them, and deletes temporary archives
- No bundler or transpiler detected - `dashboard.html` and `popup.html` reference `dashboard.js`, `popup.js`, and `styles.css` directly
- No linting or formatting config detected - `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `biome.json`, `tsconfig.json`, and `jsconfig.json` are not present at the repo root

## Key Dependencies

**Critical:**
- Chrome Tabs API - captures open tabs in `dashboard.js` and opens dashboard or saved URLs in `background.js`
- Chrome Bookmarks API - persists the Browsing Library, imports folders, updates categories, and removes bookmark trees in `background.js`
- Chrome Storage API - stores drafts, saved sessions, bookmark metadata, sync state, device identity, AI queue state, and settings in `background.js` and `dashboard.js`
- Fetch + Google Generative Language API - optional AI enrichment is called directly from `dashboard.js` for draft filling and from `background.js` for queued import/library enrichment
- Browser Web APIs - `AbortController`, `Blob`, `URL.createObjectURL`, `URL`, and `crypto.randomUUID` are used in `dashboard.js` and `background.js`

**Infrastructure:**
- `zip`, `unzip`, and `sha256sum` command-line tools are required by `package-extension.sh`
- No third-party package dependencies are declared because the repo has no package manager manifest

## Configuration

**Environment:**
- Extension configuration lives in `manifest.json`
- Runtime settings live in `chrome.storage.local` under `tabLedgerSettings`; `dashboard.js` writes dedupe rules, Gemini API key, and Gemini model there
- No `.env*` files are present at the repo root

**Build:**
- `manifest.json` - extension metadata, permissions, icons, host permissions, popup, and background service worker
- `package-extension.sh` - manual packaging and Windows copy/extract flow
- `README.md` - installation, privacy, and runtime usage notes

## Platform Requirements

**Development:**
- Chrome or another Chromium-based browser with Developer Mode enabled, as described in `README.md`
- Browser support for the `tabs`, `bookmarks`, `storage`, `runtime`, and `windows` APIs used by `background.js` and `dashboard.js`
- Shell tools `zip`, `unzip`, and `sha256sum` to run `package-extension.sh`
- No Node version is pinned; Node is only needed if running `node tests/test_dedup.js`

**Production:**
- Chrome/Chromium extension package built from the root files listed in `package-extension.sh`
- Deployment automation is not detected; current distribution is manual via load-unpacked or packaged ZIP from `package-extension.sh`

---

*Stack analysis: 2026-04-18*

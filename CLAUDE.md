# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TabLedger is a Manifest V3 Chrome extension for organizing and saving browser tabs into a reusable "Browsing Library". It captures tabs across all windows, guides the user through a 3-phase workflow (Capture → Review → Save), allows categorization and annotation, and stores sessions with rich metadata for later retrieval and filtering.

## Key Architecture

### Storage Architecture
- **Dual storage system**: Native bookmarks for structure + `chrome.storage.local` for rich metadata
- **Bookmark hierarchy**: `Browsing Library` → Session folders → Category folders → Individual bookmarks
- **Metadata keys in storage**:
  - `tabGardenDraft`: Current unsaved workspace
  - `savedSessions`: Array of saved session metadata
  - `bookmarkMetadata`: Maps bookmark IDs to extended metadata (tags, descriptions, summaries)
  - `tabLedgerSettings`: User preferences for deduplication and Gemini API key/model

### Message Flow
- **Extension popup** (`popup.js`) → Opens dashboard or triggers capture
- **Dashboard** (`dashboard.js`) → Main UI, sends messages to background for persistence operations
- **Background service worker** (`background.js`) → Handles bookmark creation, deletion, updates, and storage management
- Message types: `create-bookmark-archive`, `open-archive-urls`, `delete-archive-session`, `delete-archive-item`, `update-archive-item`, `update-archive-category`

### UI State Model
- `state.phase` — `"capture"` | `"review"` | `"save"` — controls which hero actions are visible
- `state.activeView` — `"draft"` | `"library"` — controls which pane is shown
- Both are written to the shell element as `data-phase` and `data-active-view` attributes in `render()`
- CSS rules keyed on `[data-phase]` and `[data-active-view]` handle all conditional visibility
- Phase nav buttons (`Name & Save →`, `← Back to Review`) always set `state.activeView = "draft"` so phase transitions never leave the user in Library view

### AI Integration
- Gemini API key and model are stored in `tabLedgerSettings` and called directly from the extension
- Dashboard calls the Gemini API for tab categorization and metadata generation
- Returns structured JSON with category, tags, description, and summary
- User edits are protected from AI overwrites via `fieldSources` tracking (`heuristic` / `ai` / `user`)
- **Local sidecar** (`ai-sidecar.js`) exists but the dashboard no longer depends on it

## Development Commands

### Running the Extension
```bash
# 1. Load extension in Chrome:
#    - Open chrome://extensions
#    - Enable Developer mode
#    - Click "Load unpacked"
#    - Select this directory

# 2. Start AI sidecar (optional, not needed for normal use):
export GEMINI_API_KEY="your-key-here"
export GEMINI_MODEL="gemini-2.5-flash"  # Optional, defaults to gemini-2.5-flash
node ai-sidecar.js

# 3. Test sidecar health:
curl http://127.0.0.1:4317/health
```

### Testing
No test framework is currently configured. Manual testing through Chrome extension developer tools.

## Important Implementation Details

### Tab Processing Flow
1. `scanTabs()` captures all tabs from open windows
2. Filters out non-bookmarkable URLs (chrome://, extensions, etc.)
3. Generates initial categories via heuristic rules based on hostname/title
4. Tracks field sources (heuristic/ai/user) to prevent overwriting manual edits
5. Saves to bookmarks with folder structure while storing metadata separately

### Phase & View Visibility Pattern
All conditional UI visibility is CSS-driven via data attributes on `.dashboard-shell`:
- `[data-phase="capture"]`, `[data-phase="review"]`, `[data-phase="save"]` — show/hide hero action buttons
- `[data-active-view="library"]` — hides the entire `.controls-panel` (workflow chrome) so Library is uncluttered
- Never use `display` toggling in JS for phase/view visibility — add a CSS rule instead

### Deduplication Logic
- **Within session**: Prevents duplicate URLs in same save operation
- **Across sessions**: Checks existing library for duplicate URLs
- Controlled via settings toggles in UI
- URL normalization in `normalizeArchiveUrl()` for comparison

### Category Management
- Categories can be renamed; `Save` button enables only when the name has changed from original
- `Remove` button filters all items in that category out of `state.items` immediately
- Saved categories support metadata (description, tags) stored in `categoryMeta`
- Empty categories are automatically removed when last tab deleted
- Category folders in bookmarks are updated when renamed

### Tab Card Expand/Collapse
- Clicking anywhere on `.tab-title-row` toggles the card's `is-collapsed` class
- Clicks on `<a>` or `<button>` elements inside the row are excluded via `e.target.closest("a, button")`
- The `▸` expand glyph (`.tab-expand-glyph`) rotates 90° via CSS transition when expanded
- `state.expandedTabIds` (Set) persists which cards are expanded across re-renders

### Post-Save Flow
After a successful save in `handleSaveBookmarks()`:
1. Draft is cleared, `state.phase` reset to `"capture"`, `state.activeView` set to `"library"`
2. Library is reloaded and rendered
3. The newly saved session card is found by title, scrolled into view, and given `just-saved` class for a 2s teal flash animation

### Library Explorer Features
- Filter by: session, category, tag, or text search
- Search spans: title, URL, hostname, description, summary, tags
- Batch operations: open all filtered matches, delete sessions/tabs
- Edit saved items: modify category, tags, description, summary after saving

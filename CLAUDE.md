# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TabLedger is a Manifest V3 Chrome extension for organizing and saving browser tabs into a reusable "Browsing Library". It captures tabs across all windows, allows categorization and annotation, and stores sessions with rich metadata for later retrieval and filtering.

## Key Architecture

### Storage Architecture
- **Dual storage system**: Native bookmarks for structure + `chrome.storage.local` for rich metadata
- **Bookmark hierarchy**: `Browsing Library` → Session folders → Category folders → Individual bookmarks
- **Metadata keys in storage**:
  - `tabGardenDraft`: Current unsaved workspace
  - `savedSessions`: Array of saved session metadata
  - `bookmarkMetadata`: Maps bookmark IDs to extended metadata (tags, descriptions, summaries)
  - `tabLedgerSettings`: User preferences for deduplication

### Message Flow
- **Extension popup** (`popup.js`) → Opens dashboard or triggers capture
- **Dashboard** (`dashboard.js`) → Main UI, sends messages to background for persistence operations
- **Background service worker** (`background.js`) → Handles bookmark creation, deletion, updates, and storage management
- Message types: `create-bookmark-archive`, `open-archive-urls`, `delete-archive-session`, `delete-archive-item`, `update-archive-item`, `update-archive-category`

### AI Integration
- **Local sidecar** (`ai-sidecar.js`) runs on `127.0.0.1:4317` 
- Uses Gemini API for tab categorization and metadata generation
- Dashboard calls `/v1/fill-tab` endpoint with tab title/URL/hostname
- Returns structured JSON with category, tags, description, and summary
- User edits are protected from AI overwrites via `fieldSources` tracking

## Development Commands

### Running the Extension
```bash
# 1. Load extension in Chrome:
#    - Open chrome://extensions
#    - Enable Developer mode
#    - Click "Load unpacked" 
#    - Select /home/shay/Projects/ChromeExtension

# 2. Start AI sidecar (optional, for AI features):
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

### Deduplication Logic
- **Within session**: Prevents duplicate URLs in same save operation
- **Across sessions**: Checks existing library for duplicate URLs
- Controlled via settings toggles in UI
- URL normalization in `normalizeArchiveUrl()` for comparison

### Category Management
- Categories can be renamed, affecting all tabs within them
- Saved categories support metadata (description, tags) stored in `categoryMeta`
- Empty categories are automatically removed when last tab deleted
- Category folders in bookmarks are updated when renamed

### Library Explorer Features
- Filter by: session, category, tag, or text search
- Search spans: title, URL, hostname, description, summary, tags
- Batch operations: open all filtered matches, delete sessions/tabs
- Edit saved items: modify category, tags, description, summary after saving
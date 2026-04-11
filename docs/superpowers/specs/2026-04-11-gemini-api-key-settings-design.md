# Gemini API Key in Settings — Design

## Goal

Allow users to enter their Gemini API key directly in the TabLedger settings panel so AI fill works without running the external sidecar process.

## Problem

The AI fill feature currently calls `http://127.0.0.1:4317/v1/fill-tab` — an external Node.js sidecar (`ai-sidecar.js`) that must be started manually with `GEMINI_API_KEY` set as an environment variable. If the sidecar is not running, every AI fill silently fails with "AI reviewed N tabs. Updated 0, N failed." The extension has no way to inform the user why it failed or how to fix it.

## Approach

Move the Gemini API call directly into the extension. Store the API key and model in `chrome.storage.local` (the existing `tabLedgerSettings` key). Replace the sidecar `fetch()` in `dashboard.js` with a direct call to `generativelanguage.googleapis.com`, porting the ~40 lines of Gemini logic already in `ai-sidecar.js`. The sidecar file is left unchanged and still works as a standalone tool.

## Storage

`tabLedgerSettings` gains two new fields:

```js
{
  dedupeWithinSession: false,    // existing
  dedupeAcrossSessions: false,   // existing
  geminiApiKey: "",              // new — empty means AI fill disabled
  geminiModel: "gemini-2.5-flash" // new — default model
}
```

`normalizeSettings()` in `dashboard.js` must include these fields so they are preserved on storage round-trips and defaulted if missing.

## Settings Panel UI

A new **"AI"** section is appended inside `#settings-panel` in `dashboard.html`, below the existing "Save Rules" block. It uses the existing `.settings-option` layout with a stacked variant for the inputs.

```
SETTINGS
─────────────────────────
Save Rules
☐ Deduplicate in this session      (existing)
☐ Deduplicate across the library   (existing)

AI
API Key  [••••••••••••••] [Show]
         Get yours at aistudio.google.com
Model    [gemini-2.5-flash          ]
         Optional. Default: gemini-2.5-flash
```

- **API Key input** — `type="password"`, saves to settings on `blur`. An inline "Show"/"Hide" toggle button switches `type` between `"password"` and `"text"`.
- **Model input** — `type="text"`, saves to settings on `blur`. Pre-filled with `gemini-2.5-flash`.
- Both inputs are styled using the existing `.field` class inside a `.settings-api-block` wrapper.
- No explicit "Save" button — matches the existing checkbox UX (immediate persistence).

## Manifest

`manifest.json` gains one new host permission so the extension can reach the Gemini API:

```json
"host_permissions": [
  "http://127.0.0.1:4317/*",
  "https://generativelanguage.googleapis.com/*"
]
```

## Call Chain Replacement

`requestAiFillPayload(item)` in `dashboard.js` is rewritten:

1. Read `state.settings.geminiApiKey`. If empty, throw a user-facing error: `"Add your Gemini API key in Settings (⚙) to use AI fill."`
2. Build the Gemini API request using the same prompt and JSON schema currently in `ai-sidecar.js`.
3. Parse and normalize the response using the same logic currently in `ai-sidecar.js`.
4. Return the normalized payload `{ category, tags, description, summary }`.

The `AI_FILL_ENDPOINT` constant and the old sidecar `fetch()` are removed. A new `callGeminiApi(item, apiKey, model)` function handles steps 2–3.

### Gemini request details (ported from sidecar)

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Auth header: `x-goog-api-key: {apiKey}`
- Same prompt template and `responseSchema` as `ai-sidecar.js`
- Error handling: non-OK responses throw with the Gemini status code and body text

## Error Handling

| Condition | User-visible message |
|---|---|
| API key not set | "Add your Gemini API key in Settings (⚙) to use AI fill." |
| Gemini returns non-2xx | "Gemini request failed ({status}). Check your API key." |
| Gemini returns malformed JSON | "Gemini returned an unexpected response." |
| Network error (offline, CORS) | Existing catch path surfaces the error message |

## What Does Not Change

- `ai-sidecar.js` — untouched. Still works as a standalone server.
- `normalizeAiFillResponse()` — the response normalization function in `dashboard.js` is unchanged; the new `callGeminiApi` returns data in the same shape the sidecar did.
- All other settings fields and UI — dedupe checkboxes, layout, persistence.

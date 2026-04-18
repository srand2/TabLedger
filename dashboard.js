const extensionApi = globalThis.browser ?? chrome;

// SVG icon strings — used wherever JS builds button innerHTML dynamically.
// All icons use fill="currentColor" or stroke="currentColor" so they inherit CSS color.
const ICONS = {
  sparkle: '<svg viewBox="0 0 16 16" fill="currentColor" class="icon tab-ai-icon" aria-hidden="true"><path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z"/></svg>',
  warning: '<svg viewBox="0 0 16 16" fill="currentColor" class="icon" aria-hidden="true"><path d="M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6a1 1 0 110 2 1 1 0 010-2z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="currentColor" class="icon" aria-hidden="true"><path d="M5.5 3.5A1.5 1.5 0 017 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5zm5 0A1.5 1.5 0 0112 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5z"/></svg>',
  resume: '<svg viewBox="0 0 16 16" fill="currentColor" class="icon" aria-hidden="true"><path d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 010 1.393z"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="currentColor" class="icon" aria-hidden="true"><path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/></svg>',
  download: '<svg viewBox="0 0 16 16" fill="currentColor" class="icon" aria-hidden="true"><path fill-rule="evenodd" d="M8 1a.5.5 0 01.5.5v11.793l3.146-3.147a.5.5 0 01.708.708l-4 4a.5.5 0 01-.708 0l-4-4a.5.5 0 01.708-.708L7.5 13.293V1.5A.5.5 0 018 1z"/></svg>',
};

const DRAFT_KEY = "tabGardenDraft";
const BOOKMARK_METADATA_KEY = "bookmarkMetadata";
const SAVED_SESSIONS_KEY = "savedSessions";
const AI_ENRICHMENT_QUEUE_KEY = "aiEnrichmentQueue";
const AI_ENRICHMENT_CONTROL_KEY = "aiEnrichmentControl";
const SETTINGS_KEY = "tabLedgerSettings";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const WORKSPACE_RESULT_ITEM_PREFIX = "ws-item-";
const CATEGORY_MATCH_SHORTLIST_LIMIT = 8;
const MAX_EXISTING_CATEGORY_CONTEXT = 60;
const FIELD_SOURCES = {
  heuristic: "heuristic",
  ai: "ai",
  user: "user"
};
const AI_EDITABLE_FIELDS = ["category", "tags", "description", "summary"];
const VALID_FIELD_SOURCES = new Set(Object.values(FIELD_SOURCES));
const capabilities = {
  nativeBookmarks: Boolean(extensionApi.bookmarks?.create)
};
const DEFAULT_SETTINGS = {
  dedupeWithinSession: false,
  dedupeAcrossSessions: false,
  geminiApiKey: "",
  geminiModel: DEFAULT_GEMINI_MODEL,
  obsidianVault: ""
};

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
  bulkAiPaused: false,
  bulkAiCancelled: false,
  bulkAiResumeResolve: null,
  bulkAiCurrentItemId: null,
  libraryBulkAiRunning: false,
  libraryBulkAiPaused: false,
  libraryBulkAiCancelled: false,
  libraryBulkAiResumeResolve: null,
  libraryBulkAiCurrentItemKey: null,
  editingArchiveItemKey: null,
  archiveItemEditor: null,
  settings: { ...DEFAULT_SETTINGS },
  settingsOpen: false,
  aiRequestTokens: {},
  aiAbortControllers: {},
  aiStatuses: {},
  expandedTabIds: new Set(),
  geminiApiKeyVisible: false,
  phase: "capture",             // "capture" | "review" | "save"
  activeView: "draft",          // "draft" | "library" | "workspace"
  workspace: {
    topic: "",
    searchResults: [],
    excludedUrls: new Set(),
    project: null,
    searching: false,
    generating: false
  },
  importOpen: false,
  importRunning: false,
  importEnrichmentTotal: 0,
  importEnrichmentDone: 0,
  importEnrichmentSessionIds: [],
  importEnrichmentPaused: false,
  importEnrichmentControlPaused: false,
  syncRunning: false,
  libraryInitialized: false,
  selectedSessionIds: new Set(),
  selectedArchiveItemKeys: new Set(),
  aiSelectionModal: {
    open: false,
    mode: null,
    sessions: []
  }
};

const elements = {
  dashboardShell: document.querySelector(".dashboard-shell"),
  scanAllButton: document.getElementById("scan-all"),
  saveBookmarksButton: document.getElementById("save-bookmarks"),
  exportJsonButton: document.getElementById("export-json"),
  resetDraftButton: document.getElementById("reset-draft"),
  toggleDraftCollapseButton: document.getElementById("toggle-draft-collapse"),
  bulkFillAiButton: document.getElementById("bulk-fill-ai"),
  bulkAiPauseButton: document.getElementById("bulk-ai-pause"),
  bulkAiStopButton: document.getElementById("bulk-ai-stop"),
  settingsToggleButton: document.getElementById("settings-toggle"),
  settingsPanel: document.getElementById("settings-panel"),
  dedupeWithinSessionInput: document.getElementById("dedupe-within-session"),
  dedupeAcrossSessionsInput: document.getElementById("dedupe-across-sessions"),
  geminiApiKeyInput: document.getElementById("gemini-api-key"),
  geminiModelInput: document.getElementById("gemini-model"),
  toggleGeminiApiKeyVisibilityButton: document.getElementById(
    "toggle-gemini-api-key-visibility"
  ),
  proceedToSaveButton: document.getElementById("proceed-to-save"),
  backToReviewButton: document.getElementById("back-to-review"),
  phaseCopy: document.getElementById("phase-copy"),
  sessionNameInput: document.getElementById("session-name"),
  filterQueryInput: document.getElementById("filter-query"),
  layoutPanel: document.getElementById("layout-panel"),
  draftPane: document.getElementById("draft-pane"),
  libraryPane: document.getElementById("library-pane"),
  viewTabBar: document.getElementById("view-tab-bar"),
  viewTabDraftButton: document.getElementById("view-tab-draft"),
  viewTabLibraryButton: document.getElementById("view-tab-library"),
  libraryBulkFillAiButton: document.getElementById("library-bulk-fill-ai"),
  libraryBulkAiPauseButton: document.getElementById("library-bulk-ai-pause"),
  libraryBulkAiStopButton: document.getElementById("library-bulk-ai-stop"),
  archiveFilterInput: document.getElementById("archive-filter"),
  archiveCategorySelect: document.getElementById("archive-category-select"),
  archiveTagSelect: document.getElementById("archive-tag-select"),
  archiveActiveFilters: document.getElementById("archive-active-filters"),
  archiveSummary: document.getElementById("archive-summary"),
  tabCount: document.getElementById("tab-count"),
  categoryCount: document.getElementById("category-count"),
  skippedCount: document.getElementById("skipped-count"),
  statusMessage: document.getElementById("status-message"),
  categories: document.getElementById("categories"),
  librarySelectAllRow: document.getElementById("library-select-all-row"),
  selectAllSessionsCheckbox: document.getElementById("select-all-sessions"),
  recentArchives: document.getElementById("recent-archives"),
  bulkDeleteBar: document.getElementById("bulk-delete-bar"),
  bulkDeleteCount: document.getElementById("bulk-delete-count"),
  bulkDeleteConfirmButton: document.getElementById("bulk-delete-confirm"),
  bulkDeleteCancelButton: document.getElementById("bulk-delete-cancel"),
  categoryTemplate: document.getElementById("category-template"),
  tabTemplate: document.getElementById("tab-template"),
  historyTemplate: document.getElementById("history-template"),
  phaseStrip: document.getElementById("phase-strip"),
  aiSelectionModal: document.getElementById("ai-selection-modal"),
  aiSelectionTitle: document.getElementById("ai-selection-title"),
  aiSelectionSummary: document.getElementById("ai-selection-summary"),
  aiSelectionSessionList: document.getElementById("ai-selection-session-list"),
  aiSelectionCloseButton: document.getElementById("ai-selection-close"),
  aiSelectionCancelButton: document.getElementById("ai-selection-cancel"),
  aiSelectionConfirmButton: document.getElementById("ai-selection-confirm"),
  importToggleButton: document.getElementById("import-toggle"),
  importPanel: document.getElementById("import-panel"),
  importFolderRow: document.getElementById("import-folder-row"),
  importFolderSelect: document.getElementById("import-folder-select"),
  importUseAiCheckbox: document.getElementById("import-use-ai"),
  importRunButton: document.getElementById("import-run"),
  importProgress: document.getElementById("import-progress"),
  importProgressSessions: document.getElementById("import-progress-sessions"),
  importAiRow: document.getElementById("import-ai-row"),
  importAiCurrent: document.getElementById("import-ai-current"),
  importProgressAi: document.getElementById("import-progress-ai"),
  importProgressFill: document.getElementById("import-progress-fill"),
  importProgressActions: document.getElementById("import-progress-actions"),
  importAiPauseButton: document.getElementById("import-ai-pause"),
  importAiStopButton: document.getElementById("import-ai-stop"),
  syncNowButton: document.getElementById("sync-now"),
  syncStatusBar: document.getElementById("sync-status-bar"),
  obsidianVaultInput: document.getElementById("obsidian-vault"),
  viewTabWorkspaceButton: document.getElementById("view-tab-workspace"),
  workspacePane: document.getElementById("workspace-pane"),
  workspaceTopicInput: document.getElementById("workspace-topic"),
  workspaceSearchBtn: document.getElementById("workspace-search-btn"),
  workspaceStatus: document.getElementById("workspace-status"),
  workspaceResultsZone: document.getElementById("workspace-results-zone"),
  workspaceResultsCount: document.getElementById("workspace-results-count"),
  workspaceResultsList: document.getElementById("workspace-results-list"),
  workspaceGenerateBtn: document.getElementById("workspace-generate-btn"),
  workspaceProjectZone: document.getElementById("workspace-project-zone"),
  workspaceProjectContent: document.getElementById("workspace-project-content"),
  workspaceExportGroup: document.getElementById("workspace-export-group"),
  workspaceExportStatus: document.getElementById("workspace-export-status"),
  workspaceExportObsidianBtn: document.getElementById("workspace-export-obsidian"),
  workspaceNewProjectBtn: document.getElementById("workspace-new-project"),
  workspacePromptModal: document.getElementById("workspace-prompt-modal"),
  workspacePromptSummary: document.getElementById("workspace-prompt-summary"),
  workspacePromptTextarea: document.getElementById("workspace-prompt-textarea"),
  workspacePromptClose: document.getElementById("workspace-prompt-close"),
  workspacePromptCancel: document.getElementById("workspace-prompt-cancel"),
  workspacePromptConfirm: document.getElementById("workspace-prompt-confirm")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  await restoreDraft();
  await restoreSettings();
  await loadRecentArchives();
  const launchIntent = getDashboardLaunchIntent();
  applyDashboardLaunchIntent(launchIntent);
  render();

  // Re-render library when background AI enrichment updates sessions
  extensionApi.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[SAVED_SESSIONS_KEY]) {
      loadRecentArchives().then(() => {
        renderArchiveExplorer();
        syncImportEnrichmentTracking();
        updateImportEnrichmentControls();
      });
    }
    if (changes[AI_ENRICHMENT_CONTROL_KEY]) {
      state.importEnrichmentControlPaused = Boolean(
        changes[AI_ENRICHMENT_CONTROL_KEY]?.newValue?.paused
      );
      syncImportEnrichmentTracking();
      updateImportEnrichmentControls();
    }
  });

  if (!capabilities.nativeBookmarks) {
    setStatus(
      "Native bookmark creation is not available here yet. JSON export still works.",
      "error"
    );
  }

  if (launchIntent.captureAll) {
    await scanTabs();
  }

  if (launchIntent.hasParams) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function bindEvents() {
  elements.scanAllButton.addEventListener("click", () => scanTabs());
  elements.saveBookmarksButton.addEventListener("click", handleSaveBookmarks);
  elements.exportJsonButton.addEventListener("click", handleExportJson);
  elements.resetDraftButton.addEventListener("click", handleResetDraft);
  elements.toggleDraftCollapseButton.addEventListener("click", handleToggleDraftCollapse);
  elements.bulkFillAiButton.addEventListener("click", openDraftAiSelectionModal);
  elements.bulkAiPauseButton.addEventListener("click", handlePauseAi);
  elements.bulkAiStopButton.addEventListener("click", handleStopAi);
  elements.settingsToggleButton.addEventListener("click", handleToggleSettings);

  elements.proceedToSaveButton.addEventListener("click", () => {
    state.phase = "save";
    state.activeView = "draft";
    render();
  });

  elements.backToReviewButton.addEventListener("click", () => {
    state.phase = "review";
    state.activeView = "draft";
    render();
  });

  elements.sessionNameInput.addEventListener("input", async (event) => {
    state.sessionName = event.target.value;
    await persistDraft();
  });

  elements.filterQueryInput.addEventListener("input", (event) => {
    state.filterQuery = event.target.value;
    render();
  });

  elements.archiveFilterInput.addEventListener("input", (event) => {
    state.archiveFilterQuery = event.target.value;
    renderArchiveExplorer();
  });

  elements.archiveCategorySelect.addEventListener("change", (event) => {
    const value = event.target.value;
    if (value) {
      addArchiveValueFilter("categories", value);
      renderArchiveExplorer();
    }
  });

  elements.archiveTagSelect.addEventListener("change", (event) => {
    const value = event.target.value;
    if (value) {
      addArchiveValueFilter("tags", value);
      renderArchiveExplorer();
    }
  });

  elements.selectAllSessionsCheckbox.addEventListener("change", (event) => {
    const archiveView = getArchiveView();
    if (event.target.checked) {
      for (const session of archiveView.sessions) {
        state.selectedSessionIds.add(session.id);
      }
    } else {
      for (const session of archiveView.sessions) {
        state.selectedSessionIds.delete(session.id);
      }
    }
    renderArchiveExplorer();
  });

  elements.bulkDeleteConfirmButton.addEventListener("click", handleDeleteSelectedSessions);

  elements.bulkDeleteCancelButton.addEventListener("click", () => {
    state.selectedSessionIds.clear();
    state.selectedArchiveItemKeys.clear();
    renderArchiveExplorer();
  });

  elements.dedupeWithinSessionInput.addEventListener("change", (event) => {
    void updateSettings({
      dedupeWithinSession: event.target.checked
    });
  });

  elements.dedupeAcrossSessionsInput.addEventListener("change", (event) => {
    void updateSettings({
      dedupeAcrossSessions: event.target.checked
    });
  });

  elements.geminiApiKeyInput.addEventListener("input", (event) => {
    state.settings = {
      ...state.settings,
      geminiApiKey: event.target.value
    };
  });

  elements.geminiApiKeyInput.addEventListener("blur", (event) => {
    void updateSettings({
      geminiApiKey: event.target.value
    });
  });

  elements.geminiModelInput.addEventListener("input", (event) => {
    state.settings = {
      ...state.settings,
      geminiModel: event.target.value
    };
  });

  elements.geminiModelInput.addEventListener("blur", (event) => {
    void updateSettings({
      geminiModel: event.target.value
    });
  });

  elements.toggleGeminiApiKeyVisibilityButton.addEventListener("click", () => {
    handleToggleGeminiApiKeyVisibility();
  });

  elements.viewTabDraftButton.addEventListener("click", () => {
    state.activeView = "draft";
    render();
    elements.draftPane.querySelector("h2").focus();
  });

  elements.viewTabLibraryButton.addEventListener("click", () => {
    state.activeView = "library";
    render();
    elements.libraryPane.querySelector("h2").focus();
  });

  elements.viewTabWorkspaceButton.addEventListener("click", () => {
    state.activeView = "workspace";
    render();
    elements.workspacePane.querySelector("h2").focus();
  });

  elements.workspaceTopicInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleWorkspaceSearch();
  });

  elements.workspaceSearchBtn.addEventListener("click", handleWorkspaceSearch);
  elements.workspaceGenerateBtn.addEventListener("click", openWorkspacePromptModal);
  elements.workspacePromptClose.addEventListener("click", closeWorkspacePromptModal);
  elements.workspacePromptCancel.addEventListener("click", closeWorkspacePromptModal);
  elements.workspacePromptConfirm.addEventListener("click", handleWorkspaceGenerate);
  elements.workspacePromptModal.addEventListener("click", (e) => {
    if (e.target === elements.workspacePromptModal) closeWorkspacePromptModal();
  });
  elements.workspaceExportObsidianBtn.addEventListener("click", handleWorkspaceExportObsidian);
  elements.workspaceNewProjectBtn.addEventListener("click", handleWorkspaceNewProject);

  elements.obsidianVaultInput.addEventListener("blur", (e) => {
    void updateSettings({ obsidianVault: e.target.value.trim() });
  });

  elements.libraryBulkFillAiButton.addEventListener("click", openLibraryAiSelectionModal);
  elements.libraryBulkAiPauseButton.addEventListener("click", handleLibraryPauseAi);
  elements.libraryBulkAiStopButton.addEventListener("click", handleLibraryStopAi);
  elements.aiSelectionCloseButton.addEventListener("click", closeAiSelectionModal);
  elements.aiSelectionCancelButton.addEventListener("click", closeAiSelectionModal);
  elements.aiSelectionConfirmButton.addEventListener("click", handleConfirmAiSelectionModal);
  elements.aiSelectionModal.addEventListener("click", (event) => {
    if (event.target === elements.aiSelectionModal) {
      closeAiSelectionModal();
    }
  });

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);

  elements.importToggleButton.addEventListener("click", handleImportToggle);
  elements.importRunButton.addEventListener("click", handleImportRun);
  elements.importAiPauseButton.addEventListener("click", handleImportPauseAi);
  elements.importAiStopButton.addEventListener("click", handleImportStopAi);
  elements.syncNowButton.addEventListener("click", handleSyncNow);

  document.querySelectorAll("input[name='import-scope']").forEach((radio) => {
    radio.addEventListener("change", (event) => {
      const isFolder = event.target.value === "folder";
      elements.importFolderRow.hidden = !isFolder;
      if (isFolder && elements.importFolderSelect.options.length <= 1) {
        loadBookmarkFolders();
      }
    });
  });
}

function getDashboardLaunchIntent() {
  const params = new URLSearchParams(window.location.search);
  const capture = params.get("capture");
  const view = params.get("view");

  return {
    captureAll: capture === "all",
    view: ["library", "workspace"].includes(view) ? view : null,
    hasParams: params.has("capture") || params.has("view")
  };
}

function applyDashboardLaunchIntent(intent) {
  if (!state.items.length && intent.view !== "library" && intent.view !== "workspace") {
    state.phase = "capture";
    state.activeView = "draft";
  }

  if (intent.view === "library") {
    state.activeView = "library";
  }

  if (intent.view === "workspace") {
    state.activeView = "workspace";
  }

  if (intent.captureAll) {
    state.activeView = "draft";
  }
}

async function restoreDraft() {
  const stored = await extensionApi.storage.local.get(DRAFT_KEY);
  const draft = stored[DRAFT_KEY];

  if (!draft || !Array.isArray(draft.items)) {
    return;
  }

  state.sessionName = draft.sessionName || "";
  state.items = draft.items.map(normalizeDraftItem).filter(Boolean);
  state.skippedCount = Number.isFinite(draft.skippedCount) ? draft.skippedCount : 0;
  state.lastScannedAt = draft.lastScannedAt || null;
  state.collapsedCategories = Array.isArray(draft.collapsedCategories)
    ? draft.collapsedCategories
    : getAllCategoryNames(state.items);

  if (state.items.length) {
    state.phase = "review";
    setStatus(`Restored ${state.items.length} tabs from the last draft.`, "success");
  }
}

async function loadRecentArchives() {
  const stored = await extensionApi.storage.local.get([
    SAVED_SESSIONS_KEY,
    BOOKMARK_METADATA_KEY,
    AI_ENRICHMENT_CONTROL_KEY
  ]);
  const savedSessions = Array.isArray(stored[SAVED_SESSIONS_KEY])
    ? stored[SAVED_SESSIONS_KEY]
    : [];
  const metadataStore =
    stored[BOOKMARK_METADATA_KEY] && typeof stored[BOOKMARK_METADATA_KEY] === "object"
      ? stored[BOOKMARK_METADATA_KEY]
      : {};
  state.importEnrichmentControlPaused = Boolean(stored[AI_ENRICHMENT_CONTROL_KEY]?.paused);

  state.recentArchives = buildArchiveSessions(savedSessions, metadataStore);
  if (!state.libraryInitialized) {
    state.collapsedArchiveSessions = state.recentArchives.map((session) => session.id);
    state.libraryInitialized = true;
  } else {
    const previouslyExpanded = new Set(
      state.recentArchives
        .map((session) => session.id)
        .filter((id) => !state.collapsedArchiveSessions.includes(id))
    );
    state.collapsedArchiveSessions = state.recentArchives
      .map((session) => session.id)
      .filter((id) => !previouslyExpanded.has(id));
  }

  const validSessionIds = new Set(state.recentArchives.map((session) => session.id));
  for (const id of state.selectedSessionIds) {
    if (!validSessionIds.has(id)) {
      state.selectedSessionIds.delete(id);
    }
  }

  const validArchiveItemKeys = new Set(
    state.recentArchives.flatMap((session) =>
      session.items.map((item) => getArchiveItemEditorKey(session.id, item))
    )
  );
  for (const itemKey of state.selectedArchiveItemKeys) {
    if (!validArchiveItemKeys.has(itemKey)) {
      state.selectedArchiveItemKeys.delete(itemKey);
    }
  }

  syncImportEnrichmentTracking();
  if (state.recentArchives.some((session) => session.aiEnrichmentStatus === "pending")) {
    requestAiEnrichmentQueueDrain();
  }
}

function requestAiEnrichmentQueueDrain() {
  if (state.importEnrichmentControlPaused) {
    return;
  }

  void extensionApi.runtime
    .sendMessage({ type: "resume-ai-enrichment-queue" })
    .catch(() => {});
}

async function restoreSettings() {
  const stored = await extensionApi.storage.local.get(SETTINGS_KEY);
  state.settings = normalizeSettings(stored[SETTINGS_KEY]);
}

async function scanTabs() {
  setBusy(true);
  setStatus("Capturing tabs across all open windows...");

  try {
    const tabs = await extensionApi.tabs.query({
      windowType: "normal"
    });
    const bookmarkableTabs = tabs.filter(isBookmarkableTab);
    state.items = bookmarkableTabs.map((tab, index) => buildDraftItem(tab, index));
    state.skippedCount = tabs.length - bookmarkableTabs.length;
    state.lastScannedAt = new Date().toISOString();
    state.collapsedCategories = getAllCategoryNames(state.items);
    resetAiState();
    state.expandedTabIds = new Set();

    if (!state.sessionName.trim()) {
      state.sessionName = buildDefaultSessionName();
    }

    await persistDraft();
    state.activeView = "draft";
    state.phase = "review";
    render();

    const captureCount = state.items.length;
    const groupCount = getAllGroups().length;
    const skippedSuffix = state.skippedCount
      ? ` ${state.skippedCount} unsupported tab${state.skippedCount === 1 ? " was" : "s were"} skipped.`
      : "";
    const hasApiKey = String(state.settings.geminiApiKey || "").trim().length > 0;

    const aiSuggestion = hasApiKey
      ? " Use AI to enrich metadata when you're ready."
      : "";
    setStatus(
      `${captureCount} tabs grouped into ${groupCount} categories.${skippedSuffix}${aiSuggestion}`,
      "success"
    );
  } catch (error) {
    console.error("Failed to scan tabs", error);
    setStatus("Could not scan open tabs. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}

async function handleSaveBookmarks() {
  if (!state.items.length) {
    return;
  }

  if (!capabilities.nativeBookmarks) {
    setStatus(
      "Native bookmark creation is not available in this browser. Use JSON export instead.",
      "error"
    );
    return;
  }

  setBusy(true);
  setStatus("Saving session to the Browsing Library...");

  try {
    const response = await extensionApi.runtime.sendMessage({
      type: "create-bookmark-archive",
      payload: {
        sessionName: state.sessionName,
        items: state.items.map((item) => ({
          title: item.title,
          url: item.url,
          hostname: item.hostname,
          category: cleanCategory(item.category),
          description: item.description.trim(),
          summary: item.summary.trim(),
          tags: normalizeTags(item.tags),
          capturedAt: item.capturedAt,
          fieldSources: normalizeDraftFieldSources(item)
        }))
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Bookmark creation failed.");
    }

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
    if (response.result.duplicateCounts?.withinSession) {
      skippedSummary.push(`${response.result.duplicateCounts.withinSession} duplicate${response.result.duplicateCounts.withinSession === 1 ? "" : "s"} in this session`);
    }
    if (response.result.duplicateCounts?.acrossSessions) {
      skippedSummary.push(`${response.result.duplicateCounts.acrossSessions} already in the library`);
    }
    const skippedCopy = skippedSummary.length
      ? ` ${skippedSummary.join(", ")} skipped.`
      : "";
    setStatus(
      `${response.result.tabCount} tabs saved to "${response.result.sessionTitle}".${skippedCopy}`,
      "success"
    );
  } catch (error) {
    console.error("Failed to save bookmarks", error);
    setStatus(
      error instanceof Error ? error.message : "Could not save this session to the Browsing Library.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function handleExportJson() {
  if (!state.items.length) {
    return;
  }

  const exportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessionName: state.sessionName,
    skippedCount: state.skippedCount,
    items: state.items.map((item) => ({
      itemId: item.id,
      category: cleanCategory(item.category),
      linkUrl: item.url,
      title: item.title,
      hostname: item.hostname,
      description: item.description,
      summary: item.summary,
      tags: normalizeTags(item.tags),
      capturedAt: item.capturedAt
    }))
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json"
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = (state.sessionName || "browsing-library")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  anchor.href = objectUrl;
  anchor.download = `${safeName || "browsing-library"}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

  setStatus("Exported the current draft as JSON.", "success");
}

async function handleResetDraft() {
  await clearDraftState();
  state.phase = "capture";
  state.activeView = "draft";
  render();
  setStatus("Cleared the current draft.", "success");
}

function render() {
  const isSavePhase = state.phase === "save";
  const archiveView = getArchiveView();
  elements.dashboardShell.dataset.phase = state.phase;
  elements.dashboardShell.dataset.activeView = state.activeView;
  elements.sessionNameInput.value = state.sessionName;
  elements.filterQueryInput.value = state.filterQuery;
  elements.archiveFilterInput.value = state.archiveFilterQuery;
  elements.phaseCopy.textContent = getPhaseCopy();
  elements.tabCount.textContent = String(state.items.length);
  elements.categoryCount.textContent = String(getVisibleGroups().length);
  elements.skippedCount.textContent = String(state.skippedCount);
  elements.saveBookmarksButton.disabled = !capabilities.nativeBookmarks || !state.items.length;
  elements.exportJsonButton.disabled = !state.items.length;
  elements.proceedToSaveButton.disabled = !state.items.length;
  elements.backToReviewButton.disabled = !state.items.length;
  elements.resetDraftButton.disabled = !state.items.length && !state.sessionName;
  elements.toggleDraftCollapseButton.disabled = !state.items.length;
  elements.toggleDraftCollapseButton.textContent = areAllDraftGroupsCollapsed()
    ? "Expand All"
    : "Collapse All";
  elements.bulkFillAiButton.disabled = !state.items.length || state.bulkAiRunning || isSavePhase;
  elements.bulkFillAiButton.innerHTML = state.bulkAiRunning
    ? `${ICONS.sparkle}<span>Using AI...</span>`
    : `${ICONS.sparkle}<span>Use AI</span>`;
  elements.bulkAiPauseButton.hidden = !state.bulkAiRunning;
  elements.bulkAiStopButton.hidden = !state.bulkAiRunning;
  updateLibraryBulkAiButton(archiveView);
  elements.libraryBulkAiPauseButton.hidden = !state.libraryBulkAiRunning;
  elements.libraryBulkAiStopButton.hidden = !state.libraryBulkAiRunning;
  if (state.bulkAiRunning) {
    elements.bulkAiPauseButton.innerHTML = state.bulkAiPaused
      ? `${ICONS.resume} Resume`
      : `${ICONS.pause} Pause`;
  }
  if (state.libraryBulkAiRunning) {
    elements.libraryBulkAiPauseButton.innerHTML = state.libraryBulkAiPaused
      ? `${ICONS.resume} Resume`
      : `${ICONS.pause} Pause`;
  }
  updateImportEnrichmentControls();
  elements.settingsToggleButton.setAttribute("aria-expanded", String(state.settingsOpen));
  elements.settingsPanel.hidden = !state.settingsOpen;
  elements.dedupeWithinSessionInput.checked = state.settings.dedupeWithinSession;
  elements.dedupeAcrossSessionsInput.checked = state.settings.dedupeAcrossSessions;
  elements.geminiApiKeyInput.value = state.settings.geminiApiKey;
  elements.geminiApiKeyInput.type = state.geminiApiKeyVisible ? "text" : "password";
  elements.geminiModelInput.value = state.settings.geminiModel;
  elements.toggleGeminiApiKeyVisibilityButton.textContent = state.geminiApiKeyVisible
    ? "Hide"
    : "Show";
  elements.toggleGeminiApiKeyVisibilityButton.setAttribute(
    "aria-label",
    `${state.geminiApiKeyVisible ? "Hide" : "Show"} Gemini API key`
  );
  elements.toggleGeminiApiKeyVisibilityButton.setAttribute(
    "aria-pressed",
    String(state.geminiApiKeyVisible)
  );

  // View tab state
  const isDraftView = state.activeView === "draft";
  const isLibraryView = state.activeView === "library";
  const isWorkspaceView = state.activeView === "workspace";
  elements.viewTabBar.hidden = false;
  elements.viewTabDraftButton.classList.toggle("is-active", isDraftView);
  elements.viewTabDraftButton.setAttribute("aria-selected", String(isDraftView));
  elements.viewTabLibraryButton.classList.toggle("is-active", isLibraryView);
  elements.viewTabLibraryButton.setAttribute("aria-selected", String(isLibraryView));
  elements.viewTabWorkspaceButton.classList.toggle("is-active", isWorkspaceView);
  elements.viewTabWorkspaceButton.setAttribute("aria-selected", String(isWorkspaceView));
  elements.layoutPanel.classList.toggle("view-draft", isDraftView);
  elements.layoutPanel.classList.toggle("view-library", isLibraryView);
  elements.layoutPanel.classList.toggle("view-workspace", isWorkspaceView);
  elements.obsidianVaultInput.value = state.settings.obsidianVault;
  updatePhaseStrip();
  renderCategories();
  renderArchiveExplorer(archiveView);
  renderAiSelectionModal();
}

function getPhaseCopy() {
  if (state.phase === "review") {
    return "Review the draft, adjust categories and notes, then continue when the session feels right.";
  }

  if (state.phase === "save") {
    return "Final step: confirm the session name, then save or export this polished tab set.";
  }

  return "Start with a fresh capture of your current windows, then shape that draft into a reusable session.";
}

function openDraftAiSelectionModal() {
  if (!state.items.length || state.bulkAiRunning || state.phase === "save") {
    return;
  }

  state.aiSelectionModal = {
    open: true,
    mode: "draft",
    sessions: [
      {
        id: "draft",
        title: state.sessionName.trim() || "Current Draft",
        sourceLabel: "Current draft",
        items: state.items.map((item) => ({
          key: item.id,
          title: item.title,
          url: item.url,
          category: item.category,
          hostname: item.hostname,
          selected: true
        }))
      }
    ]
  };
  renderAiSelectionModal();
}

function openLibraryAiSelectionModal() {
  if (state.libraryBulkAiRunning) {
    return;
  }

  const sessions = buildLibraryAiSelectionSessions();
  if (!sessions.length) {
    setStatus("Select one or more sessions or tabs in the Library before using AI.", "error");
    return;
  }

  state.aiSelectionModal = {
    open: true,
    mode: "library",
    sessions
  };
  renderAiSelectionModal();
}

function buildLibraryAiSelectionSessions() {
  const sessions = [];

  for (const session of state.recentArchives) {
    const selectedKeys = new Set(
      session.items
        .map((item) => getArchiveItemEditorKey(session.id, item))
        .filter((itemKey) => state.selectedArchiveItemKeys.has(itemKey))
    );
    const hasExplicitTabs = selectedKeys.size > 0;
    const includeSession = state.selectedSessionIds.has(session.id) || hasExplicitTabs;

    if (!includeSession) {
      continue;
    }

    sessions.push({
      id: session.id,
      title: session.title,
      sourceLabel: "Browsing Library",
      items: session.items.map((item) => {
        const itemKey = getArchiveItemEditorKey(session.id, item);

        return {
          key: itemKey,
          title: item.title,
          url: item.url,
          category: item.category,
          hostname: item.hostname,
          selected: hasExplicitTabs ? selectedKeys.has(itemKey) : true
        };
      })
    });
  }

  return sessions;
}

function closeAiSelectionModal() {
  if (!state.aiSelectionModal.open) {
    return;
  }

  state.aiSelectionModal = {
    open: false,
    mode: null,
    sessions: []
  };
  renderAiSelectionModal();
}

async function handleConfirmAiSelectionModal() {
  const modalTargets = getAiSelectionModalTargets();
  if (!modalTargets.length) {
    setStatus("Select at least one tab before using AI.", "error");
    return;
  }

  const mode = state.aiSelectionModal.mode;
  closeAiSelectionModal();

  if (mode === "draft") {
    await handleBulkFillWithAi(modalTargets.map((target) => target.itemId));
    return;
  }

  if (mode === "library") {
    await handleLibraryBulkFillWithAi(
      modalTargets.map((target) => ({
        sessionId: target.sessionId,
        itemKey: target.itemKey
      }))
    );
  }
}

function renderAiSelectionModal() {
  const modal = state.aiSelectionModal;
  elements.aiSelectionModal.hidden = !modal.open;

  if (!modal.open) {
    elements.aiSelectionTitle.textContent = "Review AI Selection";
    elements.aiSelectionSummary.textContent = "";
    elements.aiSelectionSessionList.innerHTML = "";
    elements.aiSelectionConfirmButton.disabled = true;
    elements.aiSelectionConfirmButton.textContent = "Use AI";
    return;
  }

  const selectedTargets = getAiSelectionModalTargets();
  const selectedCount = selectedTargets.length;
  const categoryCount = new Set(selectedTargets.map((target) => target.category)).size;
  const sessionCount = modal.sessions.length;

  elements.aiSelectionTitle.textContent =
    modal.mode === "library" ? "Review Library AI Selection" : "Review Draft AI Selection";
  elements.aiSelectionSummary.textContent =
    modal.mode === "library"
      ? `${selectedCount} selected tab${selectedCount === 1 ? "" : "s"} across ${categoryCount} categor${categoryCount === 1 ? "y" : "ies"} in ${sessionCount} session${sessionCount === 1 ? "" : "s"}.`
      : `${selectedCount} selected tab${selectedCount === 1 ? "" : "s"} across ${categoryCount} categor${categoryCount === 1 ? "y" : "ies"} in the current draft.`;
  elements.aiSelectionConfirmButton.disabled = selectedCount === 0;
  elements.aiSelectionConfirmButton.textContent =
    `Use AI on ${selectedCount} tab${selectedCount === 1 ? "" : "s"}`;
  elements.aiSelectionSessionList.innerHTML = "";

  for (const session of modal.sessions) {
    elements.aiSelectionSessionList.appendChild(renderAiSelectionSession(session));
  }
}

function renderAiSelectionSession(session) {
  const section = document.createElement("section");
  section.className = "ai-selection-session";

  const header = document.createElement("div");
  header.className = "ai-selection-session-header";

  const label = document.createElement("label");
  label.className = "ai-selection-session-label";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  const selectedCount = session.items.filter((item) => item.selected).length;
  checkbox.checked = selectedCount === session.items.length && session.items.length > 0;
  checkbox.indeterminate = selectedCount > 0 && selectedCount < session.items.length;
  checkbox.addEventListener("change", () => {
    toggleAiSelectionSession(session.id, checkbox.checked);
  });

  const copy = document.createElement("div");
  copy.className = "ai-selection-session-copy";
  const title = document.createElement("strong");
  title.textContent = session.title;
  const detail = document.createElement("small");
  detail.textContent = session.sourceLabel;
  copy.append(title, detail);
  label.append(checkbox, copy);

  const meta = document.createElement("div");
  meta.className = "ai-selection-session-meta";
  const totalCategories = new Set(session.items.map((item) => item.category)).size;
  meta.textContent =
    `${selectedCount} / ${session.items.length} tabs selected · ${totalCategories} categor${totalCategories === 1 ? "y" : "ies"}`;

  header.append(label, meta);
  section.appendChild(header);

  const items = document.createElement("div");
  items.className = "ai-selection-items";

  for (const item of session.items) {
    items.appendChild(renderAiSelectionItem(session.id, item));
  }

  section.appendChild(items);
  return section;
}

function renderAiSelectionItem(sessionId, item) {
  const article = document.createElement("article");
  article.className = "ai-selection-item";

  const row = document.createElement("div");
  row.className = "ai-selection-item-row";

  const toggle = document.createElement("label");
  toggle.className = "ai-selection-item-toggle";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.selected;
  checkbox.addEventListener("change", () => {
    toggleAiSelectionItem(sessionId, item.key, checkbox.checked);
  });

  const copy = document.createElement("div");
  copy.className = "ai-selection-item-copy";
  const title = document.createElement("strong");
  title.textContent = item.title;
  const meta = document.createElement("small");
  meta.textContent = `${item.category} · ${item.hostname || getHostname(item.url)}`;
  copy.append(title, meta);
  toggle.append(checkbox, copy);

  const url = document.createElement("a");
  url.className = "ai-selection-item-url";
  url.href = item.url;
  url.target = "_blank";
  url.rel = "noreferrer";
  url.textContent = item.url;

  row.append(toggle, url);
  article.appendChild(row);
  return article;
}

function toggleAiSelectionSession(sessionId, selected) {
  state.aiSelectionModal = {
    ...state.aiSelectionModal,
    sessions: state.aiSelectionModal.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            items: session.items.map((item) => ({
              ...item,
              selected
            }))
          }
        : session
    )
  };
  renderAiSelectionModal();
}

function toggleAiSelectionItem(sessionId, itemKey, selected) {
  state.aiSelectionModal = {
    ...state.aiSelectionModal,
    sessions: state.aiSelectionModal.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            items: session.items.map((item) =>
              item.key === itemKey
                ? {
                    ...item,
                    selected
                  }
                : item
            )
          }
        : session
    )
  };
  renderAiSelectionModal();
}

function getAiSelectionModalTargets() {
  const targets = [];
  const mode = state.aiSelectionModal.mode;

  for (const session of state.aiSelectionModal.sessions) {
    for (const item of session.items) {
      if (!item.selected) {
        continue;
      }

      if (mode === "draft") {
        targets.push({
          itemId: item.key,
          category: item.category
        });
        continue;
      }

      targets.push({
        sessionId: session.id,
        itemKey: item.key,
        category: item.category
      });
    }
  }

  return targets;
}

function renderCategories() {
  const isSavePhase = state.phase === "save";
  const groups = getVisibleGroups();
  elements.categories.innerHTML = "";

  if (!groups.length) {
    elements.categories.innerHTML = `
      <div class="empty-state">
        <h3>${state.items.length ? "No matching tabs" : "No draft yet"}</h3>
        <p>${
          state.items.length
            ? "Adjust the filter or capture a new set of tabs to build a fresh draft."
            : "Capture all open windows to generate a working draft. You can then edit every tab, its category, description, summary, and tags before saving."
        }</p>
      </div>
    `;
    return;
  }

  for (const group of groups) {
    const categoryNode = elements.categoryTemplate.content.firstElementChild.cloneNode(true);
    const categoryInput = categoryNode.querySelector(".category-name-input");
    const categoryToggle = categoryNode.querySelector(".category-toggle");
    const toggleGlyph = categoryNode.querySelector(".toggle-glyph");
    const itemCount = categoryNode.querySelector(".item-count-pill");
    const itemContainer = categoryNode.querySelector(".tab-items");
    const isCollapsed = state.collapsedCategories.includes(group.name);

    categoryInput.value = group.name;
    itemCount.textContent = `${group.items.length} item${group.items.length === 1 ? "" : "s"}`;
    categoryToggle.setAttribute("aria-expanded", String(!isCollapsed));
    categoryToggle.setAttribute(
      "aria-label",
      `${isCollapsed ? "Expand" : "Collapse"} tab ${group.name}`
    );
    if (isCollapsed) {
      categoryNode.classList.add("is-collapsed");
    }

    categoryToggle.addEventListener("click", async () => {
      toggleCategory(group.name);
      await persistDraft();
      render();
    });

    const renameSaveButton = categoryNode.querySelector(".category-rename-save");
    const renameCancelButton = categoryNode.querySelector(".category-rename-cancel");
    const originalName = group.name;
    const itemCountValue = group.items.length;

    categoryInput.addEventListener("input", () => {
      renameSaveButton.disabled = isSavePhase || cleanCategory(categoryInput.value) === originalName;
    });
    categoryInput.disabled = isSavePhase;
    categoryToggle.disabled = isSavePhase;
    renameSaveButton.disabled = isSavePhase || categoryInput.value === originalName;
    renameCancelButton.disabled = isSavePhase;
    renameCancelButton.setAttribute(
      "aria-label",
      `Delete category ${group.name} from draft`
    );
    renameCancelButton.title = `Delete category and remove ${itemCountValue} tab${itemCountValue === 1 ? "" : "s"}`;

    renameSaveButton.addEventListener("click", async () => {
      if (state.phase === "save") {
        return;
      }

      const nextCategory = cleanCategory(categoryInput.value);
      renameCategory(group.name, nextCategory);
      await persistDraft();
      render();
      setStatus(`Category renamed to "${nextCategory}".`, "success");
    });

    renameCancelButton.addEventListener("click", async () => {
      if (state.phase === "save") {
        return;
      }

      const confirmed = window.confirm(
        `Delete category "${group.name}" and remove ${itemCountValue} tab${itemCountValue === 1 ? "" : "s"} from this draft?`
      );
      if (!confirmed) {
        return;
      }

      state.items = state.items.filter((item) => item.category !== group.name);
      await persistDraft();
      render();
      setStatus(
        `Deleted category "${group.name}" and removed ${itemCountValue} tab${itemCountValue === 1 ? "" : "s"} from the draft.`,
        "success"
      );
    });

    for (const item of group.items) {
      itemContainer.appendChild(renderTabItem(item));
    }

    elements.categories.appendChild(categoryNode);
  }
}

function renderTabItem(item) {
  const isSavePhase = state.phase === "save";
  const tabNode = elements.tabTemplate.content.firstElementChild.cloneNode(true);
  const title = tabNode.querySelector(".tab-title");
  const link = tabNode.querySelector(".tab-link");
  const hostnamePill = tabNode.querySelector(".hostname-pill");
  const aiButton = tabNode.querySelector(".tab-ai-button");
  const aiStatus = tabNode.querySelector(".tab-ai-status");
  const chipRow = tabNode.querySelector(".tab-chip-row");
  const categoryInput = tabNode.querySelector(".item-category-input");
  const tagsInput = tabNode.querySelector(".item-tags-input");
  const descriptionInput = tabNode.querySelector(".item-description-input");
  const summaryInput = tabNode.querySelector(".item-summary-input");
  const expandToggle = tabNode.querySelector(".tab-title-row");
  const expandGlyph = tabNode.querySelector(".tab-expand-glyph");
  const currentAiStatus = state.aiStatuses[item.id];
  const isAiLoading = Boolean(state.aiRequestTokens[item.id]);

  title.textContent = item.title;
  link.href = item.url;
  link.textContent = item.url;
  hostnamePill.textContent = item.hostname;
  aiButton.innerHTML = isAiLoading
    ? `${ICONS.close}<span>Stop AI</span>`
    : `${ICONS.sparkle}<span>Fill with AI</span>`;
  aiButton.disabled = !isAiLoading && (state.bulkAiRunning || isSavePhase);
  categoryInput.value = item.category;
  tagsInput.value = item.tags.join(", ");
  descriptionInput.value = item.description;
  summaryInput.value = item.summary;
  categoryInput.disabled = isSavePhase;
  tagsInput.disabled = isSavePhase;
  descriptionInput.disabled = isSavePhase;
  summaryInput.disabled = isSavePhase;

  const completionDot = tabNode.querySelector(".tab-completion-dot");
  const completionSr = tabNode.querySelector(".tab-completion-sr");
  const completion = getTabCompletion(item);
  tabNode.dataset.completion = completion;
  const completionTitles = { pending: "Pending", ai: "AI filled", user: "Reviewed" };
  completionDot.title = completionTitles[completion];
  if (completionSr) {
    completionSr.textContent = completionTitles[completion];
  }

  const titleRow = tabNode.querySelector(".tab-title-row");
  const faviconImg = document.createElement("img");
  faviconImg.className = "tab-favicon";
  faviconImg.width = 16;
  faviconImg.height = 16;
  faviconImg.alt = "";
  faviconImg.setAttribute("aria-hidden", "true");
  if (item.favIconUrl) {
    faviconImg.src = item.favIconUrl;
    faviconImg.addEventListener("error", () => {
      faviconImg.hidden = true;
    });
  } else {
    faviconImg.hidden = true;
  }
  titleRow.prepend(faviconImg);

  const isInitiallyExpanded = state.expandedTabIds.has(item.id);
  if (!isInitiallyExpanded) {
    tabNode.classList.add("is-collapsed");
  } else {
    expandToggle.setAttribute("aria-expanded", "true");
    expandToggle.setAttribute("aria-label", "Collapse tab fields");
  }

  function toggleExpand() {
    if (state.phase === "save") {
      return;
    }

    const isNowCollapsed = tabNode.classList.toggle("is-collapsed");
    const expanded = !isNowCollapsed;
    if (expanded) {
      state.expandedTabIds.add(item.id);
    } else {
      state.expandedTabIds.delete(item.id);
    }
    expandToggle.setAttribute("aria-expanded", String(expanded));
    expandToggle.setAttribute("aria-label", expanded ? "Collapse tab fields" : "Expand tab fields");
  }

  expandToggle.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    toggleExpand();
  });

  expandToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpand();
    }
  });

  tabNode.querySelector(".field-grid").addEventListener("focusin", () => {
    if (tabNode.classList.contains("is-collapsed")) {
      tabNode.classList.remove("is-collapsed");
      state.expandedTabIds.add(item.id);
      expandToggle.setAttribute("aria-expanded", "true");
      expandToggle.setAttribute("aria-label", "Collapse tab fields");
    }
  });

  if (currentAiStatus?.message) {
    aiStatus.hidden = false;
    aiStatus.textContent = currentAiStatus.message;
    if (currentAiStatus.tone) {
      aiStatus.dataset.tone = currentAiStatus.tone;
    } else {
      delete aiStatus.dataset.tone;
    }
  } else {
    aiStatus.hidden = true;
    aiStatus.textContent = "";
    delete aiStatus.dataset.tone;
  }

  if (item.tags.length) {
    for (const tag of item.tags) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag;
      chipRow.appendChild(chip);
    }
  } else {
    const emptyChip = document.createElement("span");
    emptyChip.className = "tag-chip tag-chip-empty";
    emptyChip.textContent = "No tags";
    chipRow.appendChild(emptyChip);
  }

  aiButton.addEventListener("click", () => {
    if (state.phase === "save") {
      return;
    }
    if (isAiLoading) {
      handleStopAiRequest(item.id);
      return;
    }
    handleFillWithAi(item.id);
  });

  categoryInput.addEventListener("change", async (event) => {
    updateDraftField(item.id, "category", cleanCategory(event.target.value));
    await persistDraft();
    render();
  });

  tagsInput.addEventListener("input", (event) => {
    updateDraftField(item.id, "tags", parseTags(event.target.value));
  });
  tagsInput.addEventListener("blur", async () => {
    await persistDraft();
    render();
  });

  descriptionInput.addEventListener("input", (event) => {
    updateDraftField(item.id, "description", event.target.value);
  });
  descriptionInput.addEventListener("blur", persistDraft);

  summaryInput.addEventListener("input", (event) => {
    updateDraftField(item.id, "summary", event.target.value);
  });
  summaryInput.addEventListener("blur", persistDraft);

  return tabNode;
}

function renderArchiveExplorer(archiveView = getArchiveView()) {
  elements.recentArchives.innerHTML = "";
  updateLibraryBulkAiButton(archiveView);

  renderArchiveFilterSelects();
  renderArchiveActiveFilters();
  renderArchiveSummary(archiveView);

  if (!state.recentArchives.length) {
    elements.recentArchives.innerHTML = `
      <div class="empty-state compact-empty">
        <h3>No library entries yet</h3>
        <p>Save a session to the Browsing Library so you can browse saved tabs and reopen them later.</p>
      </div>
    `;
    elements.librarySelectAllRow.hidden = true;
    elements.bulkDeleteBar.hidden = true;
    return;
  }

  if (!archiveView.sessions.length) {
    elements.recentArchives.innerHTML = `
      <div class="empty-state compact-empty">
        <h3>No matching library entries</h3>
        <p>Try a broader library filter to see sessions, categories, or matching tabs.</p>
      </div>
    `;
    elements.librarySelectAllRow.hidden = true;
    elements.bulkDeleteBar.hidden = true;
    return;
  }

  for (const archive of archiveView.sessions) {
    elements.recentArchives.appendChild(renderArchiveSession(archive));
  }

  const visibleSessionIds = archiveView.sessions.map((s) => s.id);
  const hasVisibleSessions = visibleSessionIds.length > 0;
  const selectedCount = [...state.selectedSessionIds].filter((id) =>
    visibleSessionIds.includes(id)
  ).length;

  elements.librarySelectAllRow.hidden = !hasVisibleSessions;
  if (hasVisibleSessions) {
    elements.selectAllSessionsCheckbox.checked = selectedCount === visibleSessionIds.length;
    elements.selectAllSessionsCheckbox.indeterminate =
      selectedCount > 0 && selectedCount < visibleSessionIds.length;
  }

  const totalSelected = state.selectedSessionIds.size;
  elements.bulkDeleteBar.hidden = totalSelected === 0;
  if (totalSelected > 0) {
    elements.bulkDeleteCount.textContent = `${totalSelected} session${totalSelected === 1 ? "" : "s"} selected`;
  }
}

function renderArchiveFilterSelects() {
  const categories = new Set();
  const tags = new Set();

  for (const session of state.recentArchives) {
    for (const item of session.items) {
      if (item.category) categories.add(item.category);
      for (const tag of (item.tags || [])) tags.add(tag);
    }
  }

  const activeCategories = new Set(state.archiveFilters.categories.map((v) => v.toLowerCase()));
  const activeTags = new Set(state.archiveFilters.tags.map((v) => v.toLowerCase()));

  const rebuildSelect = (selectEl, values, activeSet) => {
    const placeholder = selectEl.dataset.placeholder || "";
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    for (const val of [...values].sort((a, b) => a.localeCompare(b))) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      if (activeSet.has(val.toLowerCase())) opt.disabled = true;
      selectEl.appendChild(opt);
    }
    selectEl.value = "";
  };

  rebuildSelect(elements.archiveCategorySelect, categories, activeCategories);
  rebuildSelect(elements.archiveTagSelect, tags, activeTags);

  const hasArchives = state.recentArchives.length > 0;
  elements.archiveCategorySelect.closest(".archive-filter-selects").hidden = !hasArchives;
}

function renderArchiveActiveFilters() {
  const filterEntries = getActiveArchiveFilters();

  if (!filterEntries.length) {
    elements.archiveActiveFilters.hidden = true;
    elements.archiveActiveFilters.innerHTML = "";
    return;
  }

  elements.archiveActiveFilters.hidden = false;
  elements.archiveActiveFilters.innerHTML = "";

  for (const entry of filterEntries) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "archive-filter-chip";
    chip.textContent = `${entry.label}: ${entry.value}`;
    chip.addEventListener("click", () => {
      removeArchiveFilter(entry.type, entry.id);
      renderArchiveExplorer();
    });
    elements.archiveActiveFilters.appendChild(chip);
  }

  const archiveView = getArchiveView();
  const filteredTabCount = archiveView.sessions.reduce((sum, s) => sum + s.items.length, 0);

  if (filteredTabCount > 0) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ghost-button small-button danger-button";
    deleteButton.textContent = `Delete ${filteredTabCount} tab${filteredTabCount === 1 ? "" : "s"}`;
    deleteButton.addEventListener("click", handleDeleteFilteredTabs);
    elements.archiveActiveFilters.appendChild(deleteButton);
  }

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "ghost-button small-button";
  clearButton.textContent = "Clear All";
  clearButton.addEventListener("click", () => {
    clearArchiveFilters();
    renderArchiveExplorer();
  });
  elements.archiveActiveFilters.appendChild(clearButton);
}

function renderArchiveSummary(archiveView) {
  if (!state.recentArchives.length) {
    elements.archiveSummary.innerHTML = `
      <p class="history-meta">Saved sessions will appear here after you add them to the Browsing Library.</p>
    `;
    return;
  }

  if (!state.archiveFilterQuery.trim() && !getActiveArchiveFilters().length) {
    elements.archiveSummary.innerHTML = `
      <p class="history-meta">
        ${state.recentArchives.length} saved session${state.recentArchives.length === 1 ? "" : "s"} ready to reopen.
      </p>
    `;
    return;
  }

  if (!archiveView.matchedUrls.length) {
    const emptyReason = state.archiveFilterQuery.trim()
      ? `matched "${escapeHtml(state.archiveFilterQuery)}"`
      : "matched the current filters";
    elements.archiveSummary.innerHTML = `
      <p class="history-meta">No Browsing Library tabs ${emptyReason}.</p>
    `;
    return;
  }

  elements.archiveSummary.innerHTML = "";

  const copy = document.createElement("p");
  copy.className = "history-meta";
  copy.textContent =
      `${archiveView.matchedUrls.length} matching tabs across ${archiveView.sessions.length} sessions and ${archiveView.categoryCount} categories in the Browsing Library.`;

  const actionRow = document.createElement("div");
  actionRow.className = "history-actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "secondary-button small-button";
  openButton.textContent = "Open Matching Tabs";
  openButton.addEventListener("click", () => {
    reopenArchiveUrls(
      archiveView.matchedUrls,
      `Opened ${archiveView.matchedUrls.length} filtered Browsing Library tabs.`
    );
  });

  actionRow.appendChild(openButton);
  elements.archiveSummary.append(copy, actionRow);
}

function renderArchiveSession(session) {
  const node = elements.historyTemplate.content.firstElementChild.cloneNode(true);

  const sessionCheckbox = document.createElement("input");
  sessionCheckbox.type = "checkbox";
  sessionCheckbox.className = "session-select-checkbox";
  sessionCheckbox.setAttribute("aria-label", `Select session ${session.title}`);
  sessionCheckbox.checked = state.selectedSessionIds.has(session.id);
  sessionCheckbox.addEventListener("change", () => {
    if (sessionCheckbox.checked) {
      state.selectedSessionIds.add(session.id);
    } else {
      state.selectedSessionIds.delete(session.id);
    }
    renderArchiveExplorer();
  });
  node.querySelector(".history-session-main").prepend(sessionCheckbox);

  const sessionToggle = node.querySelector(".history-session-toggle");
  const toggleGlyph = node.querySelector(".toggle-glyph");
  const titleNode = node.querySelector(".history-title");
  const metaNode = node.querySelector(".history-meta");
  const countNode = node.querySelector(".history-count");
  const openSessionButton = node.querySelector(".history-open-session");
  const deleteSessionButton = node.querySelector(".history-delete-session");
  const itemList = node.querySelector(".history-item-list");
  const aiBadge = node.querySelector(".ai-enrichment-badge");
  const categoryCount = new Set(session.items.map((item) => item.category)).size;

  if (session.aiEnrichmentStatus === "pending") {
    aiBadge.hidden = false;
    aiBadge.dataset.status = "pending";
    aiBadge.innerHTML = `${ICONS.sparkle} AI enriching…`;
  } else if (session.aiEnrichmentStatus === "paused") {
    aiBadge.hidden = false;
    aiBadge.dataset.status = "paused";
    aiBadge.innerHTML = `${ICONS.pause} AI paused`;
  } else if (session.aiEnrichmentStatus === "stopped") {
    aiBadge.hidden = false;
    aiBadge.dataset.status = "stopped";
    aiBadge.innerHTML = `${ICONS.close} Retry AI`;
    aiBadge.addEventListener("click", () => handleRetryAiEnrichment(session.id));
  } else if (session.aiEnrichmentStatus === "failed") {
    aiBadge.hidden = false;
    aiBadge.dataset.status = "failed";
    aiBadge.innerHTML = `${ICONS.warning} Retry AI`;
    aiBadge.addEventListener("click", () => handleRetryAiEnrichment(session.id));
  } else if (session.aiFilledItemCount > 0) {
    aiBadge.hidden = false;
    aiBadge.dataset.status = "done";
    aiBadge.innerHTML = `${ICONS.sparkle} AI enhanced`;
    aiBadge.title = `${session.aiFilledItemCount} tab${session.aiFilledItemCount === 1 ? "" : "s"} in this session include AI-generated metadata.`;
  }
  const isCollapsed = state.collapsedArchiveSessions.includes(session.id);

  sessionToggle.setAttribute("aria-expanded", String(!isCollapsed));
  sessionToggle.setAttribute(
    "aria-label",
    `${isCollapsed ? "Expand" : "Collapse"} saved session ${session.title}`
  );
  if (isCollapsed) {
    node.classList.add("is-collapsed");
  }

  sessionToggle.addEventListener("click", () => {
    toggleArchiveSession(session.id);
    renderArchiveExplorer();
  });

  titleNode.textContent = "";
  const titleButton = document.createElement("button");
  titleButton.type = "button";
  titleButton.className = "history-title-button";
  titleButton.textContent = session.title;
  titleButton.addEventListener("click", () => {
    addArchiveSessionFilter(session);
    renderArchiveExplorer();
  });
  titleNode.appendChild(titleButton);

  metaNode.textContent = "";
  const metaButton = document.createElement("button");
  metaButton.type = "button";
  metaButton.className = "history-meta-button";
  metaButton.textContent = `${categoryCount} categories · ${formatDateTime(session.createdAt)}`;
  metaButton.addEventListener("click", () => {
    addArchiveSessionFilter(session);
    renderArchiveExplorer();
  });
  metaNode.appendChild(metaButton);

  countNode.textContent = `${session.items.length} tab${session.items.length === 1 ? "" : "s"}`;

  openSessionButton.textContent = "Open Session";
  openSessionButton.addEventListener("click", () => {
    reopenArchiveUrls(
      session.totalItemList.map((item) => item.url),
      `Opened ${session.totalItemList.length} tabs from "${session.title}".`
    );
  });

  deleteSessionButton.addEventListener("click", () => {
    handleDeleteArchiveSession(session);
  });

  for (const item of session.items) {
    itemList.appendChild(renderArchiveItemCard(session, item));
  }

  return node;
}

function renderArchiveItemCard(session, item) {
  const row = document.createElement("article");
  row.className = "history-tab-card";

  const editorKey = getArchiveItemEditorKey(session.id, item);
  const isEditing = state.editingArchiveItemKey === editorKey;
  const isSelected = state.selectedArchiveItemKeys.has(editorKey);

  const topRow = document.createElement("div");
  topRow.className = "history-tab-card-top";

  const categoryButton = document.createElement("button");
  categoryButton.type = "button";
  categoryButton.className = "history-card-category";
  categoryButton.textContent = item.category;
  categoryButton.addEventListener("click", () => {
    addArchiveValueFilter("categories", item.category);
    renderArchiveExplorer();
  });

  const actions = document.createElement("div");
  actions.className = "history-item-actions";
  const itemKey = getArchiveItemEditorKey(session.id, item);
  const currentAiStatus = state.aiStatuses[itemKey];
  const isAiLoading = Boolean(state.aiRequestTokens[itemKey]);
  const isAiFilled = isArchiveItemAiFilled(item, session.aiEnrichmentStatus);
  const itemCheckbox = document.createElement("input");
  itemCheckbox.type = "checkbox";
  itemCheckbox.className = "archive-item-select-checkbox";
  itemCheckbox.checked = isSelected;
  itemCheckbox.setAttribute("aria-label", `Select tab ${item.title}`);
  itemCheckbox.addEventListener("change", () => {
    if (itemCheckbox.checked) {
      state.selectedArchiveItemKeys.add(itemKey);
    } else {
      state.selectedArchiveItemKeys.delete(itemKey);
    }
    renderArchiveExplorer();
  });

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "ghost-button small-button";
  editButton.textContent = isEditing ? "Close" : "Edit";
  editButton.addEventListener("click", () => {
    if (isEditing) {
      cancelArchiveItemEdit();
      return;
    }

    startArchiveItemEdit(session, item);
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "ghost-button danger-button small-button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => {
    handleDeleteArchiveItem(session, item);
  });

  const aiButton = document.createElement("button");
  aiButton.type = "button";
  aiButton.className = "tab-ai-button small-button";
  aiButton.innerHTML = isAiLoading
    ? `${ICONS.close}<span>Stop AI</span>`
    : `${ICONS.sparkle}<span>Fill with AI</span>`;
  aiButton.disabled = !isAiLoading && state.libraryBulkAiRunning;
  aiButton.addEventListener("click", () => {
    if (isAiLoading) {
      handleStopAiRequest(itemKey);
      return;
    }
    handleArchiveFillWithAi(session.id, item);
  });

  actions.append(aiButton, editButton, deleteButton);
  topRow.append(itemCheckbox, categoryButton, actions);
  row.appendChild(topRow);

  if (isAiFilled || item.tags.length) {
    const tagRow = document.createElement("div");
    tagRow.className = "history-card-tag-row";

    if (isAiFilled) {
      const aiChip = document.createElement("span");
      aiChip.className = "history-ai-chip";
      aiChip.textContent = "AI filled";
      tagRow.appendChild(aiChip);
    }

    for (const tag of item.tags) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "history-filter-chip";
      chip.textContent = tag;
      chip.addEventListener("click", () => {
        addArchiveValueFilter("tags", tag);
        renderArchiveExplorer();
      });
      tagRow.appendChild(chip);
    }

    row.appendChild(tagRow);
  }

  const titleLink = document.createElement("a");
  titleLink.className = "history-item-link";
  titleLink.href = item.url;
  titleLink.target = "_blank";
  titleLink.rel = "noreferrer";
  titleLink.textContent = item.title;
  row.appendChild(titleLink);

  const urlLink = document.createElement("a");
  urlLink.className = "history-item-url";
  urlLink.href = item.url;
  urlLink.target = "_blank";
  urlLink.rel = "noreferrer";
  urlLink.textContent = item.url;
  row.appendChild(urlLink);

  const meta = document.createElement("p");
  meta.className = "history-item-meta";
  meta.textContent = `Saved ${formatDateTime(item.archivedAt || session.createdAt)}`;
  row.appendChild(meta);

  const summaryText = String(item.summary || item.description || "").trim();
  if (summaryText) {
    const summary = document.createElement("p");
    summary.className = "history-item-summary";
    summary.textContent = summaryText;
    row.appendChild(summary);
  }

  if (currentAiStatus?.message) {
    const aiStatus = document.createElement("p");
    aiStatus.className = "tab-ai-status history-item-ai-status";
    aiStatus.textContent = currentAiStatus.message;
    if (currentAiStatus.tone) {
      aiStatus.dataset.tone = currentAiStatus.tone;
    }
    row.appendChild(aiStatus);
  }

  if (isEditing && state.archiveItemEditor) {
    row.appendChild(renderArchiveItemEditor());
  }

  return row;
}

function renderArchiveItemEditor() {
  const editor = document.createElement("section");
  editor.className = "archive-item-editor";

  const grid = document.createElement("div");
  grid.className = "archive-item-editor-grid";

  const categoryField = document.createElement("label");
  categoryField.className = "field";
  const categoryLabel = document.createElement("span");
  categoryLabel.textContent = "Category";
  const categoryInput = document.createElement("input");
  categoryInput.type = "text";
  categoryInput.value = state.archiveItemEditor.category;
  categoryInput.addEventListener("input", (event) => {
    updateArchiveItemEditorField("category", event.target.value);
  });
  categoryField.append(categoryLabel, categoryInput);

  const tagsField = document.createElement("label");
  tagsField.className = "field";
  const tagsLabel = document.createElement("span");
  tagsLabel.textContent = "Tags";
  const tagsInput = document.createElement("input");
  tagsInput.type = "text";
  tagsInput.placeholder = "research, reference, priority";
  tagsInput.value = state.archiveItemEditor.tagsText;
  tagsInput.addEventListener("input", (event) => {
    updateArchiveItemEditorField("tagsText", event.target.value);
  });
  tagsField.append(tagsLabel, tagsInput);

  const descriptionField = document.createElement("label");
  descriptionField.className = "field archive-item-editor-description";
  const descriptionLabel = document.createElement("span");
  descriptionLabel.textContent = "Description";
  const descriptionInput = document.createElement("textarea");
  descriptionInput.rows = 2;
  descriptionInput.placeholder = "Why this saved tab matters";
  descriptionInput.value = state.archiveItemEditor.description;
  descriptionInput.addEventListener("input", (event) => {
    updateArchiveItemEditorField("description", event.target.value);
  });
  descriptionField.append(descriptionLabel, descriptionInput);

  const summaryField = document.createElement("label");
  summaryField.className = "field archive-item-editor-description";
  const summaryLabel = document.createElement("span");
  summaryLabel.textContent = "Summary";
  const summaryInput = document.createElement("textarea");
  summaryInput.rows = 2;
  summaryInput.placeholder = "Short summary for later retrieval";
  summaryInput.value = state.archiveItemEditor.summary;
  summaryInput.addEventListener("input", (event) => {
    updateArchiveItemEditorField("summary", event.target.value);
  });
  summaryField.append(summaryLabel, summaryInput);

  grid.append(categoryField, tagsField, descriptionField, summaryField);
  editor.appendChild(grid);

  const actionRow = document.createElement("div");
  actionRow.className = "category-editor-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "ghost-button small-button";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", cancelArchiveItemEdit);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "secondary-button small-button";
  saveButton.textContent = "Save";
  saveButton.addEventListener("click", saveArchiveItemEditor);

  actionRow.append(cancelButton, saveButton);
  editor.appendChild(actionRow);

  return editor;
}

async function handleFillWithAi(itemId) {
  await runAiFillForItem(itemId);
}

async function handleArchiveFillWithAi(sessionId, item) {
  const result = await runAiFillForArchiveItem(sessionId, item);
  if (!result?.ok) {
    return;
  }

  setStatus(
    result.changed
      ? `Updated "${item.title}" with AI metadata.`
      : `AI reviewed "${item.title}" but did not change its metadata.`,
    "success"
  );
}

async function handleBulkFillWithAi(selectedItemIds = state.items.map((item) => item.id)) {
  if (!state.items.length || state.bulkAiRunning || state.phase === "save") {
    return;
  }

  try {
    getGeminiConfig();
  } catch (error) {
    const message = getErrorMessage(error, "Could not generate draft.");
    setStatus(message, "error");
    return;
  }

  state.bulkAiRunning = true;
  state.bulkAiCancelled = false;
  state.bulkAiPaused = false;
  state.bulkAiCurrentItemId = null;
  render();

  const itemIds = selectedItemIds.filter((itemId) => getDraftItem(itemId));
  if (!itemIds.length) {
    setStatus("Select at least one draft tab before using AI.", "error");
    return;
  }
  let completed = 0;
  let updated = 0;
  let failed = 0;
  let succeeded = 0;
  let mergedCategoryCount = 0;

  try {
    let index = 0;

    while (index < itemIds.length) {
      if (state.bulkAiCancelled) break;

      if (state.bulkAiPaused) {
        setStatus(`AI paused after ${completed} of ${itemIds.length} tabs — click Resume to continue.`);
        await new Promise((resolve) => {
          state.bulkAiResumeResolve = resolve;
        });
        state.bulkAiResumeResolve = null;
        if (state.bulkAiCancelled) break;
      }

      const itemId = itemIds[index];
      if (!getDraftItem(itemId)) {
        index += 1;
        continue;
      }

      state.bulkAiCurrentItemId = itemId;
      setStatus(`Using AI on ${completed + 1} of ${itemIds.length} tabs...`);
      const result = await runAiFillForItem(itemId);
      state.bulkAiCurrentItemId = null;
      if (result?.ok) {
        completed += 1;
        index += 1;
        succeeded += 1;
        if (result.changed) {
          updated += 1;
        }
        mergedCategoryCount += result.mergedCategoryCount || 0;
      } else if (result?.aborted) {
        if (state.bulkAiCancelled) {
          break;
        }
        if (state.bulkAiPaused) {
          continue;
        }
      } else {
        completed += 1;
        index += 1;
        failed += 1;
      }
    }

    if (succeeded && !state.bulkAiCancelled) {
      const mergeResult = await finalizeBulkAiCategoryMerge();
      mergedCategoryCount += mergeResult.mergedCategoryCount;
    }
  } finally {
    state.bulkAiRunning = false;
    state.bulkAiPaused = false;
    state.bulkAiResumeResolve = null;
    state.bulkAiCurrentItemId = null;
    render();
  }

  if (state.bulkAiCancelled) {
    state.bulkAiCancelled = false;
    setStatus(`AI stopped after ${completed} of ${itemIds.length} tabs. Updated ${updated}.`);
    return;
  }

  if (failed) {
    setStatus(
      formatBulkAiStatus(completed, updated, failed, mergedCategoryCount),
      "error"
    );
    return;
  }

  setStatus(formatBulkAiStatus(completed, updated, 0, mergedCategoryCount), "success");
}

async function handleLibraryBulkFillWithAi(targets = getSelectedLibraryAiTargets()) {
  if (state.libraryBulkAiRunning) {
    return;
  }

  if (!targets.length) {
    setStatus("Select one or more sessions or tabs in the Library before using AI.", "error");
    return;
  }

  try {
    getGeminiConfig();
  } catch (error) {
    setStatus(getErrorMessage(error, "Could not generate library metadata."), "error");
    return;
  }

  state.libraryBulkAiRunning = true;
  state.libraryBulkAiPaused = false;
  state.libraryBulkAiCancelled = false;
  state.libraryBulkAiCurrentItemKey = null;
  render();

  let completed = 0;
  let updated = 0;
  let failed = 0;

  try {
    let index = 0;

    while (index < targets.length) {
      if (state.libraryBulkAiCancelled) break;

      if (state.libraryBulkAiPaused) {
        setStatus(
          `Library AI paused after ${completed} of ${targets.length} tabs — click Resume to continue.`
        );
        await new Promise((resolve) => {
          state.libraryBulkAiResumeResolve = resolve;
        });
        state.libraryBulkAiResumeResolve = null;
        if (state.libraryBulkAiCancelled) break;
      }

      const target = targets[index];
      const currentItem = getArchiveItemByKey(target.sessionId, target.itemKey);
      if (!currentItem) {
        index += 1;
        continue;
      }

      state.libraryBulkAiCurrentItemKey = target.itemKey;
      setStatus(`Using AI on ${completed + 1} of ${targets.length} library tabs...`);
      const result = await runAiFillForArchiveItem(target.sessionId, currentItem);
      state.libraryBulkAiCurrentItemKey = null;
      if (result?.ok) {
        completed += 1;
        index += 1;
        if (result.changed) {
          updated += 1;
        }
      } else if (result?.aborted) {
        if (state.libraryBulkAiCancelled) {
          break;
        }
        if (state.libraryBulkAiPaused) {
          continue;
        }
      } else {
        completed += 1;
        index += 1;
        failed += 1;
      }
    }
  } finally {
    state.libraryBulkAiRunning = false;
    state.libraryBulkAiPaused = false;
    state.libraryBulkAiResumeResolve = null;
    state.libraryBulkAiCurrentItemKey = null;
    render();
  }

  if (state.libraryBulkAiCancelled) {
    state.libraryBulkAiCancelled = false;
    setStatus(
      `Library AI stopped after ${completed} of ${targets.length} tab${completed === 1 ? "" : "s"}. Updated ${updated}.`
    );
    return;
  }

  state.libraryBulkAiCancelled = false;

  if (failed) {
    setStatus(
      `AI reviewed ${completed} library tab${completed === 1 ? "" : "s"}. Updated ${updated}, ${failed} failed.`,
      "error"
    );
    return;
  }

  setStatus(
    `AI reviewed ${completed} library tab${completed === 1 ? "" : "s"} and updated ${updated}.`,
    "success"
  );
}

function handlePauseAi() {
  if (!state.bulkAiRunning) return;
  if (state.bulkAiPaused) {
    state.bulkAiPaused = false;
    if (state.bulkAiResumeResolve) {
      state.bulkAiResumeResolve();
    }
    setStatus("AI resumed.");
  } else {
    state.bulkAiPaused = true;
    if (state.bulkAiCurrentItemId) {
      abortAiRequest(state.bulkAiCurrentItemId, "AI paused.");
    }
    setStatus("AI pausing...");
  }
  render();
}

function handleStopAi() {
  if (!state.bulkAiRunning) return;
  state.bulkAiCancelled = true;
  if (state.bulkAiCurrentItemId) {
    abortAiRequest(state.bulkAiCurrentItemId, "AI stopped.");
  }
  if (state.bulkAiPaused && state.bulkAiResumeResolve) {
    state.bulkAiPaused = false;
    state.bulkAiResumeResolve();
  }
  render();
}

function handleLibraryPauseAi() {
  if (!state.libraryBulkAiRunning) return;
  if (state.libraryBulkAiPaused) {
    state.libraryBulkAiPaused = false;
    if (state.libraryBulkAiResumeResolve) {
      state.libraryBulkAiResumeResolve();
    }
    setStatus("Library AI resumed.");
  } else {
    state.libraryBulkAiPaused = true;
    if (state.libraryBulkAiCurrentItemKey) {
      abortAiRequest(state.libraryBulkAiCurrentItemKey, "Library AI paused.");
    }
    setStatus("Library AI pausing...");
  }
  render();
}

function handleLibraryStopAi() {
  if (!state.libraryBulkAiRunning) return;
  state.libraryBulkAiCancelled = true;
  if (state.libraryBulkAiCurrentItemKey) {
    abortAiRequest(state.libraryBulkAiCurrentItemKey, "Library AI stopped.");
  }
  if (state.libraryBulkAiPaused && state.libraryBulkAiResumeResolve) {
    state.libraryBulkAiPaused = false;
    state.libraryBulkAiResumeResolve();
  }
  render();
}

function handleStopAiRequest(itemKey) {
  if (abortAiRequest(itemKey, "AI stopped.")) {
    setStatus("AI stopped.");
  }
}

async function runAiFillForItem(itemId) {
  const item = getDraftItem(itemId);
  if (!item) {
    return { ok: false, changed: false, mergedCategoryCount: 0 };
  }

  const categoryContext = buildCategoryContext();

  const requestToken = makeId("ai-fill");
  const controller = new AbortController();
  state.aiRequestTokens = {
    ...state.aiRequestTokens,
    [itemId]: requestToken
  };
  state.aiAbortControllers = {
    ...state.aiAbortControllers,
    [itemId]: controller
  };
  state.aiStatuses = {
    ...state.aiStatuses,
    [itemId]: {
      message: "Generating draft...",
      tone: null
    }
  };
  render();

  try {
    const payload = await requestAiFillPayload(item, categoryContext, controller.signal);
    if (!isCurrentAiRequest(itemId, requestToken)) {
      return { ok: false, changed: false, mergedCategoryCount: 0 };
    }

    const currentItem = getDraftItem(itemId);
    if (!currentItem) {
      clearAiRequest(itemId, requestToken);
      return { ok: false, changed: false, mergedCategoryCount: 0 };
    }

    const nextItem = applyAiPayloadToDraftItem(currentItem, payload);
    replaceItem(itemId, nextItem);
    await persistDraft();

    if (!isCurrentAiRequest(itemId, requestToken)) {
      return { ok: false, changed: false, mergedCategoryCount: 0 };
    }

    const changed = didItemChange(currentItem, nextItem);
    clearAiRequest(itemId, requestToken, {
      message: changed ? "AI draft ready." : "No AI changes were applied.",
      tone: "success"
    });
    render();
    return {
      ok: true,
      changed,
      mergedCategoryCount: payload._categoryResolution?.merged ? 1 : 0
    };
  } catch (error) {
    if (!isCurrentAiRequest(itemId, requestToken)) {
      return { ok: false, changed: false, mergedCategoryCount: 0 };
    }

    if (isAiRequestAborted(error, controller.signal)) {
      const message = getAiAbortMessage(controller.signal, "AI stopped.");
      clearAiRequest(itemId, requestToken, {
        message,
        tone: null
      });
      render();
      return { ok: false, changed: false, mergedCategoryCount: 0, aborted: true };
    }

    console.error("Failed to fill draft with AI", error);
    const message = getErrorMessage(error, "Could not generate draft.");
    clearAiRequest(itemId, requestToken, {
      message,
      tone: "error"
    });
    setStatus(message, "error");
    render();
    return { ok: false, changed: false, mergedCategoryCount: 0 };
  } finally {
    clearAiAbortController(itemId, controller);
  }
}

async function runAiFillForArchiveItem(sessionId, item) {
  const itemKey = getArchiveItemEditorKey(sessionId, item);
  const currentItem = getArchiveItemByKey(sessionId, itemKey);
  if (!currentItem) {
    return { ok: false, changed: false };
  }

  const aiInput = buildArchiveAiInput(currentItem, itemKey);
  const categoryContext = buildCategoryContext();
  const requestToken = makeId("archive-ai-fill");
  const controller = new AbortController();

  state.aiRequestTokens = {
    ...state.aiRequestTokens,
    [itemKey]: requestToken
  };
  state.aiAbortControllers = {
    ...state.aiAbortControllers,
    [itemKey]: controller
  };
  state.aiStatuses = {
    ...state.aiStatuses,
    [itemKey]: {
      message: "Generating library metadata...",
      tone: null
    }
  };
  renderArchiveExplorer();

  try {
    const payload = await requestAiFillPayload(aiInput, categoryContext, controller.signal);
    if (!isCurrentAiRequest(itemKey, requestToken)) {
      return { ok: false, changed: false };
    }

    const latestItem = getArchiveItemByKey(sessionId, itemKey);
    if (!latestItem) {
      clearAiRequest(itemKey, requestToken);
      return { ok: false, changed: false };
    }

    const nextValues = {
      category: cleanCategory(payload.category),
      description: payload.description.trim(),
      summary: payload.summary.trim(),
      tags: normalizeTags(payload.tags)
    };
    const changed = didArchiveItemChange(latestItem, nextValues);

    const response = await extensionApi.runtime.sendMessage({
      type: "update-archive-item",
      payload: {
        sessionId,
        bookmarkId: latestItem.bookmarkId,
        title: latestItem.title,
        url: latestItem.url,
        category: nextValues.category,
        description: nextValues.description,
        summary: nextValues.summary,
        tags: nextValues.tags,
        updateSource: FIELD_SOURCES.ai
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not update the Browsing Library tab.");
    }

    applyArchiveItemUpdateToState(sessionId, itemKey, {
      ...nextValues,
      fieldSources: normalizeArchiveFieldSources({
        fieldSources: response.result?.fieldSources
      })
    });

    clearAiRequest(itemKey, requestToken, {
      message: changed ? "AI metadata saved." : "No AI changes were applied.",
      tone: "success"
    });
    renderArchiveExplorer();
    return { ok: true, changed };
  } catch (error) {
    if (!isCurrentAiRequest(itemKey, requestToken)) {
      return { ok: false, changed: false };
    }

    if (isAiRequestAborted(error, controller.signal)) {
      const message = getAiAbortMessage(controller.signal, "AI stopped.");
      clearAiRequest(itemKey, requestToken, {
        message,
        tone: null
      });
      renderArchiveExplorer();
      return { ok: false, changed: false, aborted: true };
    }

    console.error("Failed to fill library item with AI", error);
    const message = getErrorMessage(error, "Could not generate library metadata.");
    clearAiRequest(itemKey, requestToken, {
      message,
      tone: "error"
    });
    setStatus(message, "error");
    renderArchiveExplorer();
    return { ok: false, changed: false };
  } finally {
    clearAiAbortController(itemKey, controller);
  }
}

function updateItem(id, updates) {
  state.items = state.items.map((item) =>
    item.id === id
      ? {
          ...item,
          ...updates
        }
      : item
  );
}

function updateDraftField(id, field, value, source = FIELD_SOURCES.user) {
  clearAiStatus(id);
  state.items = state.items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      [field]: value,
      fieldSources: {
        ...normalizeDraftFieldSources(item),
        [field]: source
      }
    };
  });
}

function replaceItem(id, nextItem) {
  state.items = state.items.map((item) => (item.id === id ? nextItem : item));
}

function renameCategory(previousName, nextName) {
  state.collapsedCategories = state.collapsedCategories.map((name) =>
    name === previousName ? nextName : name
  );
  state.items = state.items.map((item) =>
    item.category === previousName
      ? {
          ...item,
          category: nextName,
          fieldSources: {
            ...normalizeDraftFieldSources(item),
            category: FIELD_SOURCES.user
          }
        }
      : item
  );
}

function toggleCategory(categoryName) {
  if (state.collapsedCategories.includes(categoryName)) {
    state.collapsedCategories = state.collapsedCategories.filter(
      (name) => name !== categoryName
    );
    return;
  }

  state.collapsedCategories = [...state.collapsedCategories, categoryName];
}

function toggleArchiveSession(sessionId) {
  if (state.collapsedArchiveSessions.includes(sessionId)) {
    state.collapsedArchiveSessions = state.collapsedArchiveSessions.filter(
      (id) => id !== sessionId
    );
    return;
  }

  state.collapsedArchiveSessions = [...state.collapsedArchiveSessions, sessionId];
}

async function handleToggleDraftCollapse() {
  if (state.phase === "save") {
    return;
  }

  if (!state.items.length) {
    return;
  }

  state.collapsedCategories = areAllDraftGroupsCollapsed()
    ? []
    : getAllCategoryNames(state.items);
  await persistDraft();
  render();
}

function handleToggleSettings(event) {
  event.stopPropagation();
  state.settingsOpen = !state.settingsOpen;
  if (!state.settingsOpen) {
    state.geminiApiKeyVisible = false;
  }
  render();
}

function handleToggleGeminiApiKeyVisibility() {
  state.geminiApiKeyVisible = !state.geminiApiKeyVisible;
  render();
}

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

function handleDocumentClick(event) {
  if (!state.settingsOpen || !elements.settingsPanel || !elements.settingsToggleButton) {
    return;
  }

  const target = event.target;
  if (
    elements.settingsPanel.contains(target) ||
    elements.settingsToggleButton.contains(target)
  ) {
    return;
  }

  state.settingsOpen = false;
  state.geminiApiKeyVisible = false;
  render();
}

function handleDocumentKeydown(event) {
  if (event.key === "Escape" && state.aiSelectionModal.open) {
    closeAiSelectionModal();
    return;
  }

  if (event.key === "Escape" && state.settingsOpen) {
    state.settingsOpen = false;
    state.geminiApiKeyVisible = false;
    render();
  }
}

function clearAiStatus(itemId) {
  if (!state.aiStatuses[itemId]) {
    return;
  }

  const nextStatuses = { ...state.aiStatuses };
  delete nextStatuses[itemId];
  state.aiStatuses = nextStatuses;
}

function clearAiRequest(itemId, requestToken, status = null) {
  if (state.aiRequestTokens[itemId] !== requestToken) {
    return;
  }

  const nextTokens = { ...state.aiRequestTokens };
  delete nextTokens[itemId];
  state.aiRequestTokens = nextTokens;

  if (status) {
    state.aiStatuses = {
      ...state.aiStatuses,
      [itemId]: status
    };
    return;
  }

  clearAiStatus(itemId);
}

function clearAiAbortController(itemId, controller) {
  if (state.aiAbortControllers[itemId] !== controller) {
    return;
  }

  const nextControllers = { ...state.aiAbortControllers };
  delete nextControllers[itemId];
  state.aiAbortControllers = nextControllers;
}

function resetAiState() {
  state.aiRequestTokens = {};
  state.aiAbortControllers = {};
  state.aiStatuses = {};
}

function isCurrentAiRequest(itemId, requestToken) {
  return state.aiRequestTokens[itemId] === requestToken;
}

function abortAiRequest(itemId, reason = "AI stopped.") {
  const controller = state.aiAbortControllers[itemId];
  if (!controller) {
    return false;
  }

  controller.abort(reason);
  return true;
}

function isAiRequestAborted(error, signal) {
  return Boolean(signal?.aborted) || error?.name === "AbortError";
}

function getAiAbortMessage(signal, fallback = "AI stopped.") {
  return typeof signal?.reason === "string" && signal.reason.trim()
    ? signal.reason
    : fallback;
}

async function persistDraft() {
  await extensionApi.storage.local.set({
    [DRAFT_KEY]: {
      sessionName: state.sessionName,
      skippedCount: state.skippedCount,
      lastScannedAt: state.lastScannedAt,
      collapsedCategories: state.collapsedCategories,
      items: state.items
    }
  });
}

async function persistSettings() {
  state.settings = normalizeSettings(state.settings);
  await extensionApi.storage.local.set({
    [SETTINGS_KEY]: state.settings
  });
}

async function updateSettings(nextSettings) {
  state.settings = normalizeSettings({
    ...state.settings,
    ...nextSettings
  });
  await persistSettings();
  render();
}

async function clearDraftState() {
  state.sessionName = "";
  state.filterQuery = "";
  state.items = [];
  state.skippedCount = 0;
  state.lastScannedAt = null;
  state.collapsedCategories = [];
  state.expandedTabIds = new Set();
  resetAiState();
  await extensionApi.storage.local.remove(DRAFT_KEY);
}

function getArchiveView() {
  const query = state.archiveFilterQuery.trim().toLowerCase();
  const sessions = [];
  const matchedUrls = [];
  const matchedCategories = new Set();
  const hasActiveFilters = query || getActiveArchiveFilters().length;

  for (const session of state.recentArchives) {
    const matchedItems = session.items.filter((item) =>
      matchesArchiveItem(session, item, query)
    );

    if (!matchedItems.length) {
      continue;
    }

    for (const item of matchedItems) {
      matchedCategories.add(item.category);
    }

    matchedUrls.push(...matchedItems.map((item) => item.url));
    sessions.push({
      ...session,
      totalItemList: session.items,
      items: sortArchiveItems(matchedItems)
    });
  }

  return {
    sessions,
    matchedUrls: hasActiveFilters ? getUniqueUrls(matchedUrls) : [],
    categoryCount: matchedCategories.size
  };
}

function matchesArchiveItem(session, item, query) {
  const selectedSessions = new Set(state.archiveFilters.sessions.map((entry) => entry.id));
  const selectedCategories = new Set(state.archiveFilters.categories.map((value) => value.toLowerCase()));
  const selectedTags = new Set(state.archiveFilters.tags.map((value) => value.toLowerCase()));
  const itemTags = item.tags.map((tag) => tag.toLowerCase());

  if (selectedSessions.size && !selectedSessions.has(session.id)) {
    return false;
  }

  if (selectedCategories.size && !selectedCategories.has(item.category.toLowerCase())) {
    return false;
  }

  if (selectedTags.size && !itemTags.some((tag) => selectedTags.has(tag))) {
    return false;
  }

  if (!query) {
    return true;
  }

  return buildArchiveHaystack(session, item).includes(query);
}

async function reopenArchiveUrls(urls, successMessage) {
  const response = await extensionApi.runtime.sendMessage({
    type: "open-archive-urls",
    payload: {
      urls
    }
  });

  if (!response?.ok) {
    setStatus(response?.error || "Could not reopen Browsing Library tabs.", "error");
    return;
  }

  setStatus(successMessage, "success");
}

async function handleDeleteArchiveSession(session) {
  const confirmed = window.confirm(
    `Delete the saved session "${session.title}" and all of its Browsing Library tabs?`
  );
  if (!confirmed) {
    return;
  }

  try {
    const response = await extensionApi.runtime.sendMessage({
      type: "delete-archive-session",
      payload: {
        sessionId: session.id,
        sessionTitle: session.title
      }
    });

    if (!response?.ok) {
      setStatus(response?.error || "Could not delete the saved session from the Browsing Library.", "error");
      return;
    }

    state.editingArchiveItemKey = null;
    state.archiveItemEditor = null;
    await loadRecentArchives();
    render();
    setStatus(`Deleted the saved session "${session.title}".`, "success");
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Could not delete the saved session from the Browsing Library.",
      "error"
    );
  }
}

async function handleDeleteSelectedSessions() {
  const count = state.selectedSessionIds.size;
  if (count === 0) return;

  const confirmed = window.confirm(
    `Delete ${count} session${count === 1 ? "" : "s"}? This will permanently remove ${count === 1 ? "it" : "them"} from your Browsing Library.`
  );
  if (!confirmed) return;

  const ids = [...state.selectedSessionIds];
  let deletedCount = 0;

  for (const sessionId of ids) {
    const session = state.recentArchives.find((s) => String(s.id) === String(sessionId));
    if (!session) continue;

    try {
      const response = await extensionApi.runtime.sendMessage({
        type: "delete-archive-session",
        payload: { sessionId: session.id, sessionTitle: session.title }
      });
      if (response?.ok) deletedCount += 1;
    } catch (error) {
      console.error("Failed to delete session", sessionId, error);
    }
  }

  state.selectedSessionIds.clear();
  await loadRecentArchives();
  render();
  if (deletedCount === 0) {
    setStatus("Could not delete the selected sessions from the Browsing Library.", "error");
    return;
  }
  const partialNote = deletedCount < ids.length ? ` (${ids.length - deletedCount} failed)` : "";
  setStatus(`Deleted ${deletedCount} session${deletedCount === 1 ? "" : "s"} from the Browsing Library${partialNote}.`, "success");
}

async function handleDeleteFilteredTabs() {
  const archiveView = getArchiveView();
  const totalTabs = archiveView.sessions.reduce((sum, s) => sum + s.items.length, 0);
  const sessionCount = archiveView.sessions.length;

  if (totalTabs === 0) return;

  const confirmed = window.confirm(
    `Delete ${totalTabs} tab${totalTabs === 1 ? "" : "s"} across ${sessionCount} session${sessionCount === 1 ? "" : "s"}? Sessions left empty will also be removed.`
  );
  if (!confirmed) return;

  const itemsToDelete = [];
  for (const session of archiveView.sessions) {
    for (const item of session.items) {
      itemsToDelete.push({
        sessionId: session.id,
        bookmarkId: item.bookmarkId || null,
        title: item.title,
        url: item.url
      });
    }
  }

  try {
    const response = await extensionApi.runtime.sendMessage({
      type: "bulk-delete-archive-items",
      payload: { items: itemsToDelete }
    });

    if (!response?.ok) {
      setStatus(response?.error || "Could not delete tabs from the Browsing Library.", "error");
      return;
    }

    const { deletedTabCount, deletedSessionCount } = response.result;
    clearArchiveFilters();
    state.archiveFilterQuery = "";
    elements.archiveFilterInput.value = "";
    await loadRecentArchives();
    render();
    const sessionNote = deletedSessionCount ? `, removed ${deletedSessionCount} empty session${deletedSessionCount === 1 ? "" : "s"}` : "";
    setStatus(`Deleted ${deletedTabCount} tab${deletedTabCount === 1 ? "" : "s"}${sessionNote}.`, "success");
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Could not delete tabs from the Browsing Library.",
      "error"
    );
  }
}

async function handleDeleteArchiveItem(session, item) {
  const confirmed = window.confirm(`Delete "${item.title}" from the Browsing Library?`);
  if (!confirmed) {
    return;
  }

  try {
    const response = await extensionApi.runtime.sendMessage({
      type: "delete-archive-item",
      payload: {
        sessionId: session.id,
        bookmarkId: item.bookmarkId || null,
        title: item.title,
        url: item.url
      }
    });

    if (!response?.ok) {
      setStatus(response?.error || "Could not delete the Browsing Library tab.", "error");
      return;
    }

    if (state.editingArchiveItemKey === getArchiveItemEditorKey(session.id, item)) {
      state.editingArchiveItemKey = null;
      state.archiveItemEditor = null;
    }

    await loadRecentArchives();
    render();
    setStatus(`Deleted "${item.title}" from the Browsing Library.`, "success");
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Could not delete the Browsing Library tab.",
      "error"
    );
  }
}

function startArchiveItemEdit(session, item) {
  state.editingArchiveItemKey = getArchiveItemEditorKey(session.id, item);
  state.archiveItemEditor = {
    sessionId: session.id,
    bookmarkId: item.bookmarkId || null,
    title: item.title,
    url: item.url,
    category: item.category,
    tagsText: item.tags.join(", "),
    description: item.description || "",
    summary: item.summary || ""
  };
  renderArchiveExplorer();
}

function cancelArchiveItemEdit() {
  state.editingArchiveItemKey = null;
  state.archiveItemEditor = null;
  renderArchiveExplorer();
}

function updateArchiveItemEditorField(field, value) {
  if (!state.archiveItemEditor) {
    return;
  }

  state.archiveItemEditor = {
    ...state.archiveItemEditor,
    [field]: value
  };
}

async function saveArchiveItemEditor() {
  if (!state.archiveItemEditor) {
    return;
  }

  try {
    const response = await extensionApi.runtime.sendMessage({
      type: "update-archive-item",
      payload: {
        sessionId: state.archiveItemEditor.sessionId,
        bookmarkId: state.archiveItemEditor.bookmarkId,
        title: state.archiveItemEditor.title,
        url: state.archiveItemEditor.url,
        category: cleanCategory(state.archiveItemEditor.category),
        description: state.archiveItemEditor.description,
        summary: state.archiveItemEditor.summary,
        tags: parseTags(state.archiveItemEditor.tagsText)
      }
    });

    if (!response?.ok) {
      setStatus(response?.error || "Could not update the Browsing Library tab.", "error");
      return;
    }

    cancelArchiveItemEdit();
    await loadRecentArchives();
    render();
    setStatus(`Updated "${response.result.itemTitle}".`, "success");
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Could not update the Browsing Library tab.",
      "error"
    );
  }
}

function buildArchiveSessions(savedSessions, metadataStore) {
  const metadataSessions = buildMetadataFallbackSessions(metadataStore);
  const metadataById = new Map(metadataSessions.map((session) => [session.id, session]));
  const normalizedSessions = [];

  for (const savedSession of savedSessions) {
    const fallback = metadataById.get(savedSession.id);
    const items = Array.isArray(savedSession.items) && savedSession.items.length
      ? savedSession.items.map(normalizeArchiveItem).filter(Boolean)
      : fallback?.items || [];

    normalizedSessions.push(
      normalizeArchiveSession({
        ...savedSession,
        items
      })
    );
    metadataById.delete(savedSession.id);
  }

  for (const fallbackSession of metadataById.values()) {
    normalizedSessions.push(normalizeArchiveSession(fallbackSession));
  }

  return normalizedSessions
    .filter((session) => session.items.length)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function normalizeArchiveSession(session) {
  const items = Array.isArray(session.items)
    ? session.items.map(normalizeArchiveItem).filter(Boolean)
    : [];
  const categoryMeta = normalizeCategoryMeta(session.categoryMeta, session.categories, items);
  const aiEnrichmentStatus =
    typeof session.aiEnrichmentStatus === "string" ? session.aiEnrichmentStatus : null;
  const aiFilledItemCount = items.filter((item) => isArchiveItemAiFilled(item, aiEnrichmentStatus)).length;

  return {
    id: session.id || makeId("archive"),
    title: session.title || "Saved Session",
    createdAt: session.createdAt || items[0]?.archivedAt || new Date().toISOString(),
    items: sortArchiveItems(items),
    totalItemCount: items.length,
    aiFilledItemCount,
    categoryMeta,
    categories: buildSessionCategories(items, categoryMeta),
    aiEnrichmentStatus
  };
}

function normalizeArchiveItem(item) {
  const url = item?.url || item?.linkUrl;
  if (!url) {
    return null;
  }

  return {
    bookmarkId: item.bookmarkId || null,
    bookmarkFolderId: item.bookmarkFolderId || null,
    sessionFolderId: item.sessionFolderId || null,
    title: item.title || getHostname(url),
    url,
    hostname: item.hostname || getHostname(url),
    category: cleanCategory(item.category),
    description: item.description || "",
    summary: item.summary || "",
    tags: Array.isArray(item.tags) ? item.tags : parseTags(item.tags),
    capturedAt: item.capturedAt || null,
    archivedAt: item.archivedAt || null,
    fieldSources: normalizeArchiveFieldSources(item)
  };
}

function buildMetadataFallbackSessions(metadataStore) {
  const grouped = new Map();

  for (const rawItem of Object.values(metadataStore || {})) {
    const item = normalizeArchiveItem(rawItem);
    if (!item) {
      continue;
    }

    const sessionId = rawItem.sessionFolderId || rawItem.sessionTitle;
    if (!grouped.has(sessionId)) {
      grouped.set(sessionId, {
        id: sessionId,
        title: rawItem.sessionTitle || "Saved Session",
        createdAt: rawItem.archivedAt || new Date().toISOString(),
        categoryMeta: [],
        items: []
      });
    }

    grouped.get(sessionId).items.push({
      ...item,
      sessionFolderId: rawItem.sessionFolderId || null
    });
  }

  return [...grouped.values()];
}

function buildSessionCategories(items, categoryMeta = []) {
  const metaMap = new Map(categoryMeta.map((entry) => [entry.name, entry]));

  return buildGroups(items).map((group) => {
    const meta = metaMap.get(group.name);

    return {
      name: group.name,
      description: meta?.description || "",
      tags: Array.isArray(meta?.tags) ? meta.tags : [],
      items: group.items
    };
  });
}

function buildArchiveHaystack(session, item) {
  return [
    session.title,
    item.category,
    item.title,
    item.url,
    item.hostname,
    item.description,
    item.summary,
    item.tags.join(" ")
  ]
    .join(" ")
    .toLowerCase();
}

function sortArchiveItems(items) {
  return items
    .slice()
    .sort((left, right) => {
      const categoryCompare = left.category.localeCompare(right.category);
      if (categoryCompare !== 0) {
        return categoryCompare;
      }

      return left.title.localeCompare(right.title);
    });
}

function getFilteredItems() {
  if (state.phase === "save") {
    return state.items;
  }

  if (!state.filterQuery.trim()) {
    return state.items;
  }

  const query = state.filterQuery.trim().toLowerCase();

  return state.items.filter((item) => {
    const haystack = [
      item.title,
      item.url,
      item.hostname,
      item.category,
      item.description,
      item.summary,
      item.tags.join(" ")
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function getAllGroups() {
  return buildGroups(state.items);
}

function getAllCategoryNames(items = state.items) {
  return buildGroups(items).map((group) => group.name);
}

function areAllDraftGroupsCollapsed() {
  const categoryNames = getAllCategoryNames();
  if (!categoryNames.length) {
    return true;
  }

  return categoryNames.every((name) => state.collapsedCategories.includes(name));
}

function getVisibleGroups() {
  return buildGroups(getFilteredItems());
}

function buildGroups(items) {
  const grouped = new Map();

  for (const item of items) {
    const category = cleanCategory(item.category);
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category).push(item);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, groupedItems]) => ({
      name,
      items: groupedItems
        .slice()
        .sort((left, right) => left.title.localeCompare(right.title))
    }));
}

function normalizeDraftItem(item) {
  if (!item || !item.url) {
    return null;
  }

  const title = item.title || getHostname(item.url);
  const hostname = item.hostname || getHostname(item.url);
  const description =
    typeof item.description === "string" ? item.description : "";
  const summary =
    typeof item.summary === "string"
      ? item.summary
      : generateSummary(title, item.url);
  const tags = Array.isArray(item.tags) ? item.tags : parseTags(item.tags);

  return {
    id: item.id || makeId(),
    title,
    url: item.url,
    hostname,
    favIconUrl: typeof item.favIconUrl === "string" ? item.favIconUrl : "",
    category: cleanCategory(item.category),
    description,
    summary,
    tags,
    capturedAt: item.capturedAt || new Date().toISOString(),
    fieldSources: normalizeDraftFieldSources({
      ...item,
      description,
      summary,
      tags
    })
  };
}

function buildDraftItem(tab, index) {
  const hostname = getHostname(tab.url);
  const category = suggestCategory(tab.title, hostname);

  return {
    id: makeId(index),
    title: tab.title || hostname,
    url: tab.url,
    hostname,
    favIconUrl: tab.favIconUrl || "",
    category,
    description: "",
    summary: generateSummary(tab.title, tab.url),
    tags: suggestTags(tab.title, hostname, category),
    capturedAt: new Date().toISOString(),
    fieldSources: {
      category: FIELD_SOURCES.heuristic,
      tags: FIELD_SOURCES.heuristic,
      description: FIELD_SOURCES.heuristic,
      summary: FIELD_SOURCES.heuristic
    }
  };
}

function isBookmarkableTab(tab) {
  if (!tab?.url) {
    return false;
  }

  const blockedProtocols = [
    "chrome://",
    "chrome-error://",
    "chrome-search://",
    "chrome-extension://",
    "edge://",
    "about:",
    "moz-extension://",
    "devtools://",
    "javascript:",
    "data:",
    "view-source:"
  ];

  return !blockedProtocols.some((protocol) => tab.url.startsWith(protocol));
}

function suggestCategory(title, hostname) {
  const haystack = `${title || ""} ${hostname}`.toLowerCase();
  const rules = [
    ["Development", ["github", "gitlab", "docs", "localhost", "npm", "stack overflow"]],
    ["Research", ["wikipedia", "paper", "study", "guide", "tutorial", "reference"]],
    ["Communication", ["gmail", "mail", "slack", "discord", "teams", "calendar"]],
    ["Productivity", ["notion", "drive.google", "docs.google", "sheets", "asana", "trello"]],
    ["Shopping", ["amazon", "ebay", "etsy", "shop", "store", "cart"]],
    ["News", ["news", "times", "post", "journal", "media"]],
    ["Video", ["youtube", "vimeo", "twitch", "video", "netflix"]],
    ["Design", ["figma", "dribbble", "behance", "fonts", "palette"]],
    ["Social", ["reddit", "linkedin", "twitter", "x.com", "instagram", "facebook"]],
    ["Finance", ["bank", "finance", "invoice", "stripe", "billing", "invest"]]
  ];

  for (const [category, tests] of rules) {
    if (tests.some((token) => haystack.includes(token))) {
      return category;
    }
  }

  const [firstPart] = hostname.split(".");
  return firstPart
    ? firstPart.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Unsorted";
}

function suggestTags(title, hostname, category) {
  const titleTokens = String(title || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4)
    .slice(0, 3);

  return [...new Set([category.toLowerCase(), hostname.split(".")[0], ...titleTokens])];
}

function generateSummary(title, url) {
  const hostname = getHostname(url).replace(/\./g, " ");
  if (!title) {
    return `Saved page from ${hostname}.`;
  }

  return `Saved from ${hostname}. Page title: ${title}.`;
}

function cleanCategory(value) {
  const trimmed = String(value || "").trim();
  return trimmed || "Unsorted";
}

function buildCategoryContext() {
  const registry = buildCategoryRegistry(state.items, state.recentArchives);

  // Only show Gemini categories that are established (library, user-edited, or already
  // AI-filled by an earlier tab in this session). Pure heuristic draft categories are
  // excluded so Gemini is free to generate a better category rather than echoing back
  // the heuristic default.
  const establishedCategories = registry.entries
    .filter((entry) => entry.libraryCount > 0 || entry.userCount > 0 || entry.aiCount > 0)
    .map((entry) => entry.label);

  return {
    registry,
    existingCategories: establishedCategories.slice(0, MAX_EXISTING_CATEGORY_CONTEXT)
  };
}

function buildCategoryRegistry(draftItems, recentArchives) {
  const labelStats = new Map();

  for (const item of draftItems || []) {
    const fieldSources = normalizeDraftFieldSources(item);
    registerCategoryLabel(
      labelStats,
      item.category,
      "draft",
      fieldSources.category === FIELD_SOURCES.user,
      fieldSources.category === FIELD_SOURCES.ai
    );
  }

  for (const session of recentArchives || []) {
    for (const item of session.items || []) {
      registerCategoryLabel(labelStats, item.category, "library");
    }
  }

  const byFingerprintGroups = new Map();
  for (const stat of labelStats.values()) {
    if (!byFingerprintGroups.has(stat.fingerprint)) {
      byFingerprintGroups.set(stat.fingerprint, []);
    }
    byFingerprintGroups.get(stat.fingerprint).push(stat);
  }

  const entries = [...byFingerprintGroups.entries()].map(([fingerprint, candidates]) => {
    const canonical = candidates.slice().sort(compareCategoryCandidates)[0];
    const count = candidates.reduce((total, candidate) => total + candidate.count, 0);
    const draftCount = candidates.reduce((total, candidate) => total + candidate.draftCount, 0);
    const libraryCount = candidates.reduce((total, candidate) => total + candidate.libraryCount, 0);
    const userCount = candidates.reduce((total, candidate) => total + candidate.userCount, 0);
    const aiCount = candidates.reduce((total, candidate) => total + candidate.aiCount, 0);

    return {
      label: canonical.label,
      source: draftCount > 0 ? "draft" : "library",
      count,
      fingerprint,
      draftCount,
      libraryCount,
      userCount,
      aiCount,
      tokens: fingerprint ? fingerprint.split(" ") : [],
      candidates: candidates
        .slice()
        .sort(compareCategoryCandidates)
        .map((candidate) => candidate.label)
    };
  });

  entries.sort(compareCategoryRegistryEntries);

  return {
    entries,
    orderedLabels: entries.map((entry) => entry.label),
    byFingerprint: new Map(entries.map((entry) => [entry.fingerprint, entry]))
  };
}

function registerCategoryLabel(labelStats, label, source, isUser = false, isAi = false) {
  const cleaned = cleanCategory(label);
  const fingerprint = normalizeCategoryFingerprint(cleaned);
  const existing = labelStats.get(cleaned) || {
    label: cleaned,
    fingerprint,
    count: 0,
    draftCount: 0,
    libraryCount: 0,
    userCount: 0,
    aiCount: 0
  };

  existing.count += 1;
  if (source === "draft") {
    existing.draftCount += 1;
  } else {
    existing.libraryCount += 1;
  }
  if (isUser) {
    existing.userCount += 1;
  }
  if (isAi) {
    existing.aiCount += 1;
  }

  labelStats.set(cleaned, existing);
}

function compareCategoryCandidates(left, right) {
  if (left.userCount !== right.userCount) {
    return right.userCount - left.userCount;
  }

  const leftHasDraft = left.draftCount > 0;
  const rightHasDraft = right.draftCount > 0;
  if (leftHasDraft !== rightHasDraft) {
    return leftHasDraft ? -1 : 1;
  }

  if (left.count !== right.count) {
    return right.count - left.count;
  }

  if (left.label.length !== right.label.length) {
    return left.label.length - right.label.length;
  }

  return left.label.localeCompare(right.label);
}

function compareCategoryRegistryEntries(left, right) {
  const leftIsDraft = left.source === "draft";
  const rightIsDraft = right.source === "draft";
  if (leftIsDraft !== rightIsDraft) {
    return leftIsDraft ? -1 : 1;
  }

  if (left.count !== right.count) {
    return right.count - left.count;
  }

  return left.label.localeCompare(right.label);
}

function normalizeCategoryFingerprint(label) {
  const tokens = cleanCategory(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeCategoryToken);

  return [...new Set(tokens)].sort().join(" ");
}

function normalizeCategoryToken(token) {
  if (token.length <= 3) {
    return token;
  }

  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (
    token.length > 4 &&
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("us") &&
    !token.endsWith("is") &&
    !token.endsWith("ics") &&
    !token.endsWith("news")
  ) {
    return token.slice(0, -1);
  }

  return token;
}

function buildCategoryCandidateShortlist(proposedCategory, registry) {
  const proposedFingerprint = normalizeCategoryFingerprint(proposedCategory);
  const proposedTokens = proposedFingerprint ? proposedFingerprint.split(" ") : [];
  const proposedTokenSet = new Set(proposedTokens);
  const compactProposed = proposedFingerprint.replace(/ /g, "");
  const candidates = [];

  for (const entry of registry.entries) {
    if (entry.fingerprint === proposedFingerprint) {
      continue;
    }

    const sharedTokenCount = entry.tokens.filter((token) => proposedTokenSet.has(token)).length;
    const unionSize = new Set([...entry.tokens, ...proposedTokens]).size;
    const compactCandidate = entry.fingerprint.replace(/ /g, "");
    const substringMatch =
      compactProposed &&
      compactCandidate &&
      (compactProposed.includes(compactCandidate) || compactCandidate.includes(compactProposed));

    if (!sharedTokenCount && !substringMatch) {
      continue;
    }

    const overlapScore = unionSize ? sharedTokenCount / unionSize : 0;
    const score = overlapScore + (substringMatch ? 0.2 : 0);
    if (score < 0.25) {
      continue;
    }

    candidates.push({
      ...entry,
      score
    });
  }

  return candidates
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const leftIsDraft = left.source === "draft";
      const rightIsDraft = right.source === "draft";
      if (leftIsDraft !== rightIsDraft) {
        return leftIsDraft ? -1 : 1;
      }

      if (left.count !== right.count) {
        return right.count - left.count;
      }

      if (left.label.length !== right.label.length) {
        return left.label.length - right.label.length;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, CATEGORY_MATCH_SHORTLIST_LIMIT);
}

async function resolveCategoryAgainstRegistry(
  item,
  proposedCategory,
  registry,
  apiKey,
  model,
  signal = null
) {
  const cleaned = cleanCategory(proposedCategory);
  if (!registry.entries.length) {
    return {
      category: cleaned,
      merged: false,
      strategy: "new"
    };
  }

  const exactMatch = registry.byFingerprint.get(normalizeCategoryFingerprint(cleaned));
  if (exactMatch) {
    return {
      category: exactMatch.label,
      merged: exactMatch.label !== cleaned,
      strategy: "deterministic"
    };
  }

  const shortlist = buildCategoryCandidateShortlist(cleaned, registry);
  if (!shortlist.length) {
    return {
      category: cleaned,
      merged: false,
      strategy: "new"
    };
  }

  try {
    const matchedCategory = await adjudicateCategoryMatch(
      item,
      cleaned,
      shortlist.map((entry) => entry.label),
      apiKey,
      model,
      signal
    );

    if (matchedCategory !== "__NEW__") {
      return {
        category: matchedCategory,
        merged: matchedCategory !== cleaned,
        strategy: "ai"
      };
    }
  } catch (error) {
    console.warn("Category match adjudication failed", error);
  }

  return {
    category: cleaned,
    merged: false,
    strategy: "new"
  };
}

function remapCollapsedCategories(collapsedCategories, renameMap) {
  return [...new Set(collapsedCategories.map((name) => renameMap.get(name) || name))];
}

function isBlankString(value) {
  return String(value || "").trim() === "";
}

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeAiTags(tags) {
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
    throw new Error("AI response tags must be an array of strings.");
  }

  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function normalizeTags(tags) {
  return Array.isArray(tags)
    ? tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
}

function areStringArraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getDraftItem(itemId) {
  return state.items.find((item) => item.id === itemId) || null;
}

function updateLibraryBulkAiButton(archiveView) {
  const selectedTargets = getSelectedLibraryAiTargets();
  const selectedCount = selectedTargets.length;
  elements.libraryBulkFillAiButton.disabled = !selectedCount || state.libraryBulkAiRunning;
  elements.libraryBulkFillAiButton.innerHTML = state.libraryBulkAiRunning
    ? `${ICONS.sparkle}<span>Using AI...</span>`
    : `${ICONS.sparkle}<span>Use AI</span>`;
  elements.libraryBulkFillAiButton.title = selectedCount
    ? buildLibraryAiSelectionTitle(selectedTargets)
    : "Select one or more sessions or tabs to use AI";
}

function updateImportEnrichmentControls() {
  const hasActiveImportEnrichment = state.importEnrichmentTotal > 0;
  elements.importProgressActions.hidden = !hasActiveImportEnrichment;
  if (hasActiveImportEnrichment) {
    elements.importAiPauseButton.innerHTML = state.importEnrichmentControlPaused
      ? `${ICONS.resume} Resume`
      : `${ICONS.pause} Pause`;
  }
}

function isImportEnrichmentTerminalStatus(status) {
  return status === "done" || status === "failed" || status === "stopped";
}

function syncImportEnrichmentTracking() {
  let trackedIds = state.importEnrichmentSessionIds.length
    ? new Set(state.importEnrichmentSessionIds.map(String))
    : null;
  const trackedSessions = trackedIds
    ? state.recentArchives.filter((session) => trackedIds.has(String(session.id)))
    : state.recentArchives.filter(
      (session) =>
        session.aiEnrichmentStatus === "pending" || session.aiEnrichmentStatus === "paused"
    );

  if (!trackedSessions.length) {
    state.importEnrichmentTotal = 0;
    state.importEnrichmentDone = 0;
    state.importEnrichmentSessionIds = [];
    state.importEnrichmentPaused = false;
    updateImportEnrichmentControls();
    return;
  }

  if (trackedIds && trackedSessions.length !== trackedIds.size) {
    trackedIds = new Set(trackedSessions.map((session) => String(session.id)));
    state.importEnrichmentSessionIds = [...trackedIds];
  }

  const total = trackedIds ? trackedIds.size : trackedSessions.length;
  const doneCount = trackedSessions.filter((session) =>
    isImportEnrichmentTerminalStatus(session.aiEnrichmentStatus)
  ).length;
  const pausedCount = trackedSessions.filter(
    (session) => session.aiEnrichmentStatus === "paused"
  ).length;
  const pendingCount = trackedSessions.filter(
    (session) => session.aiEnrichmentStatus === "pending"
  ).length;

  if (!trackedIds) {
    state.importEnrichmentSessionIds = trackedSessions.map((session) => String(session.id));
  }

  state.importEnrichmentTotal = total;
  state.importEnrichmentDone = doneCount;
  state.importEnrichmentPaused = state.importEnrichmentControlPaused
    || (pausedCount > 0 && pendingCount === 0 && doneCount < total);

  elements.importProgress.hidden = false;
  elements.importAiRow.hidden = false;
  elements.importAiCurrent.textContent = state.importEnrichmentPaused
    ? "sessions (paused)"
    : "sessions";
  elements.importProgressAi.textContent = `${doneCount} / ${total}`;
  elements.importProgressAi.dataset.done = String(doneCount >= total);
  elements.importProgressFill.style.width = `${Math.min(
    40 + Math.round((doneCount / total) * 60),
    100
  )}%`;

  if (doneCount >= total) {
    state.importEnrichmentTotal = 0;
    state.importEnrichmentDone = 0;
    state.importEnrichmentSessionIds = [];
    state.importEnrichmentPaused = false;
  }

  updateImportEnrichmentControls();
}

function buildLibraryAiSelectionTitle(selectedTargets) {
  const sessionCount = new Set(selectedTargets.map((target) => target.sessionId)).size;
  const tabCount = selectedTargets.length;
  return `Use AI on ${tabCount} selected tab${tabCount === 1 ? "" : "s"} across ${sessionCount} session${sessionCount === 1 ? "" : "s"}`;
}

function getSelectedLibraryAiTargets() {
  const targets = [];

  for (const session of state.recentArchives) {
    const explicitItems = session.items
      .map((item) => ({
        item,
        itemKey: getArchiveItemEditorKey(session.id, item)
      }))
      .filter(({ itemKey }) => state.selectedArchiveItemKeys.has(itemKey));

    if (explicitItems.length) {
      for (const { itemKey } of explicitItems) {
        targets.push({
          sessionId: session.id,
          itemKey
        });
      }
      continue;
    }

    if (!state.selectedSessionIds.has(session.id)) {
      continue;
    }

    for (const item of session.items) {
      targets.push({
        sessionId: session.id,
        itemKey: getArchiveItemEditorKey(session.id, item)
      });
    }
  }

  return targets;
}

function getArchiveItemByKey(sessionId, itemKey) {
  const session = state.recentArchives.find((entry) => String(entry.id) === String(sessionId));
  if (!session) {
    return null;
  }

  return session.items.find((entry) => getArchiveItemEditorKey(sessionId, entry) === itemKey) || null;
}

function buildArchiveAiInput(item, itemKey) {
  return {
    id: itemKey,
    title: item.title,
    url: item.url,
    hostname: item.hostname || getHostname(item.url),
    category: cleanCategory(item.category),
    description: item.description || "",
    summary: item.summary || generateSummary(item.title, item.url),
    tags: Array.isArray(item.tags) ? item.tags : parseTags(item.tags),
    fieldSources: {
      category: FIELD_SOURCES.heuristic,
      tags: FIELD_SOURCES.heuristic,
      description: FIELD_SOURCES.heuristic,
      summary: FIELD_SOURCES.heuristic
    }
  };
}

function didArchiveItemChange(item, nextValues) {
  return (
    item.category !== nextValues.category ||
    item.description !== nextValues.description ||
    item.summary !== nextValues.summary ||
    !areStringArraysEqual(item.tags || [], nextValues.tags || [])
  );
}

function applyArchiveItemUpdateToState(sessionId, itemKey, nextValues) {
  state.recentArchives = state.recentArchives.map((session) => {
    if (String(session.id) !== String(sessionId)) {
      return session;
    }

    const nextItems = session.items
      .map((item) =>
        getArchiveItemEditorKey(session.id, item) === itemKey
          ? {
              ...item,
              ...nextValues
            }
          : item
      )
      .sort((left, right) => {
        const categoryCompare = String(left.category || "").localeCompare(String(right.category || ""));
        if (categoryCompare !== 0) {
          return categoryCompare;
        }

        return String(left.title || "").localeCompare(String(right.title || ""));
      });
    const categories = [...new Set(nextItems.map((item) => item.category))].sort();
    const categoryMeta = normalizeCategoryMeta(session.categoryMeta, categories, nextItems);

    return {
      ...session,
      items: nextItems,
      totalItemCount: nextItems.length,
      aiFilledItemCount: nextItems.filter((item) => isArchiveItemAiFilled(item)).length,
      categories: buildSessionCategories(nextItems, categoryMeta),
      categoryMeta
    };
  });

  if (state.editingArchiveItemKey === itemKey && state.archiveItemEditor) {
    state.archiveItemEditor = {
      ...state.archiveItemEditor,
      category: nextValues.category,
      description: nextValues.description,
      summary: nextValues.summary,
      tagsText: nextValues.tags.join(", ")
    };
  }
}

function inferDescriptionFieldSource(item) {
  return isBlankString(item?.description) ? FIELD_SOURCES.heuristic : FIELD_SOURCES.user;
}

function getFieldSource(value, fallback) {
  return VALID_FIELD_SOURCES.has(value) ? value : fallback;
}

function normalizeDraftFieldSources(item) {
  const existing =
    item?.fieldSources && typeof item.fieldSources === "object" ? item.fieldSources : {};

  return {
    category: getFieldSource(existing.category, FIELD_SOURCES.heuristic),
    tags: getFieldSource(existing.tags, FIELD_SOURCES.heuristic),
    description: getFieldSource(existing.description, inferDescriptionFieldSource(item)),
    summary: getFieldSource(existing.summary, FIELD_SOURCES.heuristic)
  };
}

function normalizeArchiveFieldSources(item) {
  const existing =
    item?.fieldSources && typeof item.fieldSources === "object" ? item.fieldSources : {};

  return {
    category: getFieldSource(existing.category, FIELD_SOURCES.heuristic),
    tags: getFieldSource(existing.tags, FIELD_SOURCES.heuristic),
    description: getFieldSource(existing.description, FIELD_SOURCES.heuristic),
    summary: getFieldSource(existing.summary, FIELD_SOURCES.heuristic)
  };
}

function inferImportedAiFieldSources(item, aiEnrichmentStatus) {
  const normalized = normalizeArchiveFieldSources(item);
  const hasExplicitAiSource = Object.values(normalized).some(
    (source) => source === FIELD_SOURCES.ai
  );

  if (hasExplicitAiSource || aiEnrichmentStatus !== "done") {
    return normalized;
  }

  return {
    category: normalized.category,
    tags: (item?.tags || []).length ? FIELD_SOURCES.ai : normalized.tags,
    description: String(item?.description || "").trim()
      ? FIELD_SOURCES.ai
      : normalized.description,
    summary: String(item?.summary || "").trim()
      ? FIELD_SOURCES.ai
      : normalized.summary
  };
}

function isArchiveItemAiFilled(item, aiEnrichmentStatus = null) {
  const sources = inferImportedAiFieldSources(item, aiEnrichmentStatus);
  return Object.values(sources).some((source) => source === FIELD_SOURCES.ai);
}

function normalizeAiFillResponse(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("AI response must be an object.");
  }

  if (typeof payload.category !== "string") {
    throw new Error("AI response category must be a string.");
  }

  if (typeof payload.description !== "string") {
    throw new Error("AI response description must be a string.");
  }

  if (typeof payload.summary !== "string") {
    throw new Error("AI response summary must be a string.");
  }

  const normalized = {
    category: cleanCategory(payload.category),
    tags: normalizeAiTags(payload.tags),
    description: payload.description.trim(),
    summary: payload.summary.trim()
  };

  if (payload._categoryResolution && typeof payload._categoryResolution === "object") {
    normalized._categoryResolution = payload._categoryResolution;
  }

  return normalized;
}

async function requestAiFillPayload(item, categoryContext = buildCategoryContext(), signal = null) {
  const { apiKey, model } = getGeminiConfig();
  const payload = await callGeminiApi(item, apiKey, model, categoryContext, signal);
  return normalizeAiFillResponse(payload);
}

function getGeminiConfig() {
  const apiKey = String(state.settings.geminiApiKey || "").trim();
  if (!apiKey) {
    throw new Error("Add your Gemini API key in Settings to use AI fill.");
  }

  return {
    apiKey,
    model: String(state.settings.geminiModel || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL
  };
}

async function callGeminiApi(item, apiKey, model, categoryContext, signal = null) {
  const parsed = await callGeminiJsonPrompt(
    buildGeminiPrompt(item, categoryContext?.existingCategories || []),
    {
      type: "OBJECT",
      required: ["category", "tags", "description", "summary"],
      properties: {
        category: {
          type: "STRING"
        },
        tags: {
          type: "ARRAY",
          items: {
            type: "STRING"
          }
        },
        description: {
          type: "STRING"
        },
        summary: {
          type: "STRING"
        }
      }
    },
    apiKey,
    model,
    0.2,
    signal
  );
  const normalized = normalizeGeminiOutput(parsed, item);
  const categoryResolution = await resolveCategoryAgainstRegistry(
    item,
    normalized.category,
    categoryContext?.registry || buildCategoryRegistry([], []),
    apiKey,
    model,
    signal
  );

  return {
    ...normalized,
    category: categoryResolution.category,
    _categoryResolution: categoryResolution
  };
}

function buildGeminiPrompt(input, existingCategories = []) {
  const lines = [
    "You are filling a bookmark draft for a browser tab.",
    "Return JSON only with exactly these keys:",
    '- "category": a short category name',
    '- "tags": an array of 3 to 6 concise lowercase tags',
    '- "description": one concise sentence explaining why the tab is worth keeping',
    '- "summary": one short summary sentence, or an empty string if confidence is low',
    "Base your answer only on the title, URL, and hostname.",
    "Do not invent details that are not reasonably inferable.",
    "Reuse an existing category exactly when it is a reasonable fit.",
    "Only create a new category if none of the existing categories fit well."
  ];

  if (existingCategories.length) {
    lines.push("", "Existing categories:");
    for (const category of existingCategories) {
      lines.push(`- ${category}`);
    }
  }

  lines.push(
    "",
    `Title: ${input.title || "(empty)"}`,
    `URL: ${input.url}`,
    `Hostname: ${input.hostname}`
  );

  return lines.join("\n");
}

async function adjudicateCategoryMatch(
  item,
  proposedCategory,
  candidates,
  apiKey,
  model,
  signal = null
) {
  const parsed = await callGeminiJsonPrompt(
    buildCategoryAdjudicationPrompt(item, proposedCategory, candidates),
    {
      type: "OBJECT",
      required: ["match"],
      properties: {
        match: {
          type: "STRING"
        }
      }
    },
    apiKey,
    model,
    0,
    signal
  );

  const match = typeof parsed?.match === "string" ? parsed.match.trim() : "";
  if (match === "__NEW__") {
    return match;
  }

  if (candidates.includes(match)) {
    return match;
  }

  throw new Error("Gemini returned an invalid category match.");
}

function buildCategoryAdjudicationPrompt(item, proposedCategory, candidates) {
  return [
    "You are deciding whether a proposed bookmark category should reuse an existing category.",
    'Return JSON only with exactly this key: "match".',
    'Set "match" to one exact category from the candidate list if it is a reasonable fit.',
    'Set "match" to "__NEW__" if none of the candidates fit.',
    "Do not invent any other category label.",
    "",
    `Proposed category: ${proposedCategory}`,
    `Title: ${item.title || "(empty)"}`,
    `URL: ${item.url}`,
    `Hostname: ${item.hostname}`,
    "",
    "Candidate categories:",
    ...candidates.map((candidate) => `- ${candidate}`)
  ].join("\n");
}

async function callGeminiJsonPrompt(
  prompt,
  responseSchema,
  apiKey,
  model,
  temperature = 0.2,
  signal = null
) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    signal,
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseSchema
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createGeminiRequestError(response.status, errorText);
  }

  const data = await response.json();
  const text = extractGeminiText(data);

  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error("Gemini returned an unexpected response.");
  }
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error("Gemini returned an unexpected response.");
  }

  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an unexpected response.");
  }

  return text;
}

function normalizeGeminiOutput(payload, input) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Gemini returned an unexpected response.");
  }

  const rawCategory = typeof payload.category === "string" ? payload.category.trim() : "";
  const rawDescription =
    typeof payload.description === "string" ? payload.description.trim() : "";
  const rawSummary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const rawTags = Array.isArray(payload.tags) ? payload.tags : null;

  if (!rawTags || !rawTags.every((tag) => typeof tag === "string")) {
    throw new Error("Gemini returned an unexpected response.");
  }

  const tags = [...new Set(rawTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];

  return {
    category: rawCategory || fallbackCategory(input.hostname),
    tags,
    description: rawDescription,
    summary: rawSummary
  };
}

function fallbackCategory(hostname) {
  const firstPart = String(hostname || "").split(".")[0];
  if (!firstPart) {
    return "Unsorted";
  }

  return firstPart.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function createGeminiRequestError(status, details) {
  const error = new Error(`Gemini request failed (${status}). Check your API key.`);
  error.status = status;
  error.details = details;
  return error;
}

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

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

async function finalizeBulkAiCategoryMerge() {
  const mergeResult = mergeDraftCategoriesAfterAi();
  if (mergeResult.changed) {
    await persistDraft();
  }

  return mergeResult;
}

function mergeDraftCategoriesAfterAi() {
  const registry = buildCategoryRegistry(state.items, state.recentArchives);
  const renameMap = new Map();
  const beforeCategoryCount = getAllCategoryNames(state.items).length;

  state.items = state.items.map((item) => {
    const fieldSources = normalizeDraftFieldSources(item);
    if (fieldSources.category === FIELD_SOURCES.user) {
      return item;
    }

    const canonical = registry.byFingerprint.get(normalizeCategoryFingerprint(item.category));
    if (!canonical || canonical.label === item.category) {
      return item;
    }

    renameMap.set(item.category, canonical.label);
    return {
      ...item,
      category: canonical.label
    };
  });

  if (renameMap.size) {
    state.collapsedCategories = remapCollapsedCategories(state.collapsedCategories, renameMap);
  }

  const afterCategoryCount = getAllCategoryNames(state.items).length;

  return {
    changed: renameMap.size > 0,
    mergedCategoryCount: Math.max(0, beforeCategoryCount - afterCategoryCount)
  };
}

function formatBulkAiStatus(completed, updated, failed, mergedCategoryCount) {
  const mergedCopy = mergedCategoryCount
    ? `, merged ${mergedCategoryCount} categor${mergedCategoryCount === 1 ? "y" : "ies"}`
    : "";

  if (failed) {
    return `AI reviewed ${completed} tabs. Updated ${updated}, ${failed} failed${mergedCopy}.`;
  }

  return `AI reviewed ${completed} tabs and updated ${updated}${mergedCopy}.`;
}

function applyAiPayloadToDraftItem(item, payload) {
  const fieldSources = normalizeDraftFieldSources(item);
  const nextItem = {
    ...item,
    fieldSources: { ...fieldSources }
  };

  for (const field of AI_EDITABLE_FIELDS) {
    if (fieldSources[field] === FIELD_SOURCES.user) {
      continue;
    }

    const nextValue = payload[field];
    const currentValue = item[field];
    const isSameValue =
      field === "tags"
        ? areStringArraysEqual(currentValue, nextValue)
        : currentValue === nextValue;

    if (isSameValue) {
      continue;
    }

    nextItem[field] = nextValue;
    nextItem.fieldSources[field] = FIELD_SOURCES.ai;
  }

  return nextItem;
}

function didItemChange(previousItem, nextItem) {
  return AI_EDITABLE_FIELDS.some((field) =>
    field === "tags"
      ? !areStringArraysEqual(previousItem[field], nextItem[field])
      : previousItem[field] !== nextItem[field]
  );
}

function normalizeCategoryMeta(categoryMeta, categories, items) {
  const normalized = Array.isArray(categoryMeta)
    ? categoryMeta
        .map((entry) => ({
          name: cleanCategory(entry.name),
          description: String(entry.description || ""),
          tags: normalizeTags(entry.tags)
        }))
        .filter((entry) => entry.name)
    : [];

  const names = new Set(normalized.map((entry) => entry.name));
  const fallbackNames = [
    ...(Array.isArray(categories) ? categories.map((entry) => (typeof entry === "string" ? entry : entry?.name)) : []),
    ...items.map((item) => item.category)
  ];

  for (const name of fallbackNames) {
    const cleaned = cleanCategory(name);
    if (!names.has(cleaned)) {
      normalized.push({
        name: cleaned,
        description: "",
        tags: []
      });
      names.add(cleaned);
    }
  }

  return normalized;
}

function getUniqueUrls(urls) {
  const seen = new Set();
  const uniqueUrls = [];

  for (const url of urls || []) {
    const normalized = String(url || "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    uniqueUrls.push(normalized);
  }

  return uniqueUrls;
}

function getActiveArchiveFilters() {
  return [
    ...state.archiveFilters.sessions.map((entry) => ({
      type: "sessions",
      id: entry.id,
      label: "Session",
      value: entry.label
    })),
    ...state.archiveFilters.categories.map((value) => ({
      type: "categories",
      id: value,
      label: "Category",
      value
    })),
    ...state.archiveFilters.tags.map((value) => ({
      type: "tags",
      id: value,
      label: "Tag",
      value
    }))
  ];
}

function addArchiveSessionFilter(session) {
  if (state.archiveFilters.sessions.some((entry) => entry.id === session.id)) {
    return;
  }

  state.archiveFilters = {
    ...state.archiveFilters,
    sessions: [...state.archiveFilters.sessions, { id: session.id, label: session.title }]
  };
}

function addArchiveValueFilter(type, value) {
  const normalized = String(value || "").trim();
  if (!normalized || state.archiveFilters[type].includes(normalized)) {
    return;
  }

  state.archiveFilters = {
    ...state.archiveFilters,
    [type]: [...state.archiveFilters[type], normalized]
  };
}

function removeArchiveFilter(type, id) {
  if (type === "sessions") {
    state.archiveFilters = {
      ...state.archiveFilters,
      sessions: state.archiveFilters.sessions.filter((entry) => entry.id !== id)
    };
    return;
  }

  state.archiveFilters = {
    ...state.archiveFilters,
    [type]: state.archiveFilters[type].filter((entry) => entry !== id)
  };
}

function clearArchiveFilters() {
  state.archiveFilters = {
    sessions: [],
    categories: [],
    tags: []
  };
}

function normalizeSettings(value) {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    dedupeWithinSession: Boolean(value.dedupeWithinSession),
    dedupeAcrossSessions: Boolean(value.dedupeAcrossSessions),
    geminiApiKey: String(value.geminiApiKey || "").trim(),
    geminiModel: String(value.geminiModel || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL,
    obsidianVault: String(value.obsidianVault || "").trim()
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_error) {
    return "unknown-site";
  }
}

function getArchiveItemEditorKey(sessionId, item) {
  return `${sessionId}::${item.bookmarkId || `${item.url}::${item.title}`}`;
}

function buildDefaultSessionName() {
  const label = "Window capture";
  const prefix = "TabLedger";
  const date = new Date().toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
  return `${prefix} ${label} ${date}`;
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch (_error) {
    return value;
  }
}

// ── Import ──────────────────────────────────────────────────

function handleImportToggle() {
  state.importOpen = !state.importOpen;
  elements.importPanel.hidden = !state.importOpen;
  elements.importToggleButton.setAttribute("aria-expanded", String(state.importOpen));
  elements.importToggleButton.innerHTML = state.importOpen
    ? `${ICONS.close} Close`
    : `${ICONS.download} Import`;
}

async function loadBookmarkFolders() {
  const response = await extensionApi.runtime.sendMessage({ type: "get-bookmark-folders" });
  if (!response?.ok) return;

  const select = elements.importFolderSelect;
  select.innerHTML = '<option value="">Select a folder…</option>';
  for (const folder of response.folders) {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = "\u00a0".repeat(folder.depth * 2) + folder.title +
      (folder.childCount ? ` (${folder.childCount})` : "");
    select.appendChild(option);
  }
}

async function handleImportRun() {
  const scope = document.querySelector("input[name='import-scope']:checked")?.value ?? "all";
  const folderId = scope === "folder" ? elements.importFolderSelect.value || null : null;
  const useAi = elements.importUseAiCheckbox.checked;

  if (scope === "all") {
    const confirmed = window.confirm(
      `Import all bookmark folders into the Browsing Library? Each folder will become its own saved session${useAi ? ", and AI enhancement will run afterward." : "."}`
    );
    if (!confirmed) {
      return;
    }
  }

  if (state.importRunning) return;
  state.importRunning = true;
  elements.importRunButton.disabled = true;

  elements.importProgress.hidden = false;
  setImportProgressSessions("…", false);
  elements.importProgressFill.style.width = "10%";
  elements.importProgressAi.dataset.done = "false";

  try {
    if (useAi) {
      await persistSettings();
    }

    const response = await extensionApi.runtime.sendMessage({
      type: "import-bookmarks",
      payload: { folderId, useAi }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Import failed");
    }

    const { importedCount, totalBookmarks, inheritedCount = 0, sessionIds = [] } = response.result;
    const inheritedNote = inheritedCount > 0
      ? ` (${inheritedCount} inherited — AI skipped)`
      : "";
    setImportProgressSessions(`${importedCount} sessions, ${totalBookmarks} tabs${inheritedNote}`, true);
    elements.importProgressFill.style.width = useAi ? "40%" : "100%";

    if (useAi && importedCount > 0) {
      elements.importAiRow.hidden = false;
      elements.importAiCurrent.textContent = "sessions";
      elements.importProgressAi.textContent = `0 / ${importedCount}`;
      state.importEnrichmentTotal = importedCount;
      state.importEnrichmentDone = 0;
      state.importEnrichmentControlPaused = false;
      state.importEnrichmentPaused = false;
      state.importEnrichmentSessionIds = Array.isArray(sessionIds)
        ? sessionIds.map((id) => String(id))
        : [];
      // Progress bar stays at 40% — onChanged listener advances it as sessions complete
    } else {
      elements.importProgressFill.style.width = "100%";
      elements.importProgressSessions.dataset.done = "true";
      state.importEnrichmentSessionIds = [];
    }

    await loadRecentArchives();
    renderArchiveExplorer();
    updateImportEnrichmentControls();

    // Auto-close the panel to reveal the library
    if (!useAi) {
      state.importOpen = false;
      elements.importPanel.hidden = true;
      elements.importToggleButton.setAttribute("aria-expanded", "false");
      elements.importToggleButton.innerHTML = `${ICONS.download} Import`;
    }
    // When AI is running, keep panel open to show progress
  } catch (err) {
    setStatus(`Import failed: ${err.message}`, "error");
    elements.importProgress.hidden = true;
  } finally {
    state.importRunning = false;
    elements.importRunButton.disabled = false;
  }
}

function setImportProgressSessions(text, done) {
  elements.importProgressSessions.textContent = text;
  elements.importProgressSessions.dataset.done = String(done);
}

async function handleImportPauseAi() {
  if (!state.importEnrichmentTotal) {
    return;
  }

  const messageType = state.importEnrichmentControlPaused
    ? "resume-ai-enrichment-queue"
    : "pause-ai-enrichment-queue";
  setStatus(state.importEnrichmentControlPaused ? "Import AI resuming..." : "Import AI pausing...");

  try {
    const response = await extensionApi.runtime.sendMessage({ type: messageType });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not update import AI.");
    }

    state.importEnrichmentControlPaused = !state.importEnrichmentControlPaused;
    state.importEnrichmentPaused = state.importEnrichmentControlPaused;
    updateImportEnrichmentControls();
    setStatus(state.importEnrichmentControlPaused ? "Import AI paused." : "Import AI resumed.");
  } catch (error) {
    setStatus(
      getErrorMessage(error, "Could not update import AI."),
      "error"
    );
  }
}

async function handleImportStopAi() {
  if (!state.importEnrichmentTotal) {
    return;
  }
  setStatus("Import AI stopping...");

  try {
    const response = await extensionApi.runtime.sendMessage({ type: "stop-ai-enrichment-queue" });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not stop import AI.");
    }

    state.importEnrichmentControlPaused = false;
    state.importEnrichmentPaused = false;
    updateImportEnrichmentControls();
    setStatus("Import AI stopped.");
  } catch (error) {
    setStatus(
      getErrorMessage(error, "Could not stop import AI."),
      "error"
    );
  }
}

// ── Sync ───────────────────────────────────────────────────

async function handleSyncNow() {
  if (state.syncRunning) return;
  state.syncRunning = true;
  elements.syncNowButton.classList.add("is-syncing");
  elements.syncNowButton.disabled = true;
  setSyncStatus("Syncing…", "info");

  try {
    const response = await extensionApi.runtime.sendMessage({ type: "sync-now" });
    if (!response?.ok) throw new Error(response?.error || "Sync failed");

    const { pushed, pulled } = response.result;
    const parts = [];
    if (pushed > 0) parts.push(`${pushed} pushed`);
    if (pulled > 0) parts.push(`${pulled} pulled`);
    setSyncStatus(parts.length ? `Synced — ${parts.join(", ")}` : "Already up to date", "success");

    if (pulled > 0) {
      await loadRecentArchives();
      renderArchiveExplorer();
    }
  } catch (err) {
    setSyncStatus(`Sync failed: ${err.message}`, "error");
  } finally {
    state.syncRunning = false;
    elements.syncNowButton.classList.remove("is-syncing");
    elements.syncNowButton.disabled = false;
  }
}

function setSyncStatus(message, tone) {
  elements.syncStatusBar.textContent = message;
  elements.syncStatusBar.dataset.tone = tone;
  elements.syncStatusBar.hidden = false;
  clearTimeout(elements.syncStatusBar._clearTimer);
  if (tone === "success") {
    elements.syncStatusBar._clearTimer = setTimeout(() => {
      elements.syncStatusBar.hidden = true;
    }, 4000);
  }
}

// ── AI enrichment retry ────────────────────────────────────

async function handleRetryAiEnrichment(sessionId) {
  const response = await extensionApi.runtime.sendMessage({
    type: "retry-ai-enrichment",
    payload: { sessionId }
  });
  if (response?.ok) {
    await loadRecentArchives();
    renderArchiveExplorer();
  }
}

function makeId(seed = "") {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `item-${Date.now()}-${seed}-${Math.random().toString(16).slice(2, 10)}`;
}

function setBusy(isBusy) {
  elements.scanAllButton.disabled = isBusy;
  elements.saveBookmarksButton.disabled =
    isBusy || !capabilities.nativeBookmarks || !state.items.length;
  elements.exportJsonButton.disabled = isBusy || !state.items.length;
  elements.resetDraftButton.disabled = isBusy || (!state.items.length && !state.sessionName);
}

function setStatus(message, tone) {
  elements.statusMessage.textContent = message;
  if (tone) {
    elements.statusMessage.dataset.tone = tone;
  } else {
    delete elements.statusMessage.dataset.tone;
  }
}

// ── Workspace v2: Project Architect ───────────────────────

function buildDefaultWorkspacePrompt(topic, includedItems) {
  const ytRe = /youtube\.com\/(watch|shorts)|youtu\.be\//i;
  const urlList = includedItems
    .map((item, i) => {
      const kind = ytRe.test(item.url) ? "YouTube" : "Web";
      return `[${i + 1}] (${kind}) ${item.title} — ${item.url}`;
    })
    .join("\n");
  return `Act as a Senior Project Architect specializing in "${topic}".

Analyze the following ${includedItems.length} sources (web pages and YouTube videos) and create a high-impact, actionable project kit grounded in what these sources contain.

FOCUS AREA: "${topic}"

SOURCES TO ANALYZE:
${urlList}

Produce:
1. BLUEPRINT — 8–12 sequential, specific steps to execute this project.
2. GLOSSARY — 5–10 critical technical terms found in these sources (1–2 sentence definitions).
3. CHECKLIST — 8–15 "Definition of Done" tasks written as imperative verb phrases.
4. SOURCES_USED — for each source you could read, one key insight (1–2 sentences).

For YouTube videos, use the attached video content. For web URLs, fetch them via your URL tool. For any source you cannot retrieve, skip it in sources_used.`;
}

function openWorkspacePromptModal() {
  const included = state.workspace.searchResults.filter(
    (item) => !state.workspace.excludedUrls.has(item.url)
  );

  if (!included.length) {
    setWorkspaceStatus("Select at least one source to generate a project kit.", "error");
    return;
  }

  const youtubePatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch/i,
    /^https?:\/\/youtu\.be\//i,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//i
  ];
  const unfetchablePatterns = [
    /^https?:\/\/(www\.)?netflix\.com/i,
    /^https?:\/\/(www\.)?spotify\.com/i,
    /^https?:\/\/(www\.)?twitter\.com/i,
    /^https?:\/\/(www\.)?x\.com/i,
    /^https?:\/\/(www\.)?facebook\.com/i,
    /^https?:\/\/(www\.)?instagram\.com/i,
    /^file:\/\//i
  ];
  const isYoutube = (u) => youtubePatterns.some((re) => re.test(u));
  const isUnfetchable = (u) => unfetchablePatterns.some((re) => re.test(u));

  const youtube = included.filter((i) => isYoutube(i.url));
  const web = included.filter((i) => !isYoutube(i.url) && !isUnfetchable(i.url));
  const skipped = included.length - youtube.length - web.length;

  let summary = `Generating a project kit from ${web.length + youtube.length} source${(web.length + youtube.length) !== 1 ? "s" : ""}`;
  const bits = [];
  if (web.length) bits.push(`${web.length} web page${web.length !== 1 ? "s" : ""}`);
  if (youtube.length) bits.push(`${youtube.length} YouTube video${youtube.length !== 1 ? "s" : ""}`);
  if (bits.length) summary += ` (${bits.join(", ")})`;
  summary += ".";
  if (skipped > 0) {
    summary += ` ${skipped} source${skipped !== 1 ? "s" : ""} (Netflix, social, local files) will be skipped.`;
  }

  elements.workspacePromptSummary.textContent = summary;
  const combined = [...web, ...youtube];
  elements.workspacePromptTextarea.value = buildDefaultWorkspacePrompt(
    state.workspace.topic,
    combined.length ? combined : included
  );
  elements.workspacePromptModal.hidden = false;
  elements.workspacePromptTextarea.focus();
}

function closeWorkspacePromptModal() {
  elements.workspacePromptModal.hidden = true;
}

function setWorkspaceStatus(message, tone) {
  elements.workspaceStatus.textContent = message;
  if (tone) {
    elements.workspaceStatus.dataset.tone = tone;
  } else {
    delete elements.workspaceStatus.dataset.tone;
  }
}

async function handleWorkspaceSearch() {
  const topic = elements.workspaceTopicInput.value.trim();
  if (!topic) {
    setWorkspaceStatus("Enter a focus area to search.", "error");
    return;
  }
  if (state.workspace.searching) return;

  state.workspace.searching = true;
  state.workspace.project = null;
  state.workspace.excludedUrls = new Set();
  elements.workspaceResultsZone.hidden = true;
  elements.workspaceProjectZone.hidden = true;
  elements.workspaceExportGroup.hidden = true;
  elements.workspaceNewProjectBtn.hidden = true;
  elements.workspaceSearchBtn.disabled = true;
  setWorkspaceStatus("Searching your library...");

  try {
    const response = await extensionApi.runtime.sendMessage({
      type: "workspace-search-library",
      payload: { topic }
    });

    if (!response?.ok) throw new Error(response?.error || "Search failed.");

    const { items, keywords, excludedCounts = {} } = response.result;
    state.workspace.topic = topic;
    state.workspace.searchResults = items;

    if (!items.length) {
      const excludedTotal = Object.values(excludedCounts).reduce((a, b) => a + b, 0);
      const suffix = excludedTotal
        ? ` (${excludedTotal} match${excludedTotal !== 1 ? "es" : ""} were YouTube/social/local — not yet supported)`
        : "";
      setWorkspaceStatus(
        `No supported library items matched "${topic}"${suffix}. Try different keywords or add web articles to your library.`,
        "error"
      );
      return;
    }

    const excludedBits = [];
    if (excludedCounts.youtube) excludedBits.push(`${excludedCounts.youtube} YouTube`);
    if (excludedCounts.social) excludedBits.push(`${excludedCounts.social} social`);
    if (excludedCounts.streaming) excludedBits.push(`${excludedCounts.streaming} streaming`);
    if (excludedCounts.local) excludedBits.push(`${excludedCounts.local} local/file`);
    const excludedNote = excludedBits.length
      ? ` (${excludedBits.join(", ")} hidden — not yet supported)`
      : "";

    setWorkspaceStatus(
      `Found ${items.length} source${items.length !== 1 ? "s" : ""} matching: ${keywords.join(", ")}${excludedNote}`,
      "success"
    );
    renderWorkspaceResults(items);
    elements.workspaceResultsZone.hidden = false;
  } catch (err) {
    setWorkspaceStatus(getErrorMessage(err, "Search failed."), "error");
  } finally {
    state.workspace.searching = false;
    elements.workspaceSearchBtn.disabled = false;
  }
}

function renderWorkspaceResults(items) {
  elements.workspaceResultsCount.textContent = `${items.length} source${items.length !== 1 ? "s" : ""}`;
  elements.workspaceResultsList.innerHTML = "";

  for (const item of items) {
    const id = `${WORKSPACE_RESULT_ITEM_PREFIX}${encodeURIComponent(item.url)}`;
    const card = document.createElement("label");
    card.className = "workspace-result-card";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.url = item.url;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.workspace.excludedUrls.delete(item.url);
      } else {
        state.workspace.excludedUrls.add(item.url);
      }
    });

    const body = document.createElement("div");
    body.className = "workspace-result-body";

    const titleEl = document.createElement("p");
    titleEl.className = "workspace-result-title";
    titleEl.textContent = item.title || item.hostname;

    const meta = document.createElement("div");
    meta.className = "workspace-result-meta";

    if (item.category) {
      const catChip = document.createElement("span");
      catChip.className = "category-pill workspace-result-cat";
      catChip.textContent = item.category;
      meta.appendChild(catChip);
    }

    for (const tag of (item.tags || []).slice(0, 3)) {
      const chip = document.createElement("span");
      chip.className = "hostname-pill";
      chip.textContent = tag;
      meta.appendChild(chip);
    }

    const urlEl = document.createElement("a");
    urlEl.className = "workspace-result-url";
    urlEl.href = item.url;
    urlEl.target = "_blank";
    urlEl.rel = "noreferrer";
    urlEl.textContent = item.hostname || item.url;

    body.appendChild(titleEl);
    body.appendChild(meta);
    body.appendChild(urlEl);

    card.appendChild(checkbox);
    card.appendChild(body);
    elements.workspaceResultsList.appendChild(card);
  }
}

async function handleWorkspaceGenerate() {
  if (state.workspace.generating) return;

  if (!state.settings.geminiApiKey) {
    closeWorkspacePromptModal();
    setWorkspaceStatus("Add your Gemini API key in Settings first.", "error");
    return;
  }

  const customPrompt = elements.workspacePromptTextarea.value.trim();
  const included = state.workspace.searchResults.filter(
    (item) => !state.workspace.excludedUrls.has(item.url)
  );

  closeWorkspacePromptModal();

  state.workspace.generating = true;
  elements.workspaceGenerateBtn.disabled = true;
  elements.workspaceGenerateBtn.innerHTML =
    `${ICONS.sparkle}<span>Generating — fetching ${included.length} source${included.length !== 1 ? "s" : ""}...</span>`;
  elements.workspaceProjectZone.hidden = true;
  elements.workspaceExportGroup.hidden = true;
  elements.workspaceNewProjectBtn.hidden = true;
  setWorkspaceStatus(`Reading ${included.length} sources and building your project kit. This may take up to a minute...`);

  try {
    const response = await extensionApi.runtime.sendMessage({
      type: "workspace-generate-project",
      payload: { topic: state.workspace.topic, items: included, customPrompt }
    });

    if (!response?.ok) throw new Error(response?.error || "Generation failed.");

    state.workspace.project = response.result;
    setWorkspaceStatus("Project kit ready.", "success");
    renderWorkspaceProject(response.result);
    elements.workspaceProjectZone.hidden = false;
    elements.workspaceExportGroup.hidden = false;
    elements.workspaceNewProjectBtn.hidden = false;
    elements.workspaceResultsZone.hidden = true;
  } catch (err) {
    setWorkspaceStatus(getErrorMessage(err, "Generation failed."), "error");
  } finally {
    state.workspace.generating = false;
    elements.workspaceGenerateBtn.disabled = false;
    elements.workspaceGenerateBtn.innerHTML =
      `${ICONS.sparkle}<span>Generate Project Kit</span>`;
  }
}

function renderWorkspaceProject(data) {
  const el = elements.workspaceProjectContent;
  el.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.className = "workspace-project-header";
  const projectTitle = document.createElement("h3");
  projectTitle.className = "workspace-project-title";
  projectTitle.textContent = data.project_name || data.focus_area || "Project Kit";
  const focusTag = document.createElement("p");
  focusTag.className = "workspace-project-focus";
  focusTag.textContent = data.focus_area;
  header.appendChild(projectTitle);
  header.appendChild(focusTag);
  el.appendChild(header);

  // Checklist
  if (data.checklist?.length) {
    el.appendChild(buildWorkspaceSection(
      "Definition of Done",
      "checklist-icon",
      buildChecklistHTML(data.checklist)
    ));
  }

  // Blueprint
  if (data.blueprint?.length) {
    el.appendChild(buildWorkspaceSection(
      "Execution Blueprint",
      "blueprint-icon",
      buildBlueprintHTML(data.blueprint)
    ));
  }

  // Glossary
  if (data.glossary?.length) {
    el.appendChild(buildWorkspaceSection(
      "Technical Glossary",
      "glossary-icon",
      buildGlossaryHTML(data.glossary)
    ));
  }

  // Sources used
  if (data.sources_used?.length) {
    el.appendChild(buildWorkspaceSection(
      "Sources Read",
      "sources-icon",
      buildSourcesHTML(data.sources_used)
    ));
  }
}

function buildWorkspaceSection(title, iconClass, contentHTML) {
  const section = document.createElement("details");
  section.className = "workspace-artifact";
  section.open = true;

  const summary = document.createElement("summary");
  summary.className = "workspace-artifact-header";
  summary.textContent = title;

  const body = document.createElement("div");
  body.className = "workspace-artifact-body";
  body.innerHTML = contentHTML;

  section.appendChild(summary);
  section.appendChild(body);
  return section;
}

function buildChecklistHTML(items) {
  return `<ul class="workspace-checklist">${
    items.map((t) => `<li class="workspace-checklist-item">
      <label><input type="checkbox" /><span>${escapeHtml(t)}</span></label>
    </li>`).join("")
  }</ul>`;
}

function buildBlueprintHTML(steps) {
  return `<ol class="workspace-blueprint">${
    steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")
  }</ol>`;
}

function buildGlossaryHTML(terms) {
  return terms.map((g) =>
    `<div class="workspace-glossary-entry">
      <p class="workspace-glossary-term">${escapeHtml(g.term)}</p>
      <p class="workspace-glossary-def">${escapeHtml(g.definition)}</p>
    </div>`
  ).join("");
}

function buildSourcesHTML(sources) {
  return sources.map((s) =>
    `<div class="workspace-source-entry">
      <a class="workspace-source-link" href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.title || s.url)}</a>
      <p class="workspace-source-insight">${escapeHtml(s.key_insight)}</p>
    </div>`
  ).join("");
}

function setExportStatus(message, tone) {
  const el = elements.workspaceExportStatus;
  el.textContent = message;
  el.dataset.tone = tone || "";
}

async function handleWorkspaceExportObsidian() {
  const project = state.workspace.project;
  if (!project) return;

  const vaultName = state.settings.obsidianVault;
  if (!vaultName) {
    setExportStatus("Open Settings (gear icon) and enter your Obsidian vault name first.", "error");
    return;
  }

  setExportStatus("Copying to clipboard...");

  const dateStr = new Date().toISOString().slice(0, 10);
  const safeTitle = (project.project_name || project.focus_area || "Project")
    .replace(/[/\\:*?"<>|]/g, "-");
  const notePath = `TabLedger/Workspaces/${safeTitle} ${dateStr}`;
  const markdown = formatProjectAsMarkdown(project, dateStr);

  try {
    await navigator.clipboard.writeText(markdown);
    const uri = `obsidian://new?${new URLSearchParams({
      vault: vaultName,
      file: notePath,
      clipboard: "true"
    }).toString()}`;
    await extensionApi.tabs.create({ url: uri });
    setExportStatus("Sent to Obsidian.", "success");
  } catch (err) {
    setExportStatus(getErrorMessage(err, "Export failed."), "error");
  }
}

function formatProjectAsMarkdown(data, dateStr) {
  const sources = (data.sources_used || [])
    .map((s) => `  - ${s.url}`)
    .join("\n");

  const checklist = (data.checklist || [])
    .map((t) => `- [ ] ${t}`)
    .join("\n");

  const blueprint = (data.blueprint || [])
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

  const glossary = (data.glossary || [])
    .map((g) => `> [!abstract] ${g.term}\n> ${g.definition}`)
    .join("\n\n");

  const sourcesSection = (data.sources_used || [])
    .map((s) => `### [${s.title || s.url}](${s.url})\n${s.key_insight}`)
    .join("\n\n");

  return `---
title: "${data.project_name || data.focus_area}"
focus: "${data.focus_area}"
generated: ${dateStr}
tags: [tabledger, workspace, research]
sources:
${sources}
---

# ${data.project_name || data.focus_area}

> Generated by TabLedger Workspace on ${dateStr} from ${(data.sources_used || []).length} sources.

## Definition of Done

${checklist}

## Execution Blueprint

${blueprint}

## Technical Glossary

${glossary}

## Sources

${sourcesSection}
`;
}

function handleWorkspaceNewProject() {
  state.workspace.project = null;
  state.workspace.searchResults = [];
  state.workspace.excludedUrls = new Set();
  state.workspace.topic = "";
  elements.workspaceTopicInput.value = "";
  elements.workspaceResultsZone.hidden = true;
  elements.workspaceProjectZone.hidden = true;
  elements.workspaceExportGroup.hidden = true;
  elements.workspaceNewProjectBtn.hidden = true;
  setWorkspaceStatus("");
  elements.workspaceTopicInput.focus();
}

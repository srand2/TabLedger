const extensionApi = globalThis.browser ?? chrome;

const DRAFT_KEY = "tabGardenDraft";
const BOOKMARK_METADATA_KEY = "bookmarkMetadata";
const SAVED_SESSIONS_KEY = "savedSessions";
const LIBRARY_WIDTH_KEY = "libraryExplorerWidth";
const SETTINGS_KEY = "tabLedgerSettings";
const AI_FILL_ENDPOINT = "http://127.0.0.1:4317/v1/fill-tab";
const DEFAULT_LIBRARY_WIDTH = 420;
const MIN_LIBRARY_WIDTH = 340;
const MAX_LIBRARY_WIDTH = 720;
const MIN_DRAFT_WIDTH = 420;
const STACKED_LAYOUT_BREAKPOINT = 1120;
const RESIZER_STEP = 24;
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
  dedupeAcrossSessions: false
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
  editingArchiveItemKey: null,
  archiveItemEditor: null,
  libraryWidth: DEFAULT_LIBRARY_WIDTH,
  settings: { ...DEFAULT_SETTINGS },
  settingsOpen: false,
  aiRequestTokens: {},
  aiStatuses: {},
  expandedTabIds: new Set()
};

const elements = {
  scanAllButton: document.getElementById("scan-all"),
  saveBookmarksButton: document.getElementById("save-bookmarks"),
  exportJsonButton: document.getElementById("export-json"),
  resetDraftButton: document.getElementById("reset-draft"),
  toggleDraftCollapseButton: document.getElementById("toggle-draft-collapse"),
  bulkFillAiButton: document.getElementById("bulk-fill-ai"),
  settingsToggleButton: document.getElementById("settings-toggle"),
  settingsPanel: document.getElementById("settings-panel"),
  dedupeWithinSessionInput: document.getElementById("dedupe-within-session"),
  dedupeAcrossSessionsInput: document.getElementById("dedupe-across-sessions"),
  sessionNameInput: document.getElementById("session-name"),
  filterQueryInput: document.getElementById("filter-query"),
  layoutPanel: document.getElementById("layout-panel"),
  draftPane: document.getElementById("draft-pane"),
  libraryPane: document.getElementById("library-pane"),
  layoutResizer: document.getElementById("layout-resizer"),
  archiveFilterInput: document.getElementById("archive-filter"),
  archiveActiveFilters: document.getElementById("archive-active-filters"),
  archiveSummary: document.getElementById("archive-summary"),
  tabCount: document.getElementById("tab-count"),
  categoryCount: document.getElementById("category-count"),
  skippedCount: document.getElementById("skipped-count"),
  statusMessage: document.getElementById("status-message"),
  categories: document.getElementById("categories"),
  recentArchives: document.getElementById("recent-archives"),
  categoryTemplate: document.getElementById("category-template"),
  tabTemplate: document.getElementById("tab-template"),
  historyTemplate: document.getElementById("history-template")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  await restoreDraft();
  await restoreLibraryWidth();
  await restoreSettings();
  await loadRecentArchives();
  render();

  if (!capabilities.nativeBookmarks) {
    setStatus(
      "Native bookmark creation is not available here yet. JSON export still works.",
      "error"
    );
  }

  const captureScope = new URLSearchParams(window.location.search).get("capture");
  if (captureScope === "all") {
    await scanTabs();
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function bindEvents() {
  elements.scanAllButton.addEventListener("click", () => scanTabs());
  elements.saveBookmarksButton.addEventListener("click", handleSaveBookmarks);
  elements.exportJsonButton.addEventListener("click", handleExportJson);
  elements.resetDraftButton.addEventListener("click", handleResetDraft);
  elements.toggleDraftCollapseButton.addEventListener("click", handleToggleDraftCollapse);
  elements.bulkFillAiButton.addEventListener("click", handleBulkFillWithAi);
  elements.settingsToggleButton.addEventListener("click", handleToggleSettings);

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

  elements.layoutResizer.addEventListener("pointerdown", handleResizerPointerDown);
  elements.layoutResizer.addEventListener("keydown", handleResizerKeyDown);
  window.addEventListener("resize", handleWindowResize);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);
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
    setStatus(`Restored ${state.items.length} tabs from the last draft.`, "success");
  }
}

async function loadRecentArchives() {
  const stored = await extensionApi.storage.local.get([
    SAVED_SESSIONS_KEY,
    BOOKMARK_METADATA_KEY
  ]);
  const savedSessions = Array.isArray(stored[SAVED_SESSIONS_KEY])
    ? stored[SAVED_SESSIONS_KEY]
    : [];
  const metadataStore =
    stored[BOOKMARK_METADATA_KEY] && typeof stored[BOOKMARK_METADATA_KEY] === "object"
      ? stored[BOOKMARK_METADATA_KEY]
      : {};

  state.recentArchives = buildArchiveSessions(savedSessions, metadataStore);
  const validSessionIds = new Set(state.recentArchives.map((session) => session.id));
  state.collapsedArchiveSessions = state.collapsedArchiveSessions.filter((sessionId) =>
    validSessionIds.has(sessionId)
  );
}

async function restoreLibraryWidth() {
  const stored = await extensionApi.storage.local.get(LIBRARY_WIDTH_KEY);
  state.libraryWidth = normalizeLibraryWidth(stored[LIBRARY_WIDTH_KEY]);
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
    render();

    setStatus(
      `${state.items.length} tabs grouped into ${getAllGroups().length} categories.${state.skippedCount ? ` ${state.skippedCount} unsupported tab${state.skippedCount === 1 ? " was" : "s were"} skipped.` : ""}`,
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
          capturedAt: item.capturedAt
        }))
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Bookmark creation failed.");
    }

    await clearDraftState();
    await loadRecentArchives();
    render();
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
  render();
  setStatus("Cleared the current draft.", "success");
}

function render() {
  elements.sessionNameInput.value = state.sessionName;
  elements.filterQueryInput.value = state.filterQuery;
  elements.archiveFilterInput.value = state.archiveFilterQuery;
  elements.tabCount.textContent = String(state.items.length);
  elements.categoryCount.textContent = String(getVisibleGroups().length);
  elements.skippedCount.textContent = String(state.skippedCount);
  elements.saveBookmarksButton.disabled = !capabilities.nativeBookmarks || !state.items.length;
  elements.exportJsonButton.disabled = !state.items.length;
  elements.resetDraftButton.disabled = !state.items.length && !state.sessionName;
  elements.toggleDraftCollapseButton.disabled = !state.items.length;
  elements.toggleDraftCollapseButton.textContent = areAllDraftGroupsCollapsed()
    ? "Expand All"
    : "Collapse All";
  elements.bulkFillAiButton.disabled = !state.items.length || state.bulkAiRunning;
  elements.bulkFillAiButton.innerHTML = state.bulkAiRunning
    ? '<span class="tab-ai-icon" aria-hidden="true">✦</span><span>Using AI...</span>'
    : '<span class="tab-ai-icon" aria-hidden="true">✦</span><span>Use AI</span>';
  elements.settingsToggleButton.setAttribute("aria-expanded", String(state.settingsOpen));
  elements.settingsPanel.hidden = !state.settingsOpen;
  elements.dedupeWithinSessionInput.checked = state.settings.dedupeWithinSession;
  elements.dedupeAcrossSessionsInput.checked = state.settings.dedupeAcrossSessions;

  applyLayoutSizing();
  renderCategories();
  renderArchiveExplorer();
}

function renderCategories() {
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
    toggleGlyph.textContent = isCollapsed ? "▸" : "▾";
    if (isCollapsed) {
      categoryNode.classList.add("is-collapsed");
    }

    categoryToggle.addEventListener("click", async () => {
      toggleCategory(group.name);
      await persistDraft();
      render();
    });

    categoryInput.addEventListener("change", async (event) => {
      const nextCategory = cleanCategory(event.target.value);
      renameCategory(group.name, nextCategory);
      await persistDraft();
      render();
      setStatus(`Category renamed to "${nextCategory}".`, "success");
    });

    for (const item of group.items) {
      itemContainer.appendChild(renderTabItem(item));
    }

    elements.categories.appendChild(categoryNode);
  }
}

function renderTabItem(item) {
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
  const expandToggle = tabNode.querySelector(".tab-expand-toggle");
  const expandGlyph = expandToggle.querySelector(".toggle-glyph");
  const currentAiStatus = state.aiStatuses[item.id];
  const isAiLoading = Boolean(state.aiRequestTokens[item.id]);

  title.textContent = item.title;
  link.href = item.url;
  link.textContent = item.url;
  hostnamePill.textContent = item.hostname;
  aiButton.textContent = isAiLoading ? "Generating..." : "Fill with AI";
  aiButton.disabled = isAiLoading || state.bulkAiRunning;
  categoryInput.value = item.category;
  tagsInput.value = item.tags.join(", ");
  descriptionInput.value = item.description;
  summaryInput.value = item.summary;

  const isInitiallyExpanded = state.expandedTabIds.has(item.id);
  if (!isInitiallyExpanded) {
    tabNode.classList.add("is-collapsed");
  } else {
    expandToggle.setAttribute("aria-expanded", "true");
    expandToggle.setAttribute("aria-label", "Collapse tab fields");
    expandGlyph.textContent = "▾";
  }

  expandToggle.addEventListener("click", () => {
    const isNowCollapsed = tabNode.classList.toggle("is-collapsed");
    const expanded = !isNowCollapsed;
    if (expanded) {
      state.expandedTabIds.add(item.id);
    } else {
      state.expandedTabIds.delete(item.id);
    }
    expandToggle.setAttribute("aria-expanded", String(expanded));
    expandToggle.setAttribute("aria-label", expanded ? "Collapse tab fields" : "Expand tab fields");
    expandGlyph.textContent = expanded ? "▾" : "▸";
  });

  tabNode.querySelector(".field-grid").addEventListener("focusin", () => {
    if (tabNode.classList.contains("is-collapsed")) {
      tabNode.classList.remove("is-collapsed");
      state.expandedTabIds.add(item.id);
      expandToggle.setAttribute("aria-expanded", "true");
      expandToggle.setAttribute("aria-label", "Collapse tab fields");
      expandGlyph.textContent = "▾";
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

function renderArchiveExplorer() {
  const archiveView = getArchiveView();
  elements.recentArchives.innerHTML = "";

  renderArchiveActiveFilters();
  renderArchiveSummary(archiveView);

  if (!state.recentArchives.length) {
    elements.recentArchives.innerHTML = `
      <div class="empty-state compact-empty">
        <h3>No library entries yet</h3>
        <p>Save a session to the Browsing Library so you can browse saved tabs and reopen them later.</p>
      </div>
    `;
    return;
  }

  if (!archiveView.sessions.length) {
    elements.recentArchives.innerHTML = `
      <div class="empty-state compact-empty">
        <h3>No matching library entries</h3>
        <p>Try a broader library filter to see sessions, categories, or matching tabs.</p>
      </div>
    `;
    return;
  }

  for (const archive of archiveView.sessions) {
    elements.recentArchives.appendChild(renderArchiveSession(archive));
  }
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
  const sessionToggle = node.querySelector(".history-session-toggle");
  const toggleGlyph = node.querySelector(".toggle-glyph");
  const titleNode = node.querySelector(".history-title");
  const metaNode = node.querySelector(".history-meta");
  const countNode = node.querySelector(".history-count");
  const openSessionButton = node.querySelector(".history-open-session");
  const deleteSessionButton = node.querySelector(".history-delete-session");
  const itemList = node.querySelector(".history-item-list");
  const categoryCount = new Set(session.items.map((item) => item.category)).size;
  const isCollapsed = state.collapsedArchiveSessions.includes(session.id);

  sessionToggle.setAttribute("aria-expanded", String(!isCollapsed));
  sessionToggle.setAttribute(
    "aria-label",
    `${isCollapsed ? "Expand" : "Collapse"} saved session ${session.title}`
  );
  toggleGlyph.textContent = isCollapsed ? "▸" : "▾";
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

  actions.append(editButton, deleteButton);
  topRow.append(categoryButton, actions);
  row.appendChild(topRow);

  if (item.tags.length) {
    const tagRow = document.createElement("div");
    tagRow.className = "history-card-tag-row";

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

async function handleBulkFillWithAi() {
  if (!state.items.length || state.bulkAiRunning) {
    return;
  }

  state.bulkAiRunning = true;
  render();

  const itemIds = state.items.map((item) => item.id);
  let completed = 0;
  let updated = 0;
  let failed = 0;

  try {
    for (const itemId of itemIds) {
      if (!getDraftItem(itemId)) {
        continue;
      }

      completed += 1;
      setStatus(`Using AI on ${completed} of ${itemIds.length} tabs...`);
      const result = await runAiFillForItem(itemId);
      if (result?.ok) {
        if (result.changed) {
          updated += 1;
        }
      } else {
        failed += 1;
      }
    }
  } finally {
    state.bulkAiRunning = false;
    render();
  }

  if (failed) {
    setStatus(`AI reviewed ${completed} tabs. Updated ${updated}, ${failed} failed.`, "error");
    return;
  }

  setStatus(`AI reviewed ${completed} tabs and updated ${updated}.`, "success");
}

async function runAiFillForItem(itemId) {
  const item = getDraftItem(itemId);
  if (!item) {
    return { ok: false, changed: false };
  }

  const requestToken = makeId("ai-fill");
  state.aiRequestTokens = {
    ...state.aiRequestTokens,
    [itemId]: requestToken
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
    const payload = await requestAiFillPayload(item);
    if (!isCurrentAiRequest(itemId, requestToken)) {
      return { ok: false, changed: false };
    }

    const currentItem = getDraftItem(itemId);
    if (!currentItem) {
      clearAiRequest(itemId, requestToken);
      return { ok: false, changed: false };
    }

    const nextItem = applyAiPayloadToDraftItem(currentItem, payload);
    replaceItem(itemId, nextItem);
    await persistDraft();

    if (!isCurrentAiRequest(itemId, requestToken)) {
      return { ok: false, changed: false };
    }

    const changed = didItemChange(currentItem, nextItem);
    clearAiRequest(itemId, requestToken, {
      message: changed ? "AI draft ready." : "No AI changes were applied.",
      tone: "success"
    });
    render();
    return { ok: true, changed };
  } catch (error) {
    console.error("Failed to fill draft with AI", error);
    if (!isCurrentAiRequest(itemId, requestToken)) {
      return { ok: false, changed: false };
    }

    clearAiRequest(itemId, requestToken, {
      message: "Could not generate draft.",
      tone: "error"
    });
    render();
    return { ok: false, changed: false };
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
  render();
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
  render();
}

function handleDocumentKeydown(event) {
  if (event.key !== "Escape" || !state.settingsOpen) {
    return;
  }

  state.settingsOpen = false;
  render();
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

function resetAiState() {
  state.aiRequestTokens = {};
  state.aiStatuses = {};
}

function isCurrentAiRequest(itemId, requestToken) {
  return state.aiRequestTokens[itemId] === requestToken;
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

  return {
    id: session.id || makeId("archive"),
    title: session.title || "Saved Session",
    createdAt: session.createdAt || items[0]?.archivedAt || new Date().toISOString(),
    items: sortArchiveItems(items),
    totalItemCount: items.length,
    categoryMeta,
    categories: buildSessionCategories(items, categoryMeta)
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
    archivedAt: item.archivedAt || null
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
    "chrome-extension://",
    "edge://",
    "about:",
    "moz-extension://",
    "devtools://"
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

  return {
    category: cleanCategory(payload.category),
    tags: normalizeAiTags(payload.tags),
    description: payload.description.trim(),
    summary: payload.summary.trim()
  };
}

async function requestAiFillPayload(item) {
  const response = await fetch(AI_FILL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      title: item.title,
      url: item.url,
      hostname: item.hostname
    })
  });

  if (!response.ok) {
    throw new Error(`AI fill failed with status ${response.status}.`);
  }

  return normalizeAiFillResponse(await response.json());
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

function normalizeLibraryWidth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_LIBRARY_WIDTH;
  }

  return Math.max(MIN_LIBRARY_WIDTH, Math.min(MAX_LIBRARY_WIDTH, numeric));
}

function normalizeSettings(value) {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    dedupeWithinSession: Boolean(value.dedupeWithinSession),
    dedupeAcrossSessions: Boolean(value.dedupeAcrossSessions)
  };
}

function getLibraryWidthBounds() {
  const layoutWidth = elements.layoutPanel?.getBoundingClientRect().width || 0;
  const maxWidth = Math.min(MAX_LIBRARY_WIDTH, Math.max(MIN_LIBRARY_WIDTH, layoutWidth - MIN_DRAFT_WIDTH));

  return {
    min: MIN_LIBRARY_WIDTH,
    max: maxWidth
  };
}

function clampLibraryWidth(value) {
  const bounds = getLibraryWidthBounds();
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

function isStackedLayout() {
  return window.innerWidth <= STACKED_LAYOUT_BREAKPOINT;
}

function applyLayoutSizing() {
  if (!elements.layoutPanel || !elements.layoutResizer) {
    return;
  }

  if (isStackedLayout()) {
    elements.layoutPanel.style.removeProperty("--library-width");
    elements.layoutResizer.setAttribute("aria-disabled", "true");
    elements.layoutResizer.tabIndex = -1;
    return;
  }

  state.libraryWidth = clampLibraryWidth(state.libraryWidth);
  elements.layoutPanel.style.setProperty("--library-width", `${state.libraryWidth}px`);
  elements.layoutResizer.setAttribute("aria-disabled", "false");
  elements.layoutResizer.tabIndex = 0;

  const bounds = getLibraryWidthBounds();
  elements.layoutResizer.setAttribute("aria-valuemin", String(bounds.min));
  elements.layoutResizer.setAttribute("aria-valuemax", String(bounds.max));
  elements.layoutResizer.setAttribute("aria-valuenow", String(Math.round(state.libraryWidth)));
}

async function persistLibraryWidth() {
  await extensionApi.storage.local.set({
    [LIBRARY_WIDTH_KEY]: Math.round(state.libraryWidth)
  });
}

function updateLibraryWidth(nextWidth) {
  const clamped = clampLibraryWidth(nextWidth);
  if (clamped === state.libraryWidth) {
    return;
  }

  state.libraryWidth = clamped;
  applyLayoutSizing();
}

function handleResizerPointerDown(event) {
  if (isStackedLayout()) {
    return;
  }

  event.preventDefault();
  const resizer = event.currentTarget;
  const startX = event.clientX;
  const startWidth = state.libraryWidth;

  if (typeof resizer.setPointerCapture === "function") {
    resizer.setPointerCapture(event.pointerId);
  }

  const onPointerMove = (moveEvent) => {
    const nextWidth = startWidth + (startX - moveEvent.clientX);
    updateLibraryWidth(nextWidth);
  };

  const onPointerUp = async () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    if (typeof resizer.releasePointerCapture === "function") {
      try {
        resizer.releasePointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore lost pointer capture state.
      }
    }
    document.body.classList.remove("is-resizing-layout");
    await persistLibraryWidth();
  };

  document.body.classList.add("is-resizing-layout");
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, { once: true });
}

async function handleResizerKeyDown(event) {
  if (isStackedLayout()) {
    return;
  }

  let nextWidth = state.libraryWidth;

  if (event.key === "ArrowLeft") {
    nextWidth += RESIZER_STEP;
  } else if (event.key === "ArrowRight") {
    nextWidth -= RESIZER_STEP;
  } else if (event.key === "Home") {
    nextWidth = getLibraryWidthBounds().max;
  } else if (event.key === "End") {
    nextWidth = getLibraryWidthBounds().min;
  } else {
    return;
  }

  event.preventDefault();
  updateLibraryWidth(nextWidth);
  await persistLibraryWidth();
}

function handleWindowResize() {
  applyLayoutSizing();
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

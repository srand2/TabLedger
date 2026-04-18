const extensionApi = globalThis.browser ?? chrome;

const ROOT_FOLDER_TITLE = "Browsing Library";
const BOOKMARK_METADATA_KEY = "bookmarkMetadata";
const SAVED_SESSIONS_KEY = "savedSessions";
const AI_ENRICHMENT_QUEUE_KEY = "aiEnrichmentQueue";
const AI_ENRICHMENT_CONTROL_KEY = "aiEnrichmentControl";
const SYNC_KEY_PREFIX = "sync:session:";
const SYNC_INDEX_KEY = "sync:index";
const DEVICE_ID_KEY = "deviceId";
const SETTINGS_KEY = "tabLedgerSettings";
const ARCHIVE_AI_EDITABLE_FIELDS = ["category", "tags", "description", "summary"];
const VALID_FIELD_SOURCES = new Set(["heuristic", "ai", "user"]);
const DEFAULT_SETTINGS = {
  dedupeWithinSession: false,
  dedupeAcrossSessions: false
};
const AI_ENRICHMENT_REQUEST_TIMEOUT_MS = 45000;
let aiEnrichmentDrainPromise = null;
let aiEnrichmentCurrentController = null;
let aiEnrichmentCurrentSessionId = null;
let aiEnrichmentInterruptReason = null;

// Resume any AI enrichment that was interrupted by browser restart
extensionApi.runtime.onStartup.addListener(() => {
  drainAiEnrichmentQueue();
});

extensionApi.runtime.onInstalled.addListener(() => {
  drainAiEnrichmentQueue();
});

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "open-dashboard") {
    openDashboard(normalizeDashboardIntent(message.payload ?? message.scope))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("Failed to open dashboard", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true;
  }

  if (message?.type === "create-bookmark-archive") {
    createBookmarkArchive(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to create Browsing Library entry", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true;
  }

  if (message?.type === "open-archive-urls") {
    openArchiveUrls(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to reopen Browsing Library URLs", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true;
  }

  if (message?.type === "delete-archive-session") {
    deleteArchiveSession(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to delete Browsing Library session", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true;
  }

  if (message?.type === "delete-archive-item") {
    deleteArchiveItem(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to delete Browsing Library item", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true;
  }

  if (message?.type === "update-archive-item") {
    updateArchiveItem(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to update Browsing Library item", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true;
  }

  if (message?.type === "update-archive-category") {
    updateArchiveCategory(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to update Browsing Library category", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true;
  }

  if (message?.type === "get-bookmark-folders") {
    getBookmarkFolders()
      .then((folders) => sendResponse({ ok: true, folders }))
      .catch((error) => {
        console.error("Failed to get bookmark folders", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "import-bookmarks") {
    importBookmarksAsSession(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to import bookmarks", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "retry-ai-enrichment") {
    retryAiEnrichment(message.payload?.sessionId)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to retry AI enrichment", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "resume-ai-enrichment-queue") {
    resumeAiEnrichmentQueue()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to resume AI enrichment queue", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "pause-ai-enrichment-queue") {
    pauseAiEnrichmentQueue()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to pause AI enrichment queue", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "stop-ai-enrichment-queue") {
    stopAiEnrichmentQueue()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to stop AI enrichment queue", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "bulk-delete-archive-items") {
    bulkDeleteArchiveItems(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Failed to bulk delete archive items", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "workspace-search-library") {
    workspaceSearchLibrary(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Workspace search failed", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "workspace-generate-project") {
    workspaceGenerateProject(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Workspace generate failed", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "sync-now") {
    syncNow()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Sync failed", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  return false;
});

function normalizeDashboardIntent(value) {
  if (typeof value === "string") {
    return {
      capture: value
    };
  }

  if (!value || typeof value !== "object") {
    return {};
  }

  return {
    capture: typeof value.capture === "string" ? value.capture : null,
    view: typeof value.view === "string" ? value.view : null
  };
}

async function openDashboard(intent = {}) {
  const targetUrl = new URL(extensionApi.runtime.getURL("dashboard.html"));

  if (intent.capture) {
    targetUrl.searchParams.set("capture", intent.capture);
  }

  if (intent.view) {
    targetUrl.searchParams.set("view", intent.view);
  }

  await extensionApi.tabs.create({ url: targetUrl.toString() });
}

async function createBookmarkArchive(payload) {
  if (!extensionApi.bookmarks?.create) {
    throw new Error(
      "Native bookmark creation is not available in this browser. Use JSON export for now."
    );
  }

  validatePayload(payload);

  const archiveRoot = await ensureArchiveRoot();
  const sessionTitle = buildSessionTitle(payload.sessionName);
  const settings = await getStoredSettings();
  const metadataStore = await getStoredObject(BOOKMARK_METADATA_KEY);
  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const dedupeResult = buildArchiveItemsForSave(payload.items, savedSessions, metadataStore, settings);

  if (!dedupeResult.items.length) {
    throw new Error("All tabs in this draft were skipped by your deduplication settings.");
  }

  const sessionFolder = await extensionApi.bookmarks.create({
    parentId: archiveRoot.id,
    title: sessionTitle
  });

  const groupedItems = groupByCategory(dedupeResult.items);
  const createdBookmarkIds = [];
  const archivedItems = [];
  const archivedAt = new Date().toISOString();

  for (const [categoryName, items] of groupedItems.entries()) {
    const categoryFolder = await extensionApi.bookmarks.create({
      parentId: sessionFolder.id,
      title: categoryName
    });

    for (const item of items) {
      const bookmarkNode = await extensionApi.bookmarks.create({
        parentId: categoryFolder.id,
        title: item.title,
        url: item.url
      });

      metadataStore[bookmarkNode.id] = {
        bookmarkId: bookmarkNode.id,
        bookmarkFolderId: categoryFolder.id,
        sessionFolderId: sessionFolder.id,
        sessionTitle,
        category: categoryName,
        title: item.title,
        linkUrl: item.url,
        description: item.description,
        summary: item.summary,
        tags: item.tags,
        fieldSources: normalizeArchiveFieldSources(item.fieldSources),
        hostname: item.hostname,
        capturedAt: item.capturedAt || new Date().toISOString(),
        archivedAt
      };

      archivedItems.push({
        bookmarkId: bookmarkNode.id,
        bookmarkFolderId: categoryFolder.id,
        sessionFolderId: sessionFolder.id,
        title: item.title,
        url: item.url,
        hostname: item.hostname,
        category: categoryName,
        description: item.description,
        summary: item.summary,
        tags: item.tags,
        fieldSources: normalizeArchiveFieldSources(item.fieldSources),
        capturedAt: item.capturedAt || archivedAt,
        archivedAt
      });

      createdBookmarkIds.push(bookmarkNode.id);
    }
  }

  savedSessions.unshift({
    id: sessionFolder.id,
    title: sessionTitle,
    createdAt: archivedAt,
    tabCount: dedupeResult.items.length,
    categoryCount: groupedItems.size,
    bookmarkIds: createdBookmarkIds,
    categories: [...groupedItems.keys()],
    categoryMeta: [...groupedItems.keys()].map((name) => ({
      name,
      description: "",
      tags: []
    })),
    items: archivedItems
  });

  await extensionApi.storage.local.set({
    [BOOKMARK_METADATA_KEY]: metadataStore,
    [SAVED_SESSIONS_KEY]: savedSessions
  });

  return {
    sessionFolderId: sessionFolder.id,
    sessionTitle,
    tabCount: dedupeResult.items.length,
    categoryCount: groupedItems.size,
    duplicateCounts: dedupeResult.duplicateCounts
  };
}

function validatePayload(payload) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error("There are no tabs in the current draft to save to the Browsing Library.");
  }

  for (const item of payload.items) {
    if (!item.title || !item.url) {
      throw new Error("Every Browsing Library item needs a title and a URL.");
    }
  }
}

async function ensureArchiveRoot() {
  const tree = await extensionApi.bookmarks.getTree();
  const root = tree[0];
  const destinationParent =
    root.children?.find((node) => node.id === "2") ??
    root.children?.find((node) => !node.url);

  if (!destinationParent) {
    throw new Error("Could not find a writable bookmark folder.");
  }

  const children = await extensionApi.bookmarks.getChildren(destinationParent.id);
  const existing = children.find(
    (node) => !node.url && node.title === ROOT_FOLDER_TITLE
  );

  if (existing) {
    return existing;
  }

  return extensionApi.bookmarks.create({
    parentId: destinationParent.id,
    title: ROOT_FOLDER_TITLE
  });
}

function buildSessionTitle(sessionName) {
  const trimmed = String(sessionName || "").trim();
  const timestamp = new Date().toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  return trimmed ? `${trimmed} · ${timestamp}` : `Browsing Library · ${timestamp}`;
}

function groupByCategory(items) {
  const grouped = new Map();

  for (const item of items) {
    const categoryName = String(item.category || "Unsorted").trim() || "Unsorted";
    if (!grouped.has(categoryName)) {
      grouped.set(categoryName, []);
    }
    grouped.get(categoryName).push(item);
  }

  return new Map(
    [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

async function openArchiveUrls(payload) {
  const urls = getUniqueUrls(payload?.urls);

  if (!urls.length) {
    throw new Error("There are no saved Browsing Library URLs to reopen.");
  }

  const [firstUrl, ...rest] = urls;
  const createdWindow = await extensionApi.windows.create({ url: firstUrl });

  for (const url of rest) {
    await extensionApi.tabs.create({
      windowId: createdWindow.id,
      url
    });
  }

  return {
    openedCount: urls.length
  };
}

async function deleteArchiveSession(payload) {
  const sessionId = String(payload?.sessionId || "");
  const sessionTitle = String(payload?.sessionTitle || "");
  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const metadataStore = await getStoredObject(BOOKMARK_METADATA_KEY);

  const sessionIndex = savedSessions.findIndex(
    (session) => String(session.id) === sessionId || session.title === sessionTitle
  );

  if (sessionIndex === -1) {
    const removedMetadataCount = removeMetadataEntries(metadataStore, sessionId, sessionTitle);
    await extensionApi.storage.local.set({
      [BOOKMARK_METADATA_KEY]: metadataStore,
      [SAVED_SESSIONS_KEY]: savedSessions
    });

    return {
      removedMetadataCount
    };
  }

  const [removedSession] = savedSessions.splice(sessionIndex, 1);
  const bookmarkIds = Array.isArray(removedSession.bookmarkIds) ? removedSession.bookmarkIds : [];
  removeMetadataEntriesByBookmarkIds(metadataStore, bookmarkIds);
  removeMetadataEntries(metadataStore, String(removedSession.id), removedSession.title);

  await removeBookmarkTree(String(removedSession.id));
  await removeBookmarkNodes(bookmarkIds);

  await extensionApi.storage.local.set({
    [BOOKMARK_METADATA_KEY]: metadataStore,
    [SAVED_SESSIONS_KEY]: savedSessions
  });

  return {
    deletedSessionTitle: removedSession.title
  };
}

async function deleteArchiveItem(payload) {
  const sessionId = String(payload?.sessionId || "");
  const bookmarkId = String(payload?.bookmarkId || "");
  const itemTitle = String(payload?.title || "");
  const itemUrl = String(payload?.url || "");
  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const metadataStore = await getStoredObject(BOOKMARK_METADATA_KEY);

  const session = savedSessions.find((entry) => String(entry.id) === sessionId);
  if (!session || !Array.isArray(session.items)) {
    throw new Error("Could not find the Browsing Library session for this tab.");
  }

  const itemIndex = session.items.findIndex((item) =>
    bookmarkId
      ? String(item.bookmarkId || "") === bookmarkId
      : item.url === itemUrl && item.title === itemTitle
  );

  if (itemIndex === -1) {
    throw new Error("Could not find the Browsing Library tab to delete.");
  }

  const [removedItem] = session.items.splice(itemIndex, 1);

  if (removedItem.bookmarkId) {
    delete metadataStore[removedItem.bookmarkId];
    await removeBookmarkNode(String(removedItem.bookmarkId));
  } else {
    removeMatchingMetadataEntry(metadataStore, sessionId, itemUrl, itemTitle);
  }

  session.bookmarkIds = Array.isArray(session.bookmarkIds)
    ? session.bookmarkIds.filter((id) => String(id) !== String(removedItem.bookmarkId || ""))
    : [];
  session.tabCount = session.items.length;
  session.categories = [...new Set(session.items.map((item) => item.category))].sort();
  session.categoryCount = session.categories.length;
  session.categoryMeta = ensureCategoryMeta(session).filter((entry) =>
    session.categories.includes(entry.name)
  );

  if (removedItem.bookmarkFolderId) {
    await removeBookmarkFolderIfEmpty(String(removedItem.bookmarkFolderId));
  }

  if (!session.items.length) {
    const sessionIndex = savedSessions.findIndex((entry) => String(entry.id) === sessionId);
    if (sessionIndex !== -1) {
      savedSessions.splice(sessionIndex, 1);
    }
    await removeBookmarkTree(sessionId);
  }

  await extensionApi.storage.local.set({
    [BOOKMARK_METADATA_KEY]: metadataStore,
    [SAVED_SESSIONS_KEY]: savedSessions
  });

  return {
    deletedTitle: removedItem.title,
    remainingCount: session.items.length
  };
}

async function bulkDeleteArchiveItems(payload) {
  // payload.items: [{ sessionId, bookmarkId, title, url }]
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const metadataStore = await getStoredObject(BOOKMARK_METADATA_KEY);
  const bookmarkIdsToRemove = [];
  const categoryFolderIds = new Set();

  for (const { sessionId, bookmarkId, title, url } of items) {
    const session = savedSessions.find((s) => String(s.id) === String(sessionId));
    if (!session || !Array.isArray(session.items)) continue;

    const itemIndex = session.items.findIndex((item) =>
      bookmarkId
        ? String(item.bookmarkId || "") === String(bookmarkId)
        : item.url === url && item.title === title
    );
    if (itemIndex === -1) continue;

    const [removedItem] = session.items.splice(itemIndex, 1);
    if (removedItem.bookmarkId) {
      bookmarkIdsToRemove.push(String(removedItem.bookmarkId));
      delete metadataStore[removedItem.bookmarkId];
      session.bookmarkIds = (session.bookmarkIds || []).filter(
        (id) => String(id) !== String(removedItem.bookmarkId)
      );
      if (removedItem.bookmarkFolderId) {
        categoryFolderIds.add(String(removedItem.bookmarkFolderId));
      }
    }
    session.tabCount = session.items.length;
    session.categories = [...new Set(session.items.map((item) => item.category))].sort();
    session.categoryCount = session.categories.length;
    session.categoryMeta = ensureCategoryMeta(session).filter((entry) =>
      session.categories.includes(entry.name)
    );
  }

  // Remove individual bookmarks first
  await removeBookmarkNodes(bookmarkIdsToRemove);

  // Clean up category folders that became empty
  for (const folderId of categoryFolderIds) {
    await removeBookmarkFolderIfEmpty(folderId);
  }

  // Delete entire sessions that are now empty
  const emptySessions = savedSessions.filter((s) => !s.items.length);
  for (const emptySession of emptySessions) {
    await removeBookmarkTree(String(emptySession.id));
    removeMetadataEntries(metadataStore, String(emptySession.id), emptySession.title);
  }

  const updatedSessions = savedSessions.filter((s) => s.items.length > 0);

  await extensionApi.storage.local.set({
    [BOOKMARK_METADATA_KEY]: metadataStore,
    [SAVED_SESSIONS_KEY]: updatedSessions
  });

  return { deletedTabCount: bookmarkIdsToRemove.length, deletedSessionCount: emptySessions.length };
}

async function updateArchiveItem(payload) {
  const sessionId = String(payload?.sessionId || "");
  const bookmarkId = String(payload?.bookmarkId || "");
  const itemTitle = String(payload?.title || "");
  const itemUrl = String(payload?.url || "");
  const nextCategory = String(payload?.category || "").trim() || "Unsorted";
  const description = String(payload?.description || "").trim();
  const summary = String(payload?.summary || "").trim();
  const tags = normalizeStringList(payload?.tags);
  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const metadataStore = await getStoredObject(BOOKMARK_METADATA_KEY);

  const session = savedSessions.find((entry) => String(entry.id) === sessionId);
  if (!session || !Array.isArray(session.items)) {
    throw new Error("Could not find the Browsing Library session for this tab.");
  }

  const item = session.items.find((entry) =>
    bookmarkId
      ? String(entry.bookmarkId || "") === bookmarkId
      : entry.url === itemUrl && entry.title === itemTitle
  );

  if (!item) {
    throw new Error("Could not find the Browsing Library tab to update.");
  }

  const previousFolderId = String(item.bookmarkFolderId || "");
  const previousCategory = String(item.category || "");
  let nextFolderId = previousFolderId || null;
  const nextValues = {
    category: nextCategory,
    tags,
    description,
    summary
  };

  if (previousCategory !== nextCategory) {
    try {
      const folder = await ensureSessionCategoryFolder(sessionId, nextCategory);
      nextFolderId = folder?.id || nextFolderId;

      if (item.bookmarkId && nextFolderId && extensionApi.bookmarks?.move) {
        await extensionApi.bookmarks.move(String(item.bookmarkId), {
          parentId: String(nextFolderId)
        });
      }
    } catch (_error) {
      // Ignore bookmark tree issues and still persist archive storage changes.
    }
  }

  const nextFieldSources = applyArchiveFieldSourceUpdates(
    item.fieldSources,
    item,
    nextValues,
    payload?.updateSource
  );

  item.category = nextValues.category;
  item.tags = nextValues.tags;
  item.description = nextValues.description;
  item.summary = nextValues.summary;
  item.bookmarkFolderId = nextFolderId;
  item.fieldSources = nextFieldSources;

  const metadataEntry = getArchiveMetadataEntry(metadataStore, sessionId, bookmarkId, itemUrl, itemTitle);
  if (metadataEntry) {
    metadataEntry.category = nextValues.category;
    metadataEntry.tags = nextValues.tags;
    metadataEntry.description = nextValues.description;
    metadataEntry.summary = nextValues.summary;
    metadataEntry.bookmarkFolderId = nextFolderId;
    metadataEntry.fieldSources = nextFieldSources;
  }

  session.items = session.items
    .slice()
    .sort((left, right) => {
      const categoryCompare = String(left.category || "").localeCompare(String(right.category || ""));
      if (categoryCompare !== 0) {
        return categoryCompare;
      }

      return String(left.title || "").localeCompare(String(right.title || ""));
    });
  session.tabCount = session.items.length;
  session.categories = [...new Set(session.items.map((entry) => entry.category))].sort();
  session.categoryCount = session.categories.length;
  session.categoryMeta = ensureCategoryMeta(session).filter((entry) =>
    session.categories.includes(entry.name)
  );

  if (previousFolderId && previousFolderId !== String(nextFolderId || "")) {
    await removeBookmarkFolderIfEmpty(previousFolderId);
  }

  await extensionApi.storage.local.set({
    [BOOKMARK_METADATA_KEY]: metadataStore,
    [SAVED_SESSIONS_KEY]: savedSessions
  });

  return {
    itemTitle: item.title,
    categoryName: item.category,
    fieldSources: nextFieldSources
  };
}

async function updateArchiveCategory(payload) {
  const sessionId = String(payload?.sessionId || "");
  const previousName = String(payload?.previousName || "").trim();
  const nextName = String(payload?.nextName || "").trim() || previousName;
  const description = String(payload?.description || "").trim();
  const tags = normalizeStringList(payload?.tags);
  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const metadataStore = await getStoredObject(BOOKMARK_METADATA_KEY);

  const session = savedSessions.find((entry) => String(entry.id) === sessionId);
  if (!session) {
    throw new Error("Could not find the Browsing Library session for this category.");
  }

  session.categoryMeta = ensureCategoryMeta(session);

  if (nextName !== previousName) {
    for (const item of session.items || []) {
      if (item.category === previousName) {
        item.category = nextName;
      }
    }

    for (const entry of Object.values(metadataStore)) {
      if (
        String(entry.sessionFolderId || "") === sessionId &&
        String(entry.category || "") === previousName
      ) {
        entry.category = nextName;
      }
    }

    const folderIds = [...new Set(
      (session.items || [])
        .filter((item) => item.category === nextName)
        .map((item) => item.bookmarkFolderId)
        .filter(Boolean)
    )];

    await renameBookmarkFolders(folderIds, nextName);
  }

  const duplicateMeta = session.categoryMeta.find(
    (entry) => entry.name === nextName && entry.name !== previousName
  );

  const mergedMeta = {
    name: nextName,
    description,
    tags: duplicateMeta
      ? normalizeStringList([...(duplicateMeta.tags || []), ...tags])
      : tags
  };

  session.categoryMeta = session.categoryMeta
    .filter((entry) => entry.name !== previousName && entry.name !== nextName)
    .concat(mergedMeta);

  session.categories = [...new Set((session.items || []).map((item) => item.category))].sort();
  session.categoryCount = session.categories.length;
  session.categoryMeta = ensureCategoryMeta(session).filter((entry) =>
    session.categories.includes(entry.name)
  );

  await extensionApi.storage.local.set({
    [BOOKMARK_METADATA_KEY]: metadataStore,
    [SAVED_SESSIONS_KEY]: savedSessions
  });

  return {
    categoryName: nextName
  };
}

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "_ga", "_gid",
  "ref",      // broad — may false-positive on GitHub branch URLs (ref=branchname)
  "mc_cid", "mc_eid"
]);

function normalizeArchiveUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw.toLowerCase();
  }

  // Remove tracking query parameters
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key)) {
      parsed.searchParams.delete(key);
    }
  }
  // Sort remaining params so ?a=1&b=2 and ?b=2&a=1 produce the same key
  parsed.searchParams.sort();

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  // Path casing is intentionally preserved — RFC 3986 treats paths as case-sensitive
  // Strip trailing slash from path (root "/" becomes empty string)
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  const query = parsed.search; // e.g. "?q=hello" or "" — fragment already absent

  return `${host}${path}${query}`;
}

function getUniqueUrls(urls) {
  if (!Array.isArray(urls)) {
    return [];
  }

  const seen = new Set();
  const uniqueUrls = [];

  for (const url of urls) {
    const raw = String(url || "").trim();
    if (!raw) continue;
    const key = normalizeArchiveUrl(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueUrls.push(raw); // push original, not normalized key
  }

  return uniqueUrls;
}

function scoreItemEnrichment(item) {
  const sources = item?.fieldSources;
  if (!sources || typeof sources !== "object") return 0;
  let score = 0;
  for (const field of ["category", "tags", "description", "summary"]) {
    if (sources[field] === "user") score += 3;
    else if (sources[field] === "ai") score += 2;
    else if (sources[field] === "heuristic") score += 1;
  }
  return score;
}

function buildArchiveItemsForSave(items, savedSessions, metadataStore, settings) {
  const duplicateCounts = {
    withinSession: 0,
    acrossSessions: 0
  };
  const existingLibraryUrls = settings.dedupeAcrossSessions
    ? buildExistingLibraryUrlSet(savedSessions, metadataStore)
    : new Set();

  // Step 1: Within-session dedup — group by normalized URL, keep highest-scored item.
  // Output order matches first-occurrence position of each URL in the input.
  let workingItems = items;
  if (settings.dedupeWithinSession) {
    const bestByUrl = new Map(); // normalizedUrl → best item so far
    for (const item of items) {
      const normalizedUrl = normalizeArchiveUrl(item.url);
      if (!normalizedUrl) continue;
      const current = bestByUrl.get(normalizedUrl);
      if (!current || scoreItemEnrichment(item) > scoreItemEnrichment(current)) {
        bestByUrl.set(normalizedUrl, item);
      }
    }
    // Reconstruct in first-occurrence order
    const seenUrls = new Set();
    const deduped = [];
    for (const item of items) {
      const normalizedUrl = normalizeArchiveUrl(item.url);
      if (!normalizedUrl) continue;
      if (seenUrls.has(normalizedUrl)) continue;
      seenUrls.add(normalizedUrl);
      deduped.push(bestByUrl.get(normalizedUrl)); // push the best item for this URL
    }
    const totalWithUrls = items.filter((i) => normalizeArchiveUrl(i.url)).length;
    duplicateCounts.withinSession = totalWithUrls - deduped.length;
    workingItems = deduped;
  }

  // Step 2: Across-sessions dedup — skip URLs already saved in the library.
  const filteredItems = [];
  for (const item of workingItems) {
    const normalizedUrl = normalizeArchiveUrl(item.url);
    if (!normalizedUrl) continue;
    if (settings.dedupeAcrossSessions && existingLibraryUrls.has(normalizedUrl)) {
      duplicateCounts.acrossSessions += 1;
      continue;
    }
    filteredItems.push(item);
  }

  return {
    items: filteredItems,
    duplicateCounts
  };
}

// Build a map from normalized URL → prior AI/user-set metadata for that URL.
// Used to avoid re-enriching URLs that were already processed in a previous session.
function buildUrlAiEnrichmentMap(savedSessions, metadataStore) {
  const map = new Map();

  const considerEntry = (entry, url) => {
    const normalized = normalizeArchiveUrl(url);
    if (!normalized || !entry) return;
    const fieldSources = entry.fieldSources || {};
    // Qualifies as "already enriched" if any of the four fields was set by AI or the user
    const hasEnrichment = ARCHIVE_AI_EDITABLE_FIELDS.some(
      (f) => fieldSources[f] === "ai" || fieldSources[f] === "user"
    );
    if (!hasEnrichment) return;

    const score = scoreItemEnrichment(entry);
    const existing = map.get(normalized);
    if (!existing || score > existing._score) {
      map.set(normalized, {
        category: String(entry.category || "").trim(),
        tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
        description: String(entry.description || "").trim(),
        summary: String(entry.summary || "").trim(),
        fieldSources: normalizeArchiveFieldSources(fieldSources),
        _score: score
      });
    }
  };

  for (const session of savedSessions || []) {
    for (const item of session.items || []) {
      considerEntry(item, item.url || item.linkUrl);
    }
  }
  for (const entry of Object.values(metadataStore || {})) {
    considerEntry(entry, entry.linkUrl || entry.url);
  }

  return map;
}

// True if an item's fieldSources indicate it's already fully processed by AI (or user-edited)
// — i.e. none of the four editable fields are still "heuristic".
function isItemAlreadyEnriched(item) {
  const fs = item?.fieldSources || {};
  return ARCHIVE_AI_EDITABLE_FIELDS.every(
    (f) => fs[f] === "ai" || fs[f] === "user"
  );
}

function buildExistingLibraryUrlSet(savedSessions, metadataStore) {
  const urls = new Set();

  for (const session of savedSessions || []) {
    for (const item of session.items || []) {
      const normalizedUrl = normalizeArchiveUrl(item?.url || item?.linkUrl);
      if (normalizedUrl) {
        urls.add(normalizedUrl);
      }
    }
  }

  for (const entry of Object.values(metadataStore || {})) {
    const normalizedUrl = normalizeArchiveUrl(entry?.url || entry?.linkUrl);
    if (normalizedUrl) {
      urls.add(normalizedUrl);
    }
  }

  return urls;
}

function getArchiveMetadataEntry(metadataStore, sessionId, bookmarkId, url, title) {
  if (bookmarkId && metadataStore[bookmarkId]) {
    return metadataStore[bookmarkId];
  }

  for (const entry of Object.values(metadataStore)) {
    if (
      String(entry.sessionFolderId || "") === sessionId &&
      String(entry.linkUrl || entry.url || "") === url &&
      String(entry.title || "") === title
    ) {
      return entry;
    }
  }

  return null;
}

function removeMetadataEntries(metadataStore, sessionId, sessionTitle) {
  let removedCount = 0;

  for (const [bookmarkId, entry] of Object.entries(metadataStore)) {
    if (
      String(entry.sessionFolderId || "") === sessionId ||
      String(entry.sessionTitle || "") === sessionTitle
    ) {
      delete metadataStore[bookmarkId];
      removedCount += 1;
    }
  }

  return removedCount;
}

function removeMetadataEntriesByBookmarkIds(metadataStore, bookmarkIds) {
  for (const bookmarkId of bookmarkIds || []) {
    delete metadataStore[String(bookmarkId)];
  }
}

function removeMatchingMetadataEntry(metadataStore, sessionId, url, title) {
  for (const [bookmarkId, entry] of Object.entries(metadataStore)) {
    if (
      String(entry.sessionFolderId || "") === sessionId &&
      String(entry.linkUrl || entry.url || "") === url &&
      String(entry.title || "") === title
    ) {
      delete metadataStore[bookmarkId];
      return true;
    }
  }

  return false;
}

function ensureCategoryMeta(session) {
  const existing = Array.isArray(session.categoryMeta)
    ? session.categoryMeta.map((entry) => ({
        name: String(entry.name || "").trim(),
        description: String(entry.description || ""),
        tags: normalizeStringList(entry.tags)
      }))
    : [];

  const names = new Set(existing.map((entry) => entry.name));
  for (const categoryName of session.categories || []) {
    const normalizedName = String(categoryName || "").trim();
    if (normalizedName && !names.has(normalizedName)) {
      existing.push({
        name: normalizedName,
        description: "",
        tags: []
      });
      names.add(normalizedName);
    }
  }

  return existing;
}

function normalizeStringList(values) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeArchiveFieldSources(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = {};

  for (const field of ARCHIVE_AI_EDITABLE_FIELDS) {
    const nextValue = typeof source[field] === "string" ? source[field].trim() : "";
    normalized[field] = VALID_FIELD_SOURCES.has(nextValue) ? nextValue : "heuristic";
  }

  return normalized;
}

function areArchiveFieldValuesEqual(field, previousValue, nextValue) {
  if (field === "tags") {
    const left = normalizeStringList(previousValue);
    const right = normalizeStringList(nextValue);
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  return String(previousValue || "") === String(nextValue || "");
}

function applyArchiveFieldSourceUpdates(existingSources, previousItem, nextValues, nextSource) {
  const source = VALID_FIELD_SOURCES.has(String(nextSource || "").trim())
    ? String(nextSource).trim()
    : "user";
  const updatedSources = normalizeArchiveFieldSources(existingSources);

  for (const field of ARCHIVE_AI_EDITABLE_FIELDS) {
    if (!areArchiveFieldValuesEqual(field, previousItem?.[field], nextValues?.[field])) {
      updatedSources[field] = source;
    }
  }

  return updatedSources;
}

async function removeBookmarkTree(bookmarkId) {
  if (!extensionApi.bookmarks?.removeTree || !bookmarkId) {
    return;
  }

  try {
    await extensionApi.bookmarks.removeTree(bookmarkId);
  } catch (_error) {
    // Ignore missing nodes so archive storage can still be cleaned up.
  }
}

async function removeBookmarkNode(bookmarkId) {
  if (!extensionApi.bookmarks?.remove || !bookmarkId) {
    return;
  }

  try {
    await extensionApi.bookmarks.remove(bookmarkId);
  } catch (_error) {
    // Ignore missing nodes so archive storage can still be cleaned up.
  }
}

async function removeBookmarkNodes(bookmarkIds) {
  for (const bookmarkId of bookmarkIds || []) {
    await removeBookmarkNode(String(bookmarkId));
  }
}

async function removeBookmarkFolderIfEmpty(folderId) {
  if (!extensionApi.bookmarks?.getChildren || !extensionApi.bookmarks?.remove || !folderId) {
    return;
  }

  try {
    const children = await extensionApi.bookmarks.getChildren(folderId);
    if (!children.length) {
      await extensionApi.bookmarks.remove(folderId);
    }
  } catch (_error) {
    // Ignore stale folder references.
  }
}

async function renameBookmarkFolders(folderIds, nextName) {
  if (!extensionApi.bookmarks?.update || !nextName) {
    return;
  }

  for (const folderId of folderIds) {
    try {
      await extensionApi.bookmarks.update(String(folderId), {
        title: nextName
      });
    } catch (_error) {
      // Ignore stale folder references.
    }
  }
}

async function ensureSessionCategoryFolder(sessionFolderId, categoryName) {
  if (!extensionApi.bookmarks?.getChildren || !extensionApi.bookmarks?.create) {
    return null;
  }

  const children = await extensionApi.bookmarks.getChildren(String(sessionFolderId));
  const existing = children.find((node) => !node.url && node.title === categoryName);

  if (existing) {
    return existing;
  }

  return extensionApi.bookmarks.create({
    parentId: String(sessionFolderId),
    title: categoryName
  });
}

async function getStoredObject(key) {
  const stored = await extensionApi.storage.local.get(key);
  return stored[key] && typeof stored[key] === "object" ? stored[key] : {};
}

async function getStoredArray(key) {
  const stored = await extensionApi.storage.local.get(key);
  return Array.isArray(stored[key]) ? stored[key] : [];
}

async function getStoredSettings() {
  const stored = await extensionApi.storage.local.get(SETTINGS_KEY);
  const value = stored[SETTINGS_KEY];

  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    dedupeWithinSession: Boolean(value.dedupeWithinSession),
    dedupeAcrossSessions: Boolean(value.dedupeAcrossSessions)
  };
}

// ── Device ID ─────────────────────────────────────────────────────────────────

async function getDeviceId() {
  const stored = await extensionApi.storage.local.get(DEVICE_ID_KEY);
  if (stored[DEVICE_ID_KEY]) return stored[DEVICE_ID_KEY];
  const deviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await extensionApi.storage.local.set({ [DEVICE_ID_KEY]: deviceId });
  return deviceId;
}

// ── Bookmark folder listing ───────────────────────────────────────────────────

async function getBookmarkFolders() {
  if (!extensionApi.bookmarks?.getTree) {
    throw new Error("Chrome Bookmarks API is not available.");
  }
  const tree = await extensionApi.bookmarks.getTree();
  const folders = [];
  const SKIP_TITLES = new Set(["Bookmarks Bar", "Other Bookmarks", "Mobile Bookmarks"]);

  function walk(node, depth) {
    if (node.url) return;
    if (depth > 0 && !SKIP_TITLES.has(node.title)) {
      folders.push({
        id: node.id,
        title: node.title || "Untitled",
        depth,
        childCount: (node.children || []).filter((c) => c.url).length
      });
    }
    for (const child of node.children || []) {
      walk(child, depth + 1);
    }
  }

  walk(tree[0], 0);
  return folders;
}

// ── Bookmark import ───────────────────────────────────────────────────────────

async function importBookmarksAsSession({ folderId = null, useAi = false } = {}) {
  if (!extensionApi.bookmarks?.getTree) {
    throw new Error("Chrome Bookmarks API is not available.");
  }
  const enrichmentControl = await getAiEnrichmentControl();
  const tree = await extensionApi.bookmarks.getTree();
  const root = folderId
    ? (await extensionApi.bookmarks.getSubTree(folderId))[0]
    : tree[0];

  const sessions = buildSessionsFromNode(root, Boolean(folderId));
  if (!sessions.length) {
    throw new Error("No bookmark folders found to import.");
  }

  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const metadataStore = await getStoredObject(BOOKMARK_METADATA_KEY);
  const archivedAt = new Date().toISOString();
  const newSessionIds = [];

  // Build a URL → prior enrichment map once so we can skip AI on URLs we've already processed.
  const urlAiMap = buildUrlAiEnrichmentMap(savedSessions, metadataStore);
  let inheritedCount = 0;

  for (const session of sessions) {
    const archiveRoot = await ensureArchiveRoot();
    const sessionTitle = buildSessionTitle(session.name);
    const sessionFolder = await extensionApi.bookmarks.create({
      parentId: archiveRoot.id,
      title: sessionTitle
    });

    const groupedItems = groupByCategory(session.items);
    const createdBookmarkIds = [];
    const archivedItems = [];

    for (const [categoryName, items] of groupedItems.entries()) {
      const categoryFolder = await extensionApi.bookmarks.create({
        parentId: sessionFolder.id,
        title: categoryName
      });

      for (const item of items) {
        const bookmarkNode = await extensionApi.bookmarks.create({
          parentId: categoryFolder.id,
          title: item.title,
          url: item.url
        });

        // Inherit prior enrichment if this URL was already AI/user-enriched in the library.
        // Keeps category from the imported folder (that's the user's organisational choice),
        // but inherits tags/description/summary/fieldSources so AI doesn't re-process.
        const normalizedImportUrl = normalizeArchiveUrl(item.url);
        const prior = normalizedImportUrl ? urlAiMap.get(normalizedImportUrl) : null;
        const mergedTags = prior ? prior.tags : [];
        const mergedDescription = prior ? prior.description : "";
        const mergedSummary = prior ? prior.summary : "";
        const mergedFieldSources = prior
          ? normalizeArchiveFieldSources({
              // Keep category fieldSource from import (heuristic), inherit the rest
              category: "heuristic",
              tags: prior.fieldSources.tags,
              description: prior.fieldSources.description,
              summary: prior.fieldSources.summary
            })
          : normalizeArchiveFieldSources(item.fieldSources);

        if (prior) inheritedCount += 1;

        metadataStore[bookmarkNode.id] = {
          bookmarkId: bookmarkNode.id,
          bookmarkFolderId: categoryFolder.id,
          sessionFolderId: sessionFolder.id,
          sessionTitle,
          category: categoryName,
          title: item.title,
          linkUrl: item.url,
          hostname: item.hostname,
          capturedAt: item.capturedAt || archivedAt,
          archivedAt,
          description: mergedDescription,
          summary: mergedSummary,
          tags: mergedTags,
          fieldSources: mergedFieldSources
        };

        archivedItems.push({
          bookmarkId: bookmarkNode.id,
          bookmarkFolderId: categoryFolder.id,
          sessionFolderId: sessionFolder.id,
          title: item.title,
          url: item.url,
          hostname: item.hostname,
          category: categoryName,
          capturedAt: item.capturedAt || archivedAt,
          archivedAt,
          description: mergedDescription,
          summary: mergedSummary,
          tags: mergedTags,
          fieldSources: mergedFieldSources
        });

        createdBookmarkIds.push(bookmarkNode.id);
      }
    }

    // If every item in the session was inherited from prior enrichment, skip AI queue.
    const sessionNeedsAi = useAi && archivedItems.some((it) => !isItemAlreadyEnriched(it));
    const sessionRecord = {
      id: sessionFolder.id,
      title: sessionTitle,
      createdAt: archivedAt,
      tabCount: archivedItems.length,
      categoryCount: groupedItems.size,
      bookmarkIds: createdBookmarkIds,
      categories: [...groupedItems.keys()],
      categoryMeta: [...groupedItems.keys()].map((name) => ({ name, description: "", tags: [] })),
      items: archivedItems,
      aiEnrichmentStatus: sessionNeedsAi
        ? (enrichmentControl.paused ? "paused" : "pending")
        : "done"
    };

    savedSessions.unshift(sessionRecord);
    if (sessionNeedsAi) {
      newSessionIds.push(sessionFolder.id);
    }
  }

  await extensionApi.storage.local.set({
    [BOOKMARK_METADATA_KEY]: metadataStore,
    [SAVED_SESSIONS_KEY]: savedSessions
  });

  if (useAi && newSessionIds.length > 0) {
    const queue = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
    await extensionApi.storage.local.set({
      [AI_ENRICHMENT_QUEUE_KEY]: [...queue, ...newSessionIds]
    });
    if (!enrichmentControl.paused) {
      drainAiEnrichmentQueue();
    }
  }

  return {
    importedCount: sessions.length,
    totalBookmarks: sessions.reduce((sum, s) => sum + s.items.length, 0),
    inheritedCount,
    sessionIds: newSessionIds.map((id) => String(id))
  };
}

function buildSessionsFromNode(rootNode, isSubfolderImport = false) {
  const SKIP_TITLES = new Set(["Bookmarks Bar", "Other Bookmarks", "Mobile Bookmarks"]);
  const sessions = [];

  function walkFolder(node, parentIsRoot) {
    if (node.url) return;
    if (SKIP_TITLES.has(node.title) && !parentIsRoot) return;

    const directBookmarks = (node.children || []).filter((c) => c.url);
    const subFolders = (node.children || []).filter((c) => !c.url);

    if (directBookmarks.length > 0 && !parentIsRoot) {
      sessions.push({
        name: node.title || "Loose Bookmarks",
        items: directBookmarks.map((b) => ({
          title: b.title || "Untitled",
          url: b.url,
          hostname: safeHostname(b.url),
          category: node.title || "Uncategorized",
          capturedAt: b.dateAdded ? new Date(b.dateAdded).toISOString() : new Date().toISOString(),
          description: "",
          summary: "",
          tags: [],
          fieldSources: normalizeArchiveFieldSources(null)
        }))
      });
    }

    // Collect loose bookmarks at true root into "Loose Bookmarks"
    if (parentIsRoot && directBookmarks.length > 0) {
      sessions.push({
        name: "Loose Bookmarks",
        items: directBookmarks.map((b) => ({
          title: b.title || "Untitled",
          url: b.url,
          hostname: safeHostname(b.url),
          category: "Uncategorized",
          capturedAt: b.dateAdded ? new Date(b.dateAdded).toISOString() : new Date().toISOString(),
          description: "",
          summary: "",
          tags: [],
          fieldSources: normalizeArchiveFieldSources(null)
        }))
      });
    }

    for (const child of subFolders) {
      walkFolder(child, false);
    }
  }

  // When importing a specific subfolder, treat it as a folder-level walk
  walkFolder(rootNode, !isSubfolderImport);
  return sessions;
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (_e) {
    return "unknown";
  }
}

// ── AI enrichment queue ───────────────────────────────────────────────────────

async function drainAiEnrichmentQueue() {
  if (aiEnrichmentDrainPromise) {
    return aiEnrichmentDrainPromise;
  }

  aiEnrichmentDrainPromise = (async () => {
    let processedCount = 0;

    while (true) {
      const control = await getAiEnrichmentControl();
      if (control.paused) {
        return { processedCount, paused: true };
      }

      const queue = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
      if (!queue.length) {
        return { processedCount };
      }

      const settings = await extensionApi.storage.local.get(SETTINGS_KEY);
      const apiKey = settings[SETTINGS_KEY]?.geminiApiKey;
      const model = settings[SETTINGS_KEY]?.geminiModel || "gemini-2.5-flash";
      const sessionId = queue[0];

      const result = await enrichSessionWithAi(sessionId, apiKey, model);

      if (result?.outcome === "paused") {
        return { processedCount, paused: true };
      }

      const remaining = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
      await extensionApi.storage.local.set({
        [AI_ENRICHMENT_QUEUE_KEY]: remaining.filter((id) => String(id) !== String(sessionId))
      });

      processedCount += 1;
    }
  })();

  try {
    return await aiEnrichmentDrainPromise;
  } finally {
    aiEnrichmentDrainPromise = null;
  }
}

async function enrichSessionWithAi(sessionId, apiKey, model) {
  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const session = savedSessions.find((s) => String(s.id) === String(sessionId));
  if (!session) return { outcome: "skipped" };

  if (!apiKey) {
    markEnrichmentStatus(savedSessions, sessionId, "failed");
    await extensionApi.storage.local.set({ [SAVED_SESSIONS_KEY]: savedSessions });
    return { outcome: "failed" };
  }

  const controller = new AbortController();
  aiEnrichmentCurrentController = controller;
  aiEnrichmentCurrentSessionId = String(sessionId);

  try {
    const allItems = session.items || [];
    // Only send items that are NOT already AI/user-enriched. This prevents wasted API calls
    // when re-importing bookmarks or retrying a partially-processed session.
    const items = allItems.filter((item) => !isItemAlreadyEnriched(item));

    if (!items.length) {
      markEnrichmentStatus(savedSessions, sessionId, "done");
      await extensionApi.storage.local.set({ [SAVED_SESSIONS_KEY]: savedSessions });
      console.log(`[AI enrichment] Session ${sessionId}: all ${allItems.length} items already enriched — skipped Gemini call.`);
      return { outcome: "done", suggestionsCount: 0, matchedCount: 0, itemsCount: 0, skipped: allItems.length };
    }

    const prompt = buildEnrichmentPrompt(session.title, items);
    throwIfAiEnrichmentInterrupted(controller);
    const suggestions = normalizeEnrichmentSuggestions(
      await callGeminiApi(prompt, apiKey, model, controller)
    );
    throwIfAiEnrichmentInterrupted(controller);

    const metadataStore = await getStoredObject(BOOKMARK_METADATA_KEY);
    const foldersToCleanup = new Set();
    const usedSuggestionIndexes = new Set();
    let matchedCount = 0;

    for (const [index, item] of items.entries()) {
      throwIfAiEnrichmentInterrupted(controller);
      const suggestion = findEnrichmentSuggestionForItem(
        item,
        index,
        suggestions,
        usedSuggestionIndexes
      );
      if (!suggestion) continue;
      matchedCount += 1;

      const previousCategory = cleanCategoryName(item.category);
      const nextCategory = cleanCategoryName(suggestion.category) || previousCategory;
      const nextTags = normalizeStringList(suggestion.tags);
      const previousFolderId = String(item.bookmarkFolderId || "");
      let nextFolderId = previousFolderId || null;
      const nextValues = {
        category: nextCategory,
        tags: nextTags,
        description: String(suggestion.description || "").trim(),
        summary: String(suggestion.summary || "").trim()
      };

      if (nextCategory !== previousCategory) {
        try {
          throwIfAiEnrichmentInterrupted(controller);
          const folder = await ensureSessionCategoryFolder(session.id, nextCategory);
          nextFolderId = folder?.id || nextFolderId;

          if (item.bookmarkId && nextFolderId && extensionApi.bookmarks?.move) {
            throwIfAiEnrichmentInterrupted(controller);
            await extensionApi.bookmarks.move(String(item.bookmarkId), {
              parentId: String(nextFolderId)
            });
          }
        } catch (_error) {
          nextFolderId = previousFolderId || nextFolderId;
        }
      }

      const nextFieldSources = applyArchiveFieldSourceUpdates(
        item.fieldSources,
        item,
        nextValues,
        "ai"
      );

      item.category = nextValues.category;
      item.tags = nextValues.tags;
      item.bookmarkFolderId = nextFolderId;
      item.description = nextValues.description;
      item.summary = nextValues.summary;
      item.fieldSources = nextFieldSources;

      const meta = metadataStore[item.bookmarkId];
      if (meta) {
        meta.category = nextValues.category;
        meta.tags = nextValues.tags;
        meta.bookmarkFolderId = nextFolderId;
        meta.description = item.description;
        meta.summary = item.summary;
        meta.fieldSources = nextFieldSources;
      }

      if (
        previousFolderId &&
        nextFolderId &&
        String(previousFolderId) !== String(nextFolderId)
      ) {
        foldersToCleanup.add(String(previousFolderId));
      }
    }

    if (!matchedCount) {
      throw new Error("Gemini returned suggestions that could not be matched to imported tabs.");
    }

    for (const folderId of foldersToCleanup) {
      throwIfAiEnrichmentInterrupted(controller);
      await removeBookmarkFolderIfEmpty(folderId);
    }

    session.categories = [...new Set(items.map((i) => i.category))].sort();
    session.categoryCount = session.categories.length;
    session.categoryMeta = session.categories.map((name) => ({ name, description: "", tags: [] }));
    markEnrichmentStatus(savedSessions, sessionId, "done");
    throwIfAiEnrichmentInterrupted(controller);

    await extensionApi.storage.local.set({
      [SAVED_SESSIONS_KEY]: savedSessions,
      [BOOKMARK_METADATA_KEY]: metadataStore
    });
    return { outcome: "done" };
  } catch (err) {
    if (controller.signal.aborted || err?.name === "AbortError") {
      const reason = controller.signal.reason || aiEnrichmentInterruptReason;
      if (reason === "paused") {
        return { outcome: "paused" };
      }
      if (reason === "stopped") {
        return { outcome: "stopped" };
      }
    }

    console.error("AI enrichment failed for session", sessionId, err);
    markEnrichmentStatus(savedSessions, sessionId, "failed");
    await extensionApi.storage.local.set({ [SAVED_SESSIONS_KEY]: savedSessions });
    return { outcome: "failed" };
  } finally {
    if (aiEnrichmentCurrentController === controller) {
      aiEnrichmentCurrentController = null;
    }
    if (aiEnrichmentCurrentSessionId === String(sessionId)) {
      aiEnrichmentCurrentSessionId = null;
    }
    if (!aiEnrichmentCurrentController) {
      aiEnrichmentInterruptReason = null;
    }
  }
}

function markEnrichmentStatus(sessions, sessionId, status) {
  const session = sessions.find((s) => String(s.id) === String(sessionId));
  if (session) session.aiEnrichmentStatus = status;
}

function throwIfAiEnrichmentInterrupted(controller) {
  if (!controller?.signal?.aborted) {
    return;
  }

  const reason = controller.signal.reason || aiEnrichmentInterruptReason || "aborted";
  throw new DOMException(String(reason), "AbortError");
}

function findEnrichmentSuggestionForItem(item, index, suggestions, usedSuggestionIndexes) {
  const normalizedItemUrl = normalizeEnrichmentUrl(item.url);
  const itemTitle = String(item.title || "").trim().toLowerCase();

  for (const [suggestionIndex, suggestion] of suggestions.entries()) {
    if (usedSuggestionIndexes.has(suggestionIndex)) {
      continue;
    }

    if (Number.isInteger(suggestion.inputIndex) && suggestion.inputIndex === index) {
      usedSuggestionIndexes.add(suggestionIndex);
      return suggestion;
    }

    if (normalizedItemUrl && suggestion.normalizedUrl === normalizedItemUrl) {
      usedSuggestionIndexes.add(suggestionIndex);
      return suggestion;
    }

    if (itemTitle && suggestion.title === itemTitle) {
      usedSuggestionIndexes.add(suggestionIndex);
      return suggestion;
    }
  }

  return null;
}

function normalizeEnrichmentSuggestions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const parsedInputIndex = Number.parseInt(String(entry?.inputIndex ?? ""), 10);
      const inputIndex = Number.isFinite(parsedInputIndex) ? parsedInputIndex : null;
      const url = typeof entry?.url === "string" ? entry.url.trim() : "";
      const title = typeof entry?.title === "string" ? entry.title.trim().toLowerCase() : "";

      return {
        inputIndex,
        url,
        normalizedUrl: normalizeEnrichmentUrl(url),
        title,
        category: cleanCategoryName(entry?.category),
        tags: normalizeStringList(entry?.tags),
        description: typeof entry?.description === "string" ? entry.description.trim() : "",
        summary: typeof entry?.summary === "string" ? entry.summary.trim() : ""
      };
    })
    .filter((entry) => entry.inputIndex !== null || entry.normalizedUrl || entry.title);
}

function normalizeEnrichmentUrl(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    parsed.hash = "";

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }

    return parsed.toString();
  } catch (_error) {
    return String(url || "").trim();
  }
}

function cleanCategoryName(value) {
  return String(value || "").trim() || "Unsorted";
}

function buildEnrichmentPrompt(sessionTitle, items) {
  const list = items
    .map((item, index) => `[${index}] ${item.title || "Untitled"} | ${item.url}`)
    .join("\n");

  return `You are categorizing browser bookmarks from a session called "${sessionTitle}".
For each bookmark, return one JSON object in the same order as the input list.
Reuse the same category label across related bookmarks whenever reasonable.
Do not create a brand-new category for every bookmark unless they are genuinely unrelated.
For every object:
- include "inputIndex" with the exact numeric index from the list
- include "url" with the exact URL string from the list
- include "title" with the bookmark title from the list
- suggest a specific "category" (2-3 words max)
- suggest 2-4 short "tags" relevant to what the page is actually for
- include "description" as one concise sentence explaining why the bookmark is worth keeping
- include "summary" as one short summary sentence, or an empty string if confidence is low

Bookmarks:
${list}`;
}

async function retryAiEnrichment(sessionId) {
  if (!sessionId) throw new Error("Session ID required");
  const queue = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
  const normalizedSessionId = String(sessionId);
  if (!queue.some((id) => String(id) === normalizedSessionId)) {
    await extensionApi.storage.local.set({
      [AI_ENRICHMENT_QUEUE_KEY]: [...queue, sessionId]
    });
    const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
    markEnrichmentStatus(savedSessions, sessionId, "pending");
    await extensionApi.storage.local.set({ [SAVED_SESSIONS_KEY]: savedSessions });
  }
  await resumeAiEnrichmentQueue();
  return { queued: true };
}

async function pauseAiEnrichmentQueue() {
  const queue = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
  aiEnrichmentInterruptReason = "paused";
  aiEnrichmentCurrentController?.abort("paused");
  await extensionApi.storage.local.set({
    [AI_ENRICHMENT_CONTROL_KEY]: { paused: true }
  });

  if (queue.length) {
    await updateEnrichmentStatuses(queue, "paused", ["pending", "paused"]);
  }

  return {
    paused: true,
    queuedCount: queue.length
  };
}

async function resumeAiEnrichmentQueue() {
  const queue = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
  await extensionApi.storage.local.set({
    [AI_ENRICHMENT_CONTROL_KEY]: { paused: false }
  });

  if (queue.length) {
    await updateEnrichmentStatuses(queue, "pending", ["paused"]);
  }

  if (aiEnrichmentDrainPromise) {
    await aiEnrichmentDrainPromise.catch(() => {});
  }

  return drainAiEnrichmentQueue();
}

async function stopAiEnrichmentQueue() {
  const queue = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
  aiEnrichmentInterruptReason = "stopped";
  aiEnrichmentCurrentController?.abort("stopped");

  await extensionApi.storage.local.set({
    [AI_ENRICHMENT_QUEUE_KEY]: [],
    [AI_ENRICHMENT_CONTROL_KEY]: { paused: false }
  });

  if (queue.length) {
    await updateEnrichmentStatuses(queue, "stopped", ["pending", "paused"]);
  }

  return {
    stopped: true,
    clearedCount: queue.length
  };
}

async function updateEnrichmentStatuses(sessionIds, status, allowedCurrentStatuses = null) {
  const allowedSet = Array.isArray(allowedCurrentStatuses)
    ? new Set(allowedCurrentStatuses.map(String))
    : null;
  const idSet = new Set((sessionIds || []).map((id) => String(id)));
  if (!idSet.size) {
    return false;
  }

  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  let changed = false;

  for (const session of savedSessions) {
    if (!idSet.has(String(session.id))) {
      continue;
    }
    if (allowedSet && !allowedSet.has(String(session.aiEnrichmentStatus || ""))) {
      continue;
    }
    if (session.aiEnrichmentStatus === status) {
      continue;
    }
    session.aiEnrichmentStatus = status;
    changed = true;
  }

  if (changed) {
    await extensionApi.storage.local.set({ [SAVED_SESSIONS_KEY]: savedSessions });
  }

  return changed;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

async function syncNow() {
  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const deviceId = await getDeviceId();

  // Push all local sessions to sync storage
  const localIds = savedSessions.map((s) => String(s.id));
  let pushed = 0;

  for (const session of savedSessions) {
    const key = SYNC_KEY_PREFIX + session.id;
    const allTags = [...new Set((session.items || []).flatMap((i) => i.tags || []))];
    const lightSession = {
      id: String(session.id),
      title: session.title,
      createdAt: session.createdAt,
      deviceId,
      categories: session.categories || [],
      tags: allTags,
      urls: (session.items || []).map((i) => i.url)
    };

    const serialized = JSON.stringify(lightSession);
    if (serialized.length > 8000) {
      // Trim URLs to fit — keep metadata intact
      lightSession.urls = lightSession.urls.slice(0, Math.floor(8000 / serialized.length * lightSession.urls.length));
    }

    await extensionApi.storage.sync.set({ [key]: lightSession });
    pushed++;
  }

  await extensionApi.storage.sync.set({ [SYNC_INDEX_KEY]: localIds });

  // Pull sessions from other devices
  const syncData = await extensionApi.storage.sync.get(null);
  const remoteKeys = Object.keys(syncData).filter(
    (k) => k.startsWith(SYNC_KEY_PREFIX)
  );
  let pulled = 0;

  for (const key of remoteKeys) {
    const remote = syncData[key];
    if (!remote || remote.deviceId === deviceId) continue;
    if (localIds.includes(String(remote.id))) continue;

    // Import lightweight remote session into local storage
    const remoteSession = {
      id: remote.id,
      title: remote.title,
      createdAt: remote.createdAt,
      tabCount: remote.urls.length,
      categoryCount: remote.categories.length,
      bookmarkIds: [],
      categories: remote.categories,
      categoryMeta: remote.categories.map((name) => ({ name, description: "", tags: [] })),
      items: remote.urls.map((url) => ({
        title: url,
        url,
        hostname: safeHostname(url),
        category: remote.categories[0] || "Synced",
        tags: [],
        description: "",
        summary: "",
        capturedAt: remote.createdAt,
        archivedAt: new Date().toISOString()
      })),
      aiEnrichmentStatus: "done",
      syncedFrom: remote.deviceId
    };

    savedSessions.unshift(remoteSession);
    pulled++;
  }

  if (pulled > 0) {
    await extensionApi.storage.local.set({ [SAVED_SESSIONS_KEY]: savedSessions });
  }

  return { pushed, pulled };
}

const ENRICHMENT_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    required: ["inputIndex", "url", "title", "category", "tags", "description", "summary"],
    properties: {
      inputIndex: { type: "NUMBER" },
      url: { type: "STRING" },
      title: { type: "STRING" },
      category: { type: "STRING" },
      tags: { type: "ARRAY", items: { type: "STRING" } },
      description: { type: "STRING" },
      summary: { type: "STRING" }
    }
  }
};

async function callGeminiApi(prompt, apiKey, model, requestController = null) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = requestController || new AbortController();
  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort("timeout");
    }
  }, AI_ENRICHMENT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: ENRICHMENT_RESPONSE_SCHEMA
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error("Gemini returned an unexpected response for enrichment.");
    }
    const text = parts.map((p) => p.text || "").join("").trim() || "[]";
    try {
      return JSON.parse(text);
    } catch (_e) {
      throw new Error("Gemini returned non-JSON output for enrichment.");
    }
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason === "timeout") {
      throw new Error("Gemini enrichment timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getAiEnrichmentControl() {
  const stored = await extensionApi.storage.local.get(AI_ENRICHMENT_CONTROL_KEY);
  const value = stored[AI_ENRICHMENT_CONTROL_KEY];
  return {
    paused: Boolean(value?.paused)
  };
}

// ── Workspace v2: Project Architect ───────────────────────

const WORKSPACE_AI_TIMEOUT_MS = 120000;

const WORKSPACE_STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "about", "want",
  "interested", "learning", "using", "use", "how", "what", "which", "some",
  "more", "into", "also", "just", "like", "need", "can", "will", "has",
  "have", "are", "its", "all", "any", "but", "not", "out", "get"
]);

const WORKSPACE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  required: ["project_name", "focus_area", "sources_used", "blueprint", "glossary", "checklist"],
  properties: {
    project_name: { type: "STRING" },
    focus_area: { type: "STRING" },
    sources_used: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["title", "url", "key_insight"],
        properties: {
          title: { type: "STRING" },
          url: { type: "STRING" },
          key_insight: { type: "STRING" }
        }
      }
    },
    blueprint: { type: "ARRAY", items: { type: "STRING" } },
    glossary: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["term", "definition"],
        properties: {
          term: { type: "STRING" },
          definition: { type: "STRING" }
        }
      }
    },
    checklist: { type: "ARRAY", items: { type: "STRING" } }
  }
};

// URLs the workspace can't analyse today — hidden from search results entirely.
// Reasons: YouTube requires video understanding (unreliable), social media requires auth,
// local files can't be reached by Gemini, streaming services are DRM-locked.
const WORKSPACE_SEARCH_EXCLUDE_PATTERNS = [
  { pattern: /^https?:\/\/(www\.)?youtube\.com/i, category: "youtube" },
  { pattern: /^https?:\/\/youtu\.be\//i,          category: "youtube" },
  { pattern: /^https?:\/\/(www\.)?twitter\.com/i, category: "social" },
  { pattern: /^https?:\/\/(www\.)?x\.com/i,        category: "social" },
  { pattern: /^https?:\/\/(www\.)?facebook\.com/i, category: "social" },
  { pattern: /^https?:\/\/(www\.)?instagram\.com/i, category: "social" },
  { pattern: /^https?:\/\/(www\.)?linkedin\.com/i, category: "social" },
  { pattern: /^https?:\/\/(www\.)?reddit\.com/i,   category: "social" },
  { pattern: /^https?:\/\/(www\.)?tiktok\.com/i,   category: "social" },
  { pattern: /^https?:\/\/(www\.)?netflix\.com/i,  category: "streaming" },
  { pattern: /^https?:\/\/(www\.)?spotify\.com/i,  category: "streaming" },
  { pattern: /^file:\/\//i,                        category: "local" },
  { pattern: /^https?:\/\/localhost/i,             category: "local" },
  { pattern: /^chrome(-extension)?:\/\//i,         category: "local" }
];

function classifyWorkspaceExclusion(url) {
  for (const { pattern, category } of WORKSPACE_SEARCH_EXCLUDE_PATTERNS) {
    if (pattern.test(url)) return category;
  }
  return null;
}

async function workspaceSearchLibrary({ topic }) {
  if (!topic || typeof topic !== "string" || !topic.trim()) {
    throw new Error("Topic is required.");
  }

  const stored = await extensionApi.storage.local.get(SAVED_SESSIONS_KEY);
  const savedSessions = stored[SAVED_SESSIONS_KEY] || [];

  const keywords = topic.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !WORKSPACE_STOP_WORDS.has(w));

  if (!keywords.length) {
    return { items: [], keywords: [], excludedCounts: {} };
  }

  const scored = [];
  const excludedCounts = { youtube: 0, social: 0, streaming: 0, local: 0 };

  for (const session of savedSessions) {
    for (const item of (session.items || [])) {
      let score = 0;
      const category = (item.category || "").toLowerCase();
      const tags = (item.tags || []).map((t) => t.toLowerCase());
      const title = (item.title || "").toLowerCase();
      const description = (item.description || "").toLowerCase();
      const summary = (item.summary || "").toLowerCase();

      for (const kw of keywords) {
        if (category.includes(kw)) score += 5;
        for (const tag of tags) {
          if (tag.includes(kw)) score += 3;
        }
        if (title.includes(kw)) score += 2;
        if (description.includes(kw) || summary.includes(kw)) score += 1;
      }

      if (score > 0) {
        // Filter out URL types we can't analyse yet, but tally them so we can inform the user
        const exclusion = classifyWorkspaceExclusion(item.url);
        if (exclusion) {
          excludedCounts[exclusion] = (excludedCounts[exclusion] || 0) + 1;
          continue;
        }
        scored.push({
          url: item.url,
          title: item.title || "Untitled",
          hostname: item.hostname || "",
          category: item.category || "",
          tags: item.tags || [],
          description: item.description || "",
          summary: item.summary || "",
          score,
          sessionTitle: session.title || ""
        });
      }
    }
  }

  const seen = new Map();
  for (const item of scored) {
    const existing = seen.get(item.url);
    if (!existing || item.score > existing.score) {
      seen.set(item.url, item);
    }
  }

  const items = [...seen.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return { items, keywords, excludedCounts };
}

const WORKSPACE_YOUTUBE_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch/i,
  /^https?:\/\/youtu\.be\//i,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\//i
];

const WORKSPACE_UNFETCHABLE_PATTERNS = [
  /^https?:\/\/(www\.)?netflix\.com/i,
  /^https?:\/\/(www\.)?spotify\.com/i,
  /^https?:\/\/(www\.)?twitter\.com/i,
  /^https?:\/\/(www\.)?x\.com/i,
  /^https?:\/\/(www\.)?facebook\.com/i,
  /^https?:\/\/(www\.)?instagram\.com/i,
  /^https?:\/\/localhost/i,
  /^chrome(-extension)?:\/\//i,
  /^file:\/\//i
];

function isYoutubeUrl(url) {
  return WORKSPACE_YOUTUBE_PATTERNS.some((re) => re.test(url));
}

function isUnfetchableUrl(url) {
  return WORKSPACE_UNFETCHABLE_PATTERNS.some((re) => re.test(url));
}

function classifyUnfetchable(url) {
  if (/^file:\/\//i.test(url)) return "local file on your disk (Gemini's servers can't reach it — upload to a public host)";
  if (/^https?:\/\/localhost/i.test(url)) return "localhost (only reachable from your machine)";
  if (/^chrome(-extension)?:\/\//i.test(url)) return "browser-internal URL";
  if (/netflix\.com/i.test(url)) return "Netflix (DRM-protected streaming)";
  if (/spotify\.com/i.test(url)) return "Spotify (DRM-protected)";
  if (/(twitter|x)\.com/i.test(url)) return "Twitter/X (requires login, JS-rendered)";
  if (/facebook\.com/i.test(url)) return "Facebook (requires login)";
  if (/instagram\.com/i.test(url)) return "Instagram (requires login)";
  return "unsupported URL type";
}

function normalizeYoutubeUrl(url) {
  const id = extractYoutubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

function extractYoutubeVideoId(url) {
  const shortMatch = url.match(/youtu\.be\/([\w-]{6,})/i);
  if (shortMatch) return shortMatch[1];
  const shortsMatch = url.match(/youtube\.com\/shorts\/([\w-]{6,})/i);
  if (shortsMatch) return shortsMatch[1];
  const vMatch = url.match(/[?&]v=([\w-]{6,})/i);
  if (vMatch) return vMatch[1];
  return null;
}

// ── YouTube transcript extraction ──
// Primary: Innertube /player endpoint. Fallback: HTML scrape of ytInitialPlayerResponse.

async function getYoutubeTranscript(videoId, preferLang = "en") {
  // Try Innertube WEB client first
  try {
    const player = await fetchInnertubePlayer(videoId, "WEB");
    return await pickAndFetchTrack(player, preferLang);
  } catch (err) {
    console.warn("Innertube WEB failed, trying ANDROID", err?.message);
  }
  // Try Innertube ANDROID client (bypasses some restrictions)
  try {
    const player = await fetchInnertubePlayer(videoId, "ANDROID");
    return await pickAndFetchTrack(player, preferLang);
  } catch (err) {
    console.warn("Innertube ANDROID failed, trying HTML scrape", err?.message);
  }
  // Fallback: HTML scrape
  return await getTranscriptViaHTML(videoId, preferLang);
}

async function fetchInnertubePlayer(videoId, client = "WEB") {
  const clients = {
    WEB: { clientName: "WEB", clientVersion: "2.20250530.01.00" },
    ANDROID: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30 }
  };
  const res = await fetch(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({
        context: { client: clients[client] },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true
      })
    }
  );
  if (!res.ok) throw new Error(`innertube ${res.status}`);
  return await res.json();
}

async function getTranscriptViaHTML(videoId, preferLang = "en") {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    credentials: "omit",
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    }
  });
  if (!res.ok) throw new Error(`YT HTML ${res.status}`);
  const html = await res.text();

  const marker = "ytInitialPlayerResponse = ";
  const start = html.indexOf(marker);
  if (start === -1) throw new Error("ytInitialPlayerResponse not found");
  const jsonStart = start + marker.length;
  let depth = 0, i = jsonStart, inStr = false, esc = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
    }
  }
  const player = JSON.parse(html.slice(jsonStart, i));
  return await pickAndFetchTrack(player, preferLang);
}

async function pickAndFetchTrack(player, preferLang = "en") {
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) throw new Error("NO_CAPTIONS");

  // Priority: manual in preferred lang > manual any > asr in preferred lang > asr any
  const score = (t) =>
    (t.kind !== "asr" ? 10 : 0) + (t.languageCode === preferLang ? 5 : 0);
  const track = [...tracks].sort((a, b) => score(b) - score(a))[0];

  const url = new URL(track.baseUrl);
  url.searchParams.set("fmt", "json3");
  const r = await fetch(url.toString(), { credentials: "omit" });
  if (!r.ok) throw new Error(`timedtext ${r.status}`);

  const text = await r.text();
  if (!text.trim()) throw new Error("EMPTY_TRANSCRIPT");
  const data = JSON.parse(text);

  const segments = (data.events || [])
    .filter((e) => e.segs)
    .map((e) => e.segs.map((s) => s.utf8 || "").join("").replace(/\n/g, " "))
    .filter((t) => t.trim());

  const plainText = segments.join(" ").replace(/\s+/g, " ").trim();
  if (!plainText) throw new Error("EMPTY_TRANSCRIPT");

  return {
    languageCode: track.languageCode,
    kind: track.kind === "asr" ? "auto" : "manual",
    plainText
  };
}

async function workspaceGenerateProject({ topic, items, customPrompt }) {
  if (!topic || !items?.length) {
    throw new Error("Topic and items are required.");
  }

  const settings = await extensionApi.storage.local.get(SETTINGS_KEY);
  const apiKey = settings[SETTINGS_KEY]?.geminiApiKey;
  const model = settings[SETTINGS_KEY]?.geminiModel || "gemini-2.5-flash";

  if (!apiKey) {
    throw new Error("Gemini API key is not set. Add it in Settings.");
  }

  // Defense-in-depth: search already filters these out, but re-check here in case old
  // selections or direct-API callers slip through.
  const webItems = items.filter((item) => !classifyWorkspaceExclusion(item.url));

  if (!webItems.length) {
    throw new Error("No supported sources selected. Select at least one article or documentation URL.");
  }

  const sourceList = webItems
    .map((item, i) => `[${i + 1}] ${item.title} — ${item.url}`)
    .join("\n");

  const prompt = `You are a Senior Project Architect. The user is working on a project about "${topic}" and has provided the following web sources to analyse.

=== SOURCES ===
${sourceList}

=== YOUR TASK ===
Fetch and read the content of these URLs via your URL tool. Produce a project kit containing:
- A project name
- A blueprint (8-12 sequential, specific execution steps)
- A glossary (5-10 critical technical terms from the sources)
- A checklist (8-15 imperative "Definition of Done" tasks)
- Sources used (one key insight per source you successfully read)

Base everything on what the sources actually contain. Skip any source you cannot retrieve.`;

  // JSON format instruction goes LAST so it's the most recent thing the model sees before generating.
  const jsonFormatBlock = `

=== OUTPUT FORMAT (CRITICAL) ===
Your ENTIRE response must be a single valid JSON object. Nothing else.
- NO prose, NO preamble, NO explanation, NO markdown headers.
- NO code fences (no \`\`\`json or \`\`\`).
- Begin your response with the character \`{\` and end with \`}\`.
- The response must be directly parseable by JSON.parse().

Exact schema:
{
  "project_name": "Concise project name (max 6 words)",
  "focus_area": "${topic}",
  "blueprint": ["Step 1 text", "Step 2 text"],
  "glossary": [{ "term": "Term name", "definition": "1-2 sentence definition grounded in the sources." }],
  "checklist": ["Imperative task phrase", "Another imperative task"],
  "sources_used": [{ "title": "Page title", "url": "https://...", "key_insight": "1-2 sentence insight from this source." }]
}

Output the JSON object now:`;

  const basePrompt = (customPrompt && customPrompt.trim()) ? customPrompt.trim() : prompt;
  const finalPrompt = basePrompt + jsonFormatBlock;

  try {
    return await callWorkspaceApi([{ text: finalPrompt }], apiKey, model, {
      useUrlContext: true
    });
  } catch (err) {
    const msg = String(err?.message || "");
    const lastProse = globalThis.__lastWorkspaceRawOutput || "";
    if (/non-JSON|malformed JSON/i.test(msg) && lastProse.length > 200) {
      console.warn("[Workspace] First call returned prose, attempting format-fix pass...");
      return await reformatProseAsProjectJson(lastProse, topic, apiKey, model);
    }
    throw err;
  }
}

// Fallback: take prose output from a failed JSON call and re-run it through Gemini
// with structured-output mode (no tools → responseMimeType: application/json works).
async function reformatProseAsProjectJson(proseText, topic, apiKey, model) {
  const prompt = `You will be given a research report written as prose. Extract its content into the exact JSON schema below. Do not invent content — only reformat what the report already says. If a field is missing from the report, make a reasonable best-effort entry based on the prose.

REPORT:
${proseText}

Focus area: "${topic}"`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: WORKSPACE_RESPONSE_SCHEMA,
        maxOutputTokens: 8192
      }
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Format-fix call failed: ${res.status}: ${errorText.slice(0, 200)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const raw = parts?.map((p) => p.text || "").join("").trim() || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Format-fix returned non-JSON. Try again with fewer sources.");
  }
}

function extractJsonObject(raw) {
  if (!raw) return null;
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  // Find the first '{' and walk to the matching '}' with proper string/escape handling
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return cleaned.slice(start, i + 1);
      }
    }
  }
  // Unmatched — likely truncated. Return what we have so JSON.parse can surface the real issue.
  return null;
}

async function callWorkspaceApi(parts, apiKey, model, options = {}, attempt = 1) {
  const { useUrlContext = true, returnText = false } = options;
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), WORKSPACE_AI_TIMEOUT_MS);

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: returnText ? 2048 : 8192
    }
  };
  if (useUrlContext) {
    body.tools = [{ urlContext: {} }];
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      const isRetryable = response.status === 500 || response.status === 503;
      if (isRetryable && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        return callWorkspaceApi(parts, apiKey, model, options, attempt + 1);
      }
      throw new Error(`Gemini API ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = await response.json();
    const responseParts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(responseParts) || responseParts.length === 0) {
      throw new Error("Gemini returned an unexpected response for workspace generation.");
    }
    const raw = responseParts.map((p) => p.text || "").join("").trim();
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (returnText) {
      return raw;
    }
    const extracted = extractJsonObject(raw);
    if (!extracted) {
      console.error("Gemini returned non-JSON output. finishReason:", finishReason, "\nRaw output:\n", raw.slice(0, 2000));
      // Stash prose so the format-fix fallback can reformat it
      globalThis.__lastWorkspaceRawOutput = raw;
      const hint = finishReason === "MAX_TOKENS"
        ? " Output was truncated (hit token limit). Try fewer or shorter sources."
        : "";
      throw new Error(`Gemini returned non-JSON output for workspace generation.${hint}`);
    }
    // Clear the stash on success
    globalThis.__lastWorkspaceRawOutput = "";
    try {
      return JSON.parse(extracted);
    } catch (_e) {
      console.error("JSON parse failed. Extracted text:\n", extracted.slice(0, 2000));
      throw new Error("Gemini returned malformed JSON for workspace generation.");
    }
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason === "timeout") {
      throw new Error("Workspace generation timed out. The URL fetching may have taken too long. Try fewer sources.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

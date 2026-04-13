const extensionApi = globalThis.browser ?? chrome;

const ROOT_FOLDER_TITLE = "Browsing Library";
const BOOKMARK_METADATA_KEY = "bookmarkMetadata";
const SAVED_SESSIONS_KEY = "savedSessions";
const AI_ENRICHMENT_QUEUE_KEY = "aiEnrichmentQueue";
const SYNC_KEY_PREFIX = "sync:session:";
const SYNC_INDEX_KEY = "sync:index";
const DEVICE_ID_KEY = "deviceId";
const SETTINGS_KEY = "tabLedgerSettings";
const DEFAULT_SETTINGS = {
  dedupeWithinSession: false,
  dedupeAcrossSessions: false
};

// Resume any AI enrichment that was interrupted by browser restart
extensionApi.runtime.onStartup.addListener(() => {
  drainAiEnrichmentQueue();
});

extensionApi.runtime.onInstalled.addListener(() => {
  drainAiEnrichmentQueue();
});

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "open-dashboard") {
    openDashboard(message.scope)
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

async function openDashboard(scope) {
  const targetUrl = new URL(extensionApi.runtime.getURL("dashboard.html"));
  if (scope) {
    targetUrl.searchParams.set("capture", scope);
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

  item.category = nextCategory;
  item.tags = tags;
  item.description = description;
  item.summary = summary;
  item.bookmarkFolderId = nextFolderId;

  const metadataEntry = getArchiveMetadataEntry(metadataStore, sessionId, bookmarkId, itemUrl, itemTitle);
  if (metadataEntry) {
    metadataEntry.category = nextCategory;
    metadataEntry.tags = tags;
    metadataEntry.description = description;
    metadataEntry.summary = summary;
    metadataEntry.bookmarkFolderId = nextFolderId;
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
    categoryName: item.category
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

function getUniqueUrls(urls) {
  if (!Array.isArray(urls)) {
    return [];
  }

  const seen = new Set();
  const uniqueUrls = [];

  for (const url of urls) {
    const normalized = String(url || "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    uniqueUrls.push(normalized);
  }

  return uniqueUrls;
}

function buildArchiveItemsForSave(items, savedSessions, metadataStore, settings) {
  const duplicateCounts = {
    withinSession: 0,
    acrossSessions: 0
  };
  const seenInSession = new Set();
  const existingLibraryUrls = settings.dedupeAcrossSessions
    ? buildExistingLibraryUrlSet(savedSessions, metadataStore)
    : new Set();
  const filteredItems = [];

  for (const item of items) {
    const normalizedUrl = normalizeArchiveUrl(item.url);
    if (!normalizedUrl) {
      continue;
    }

    if (settings.dedupeWithinSession && seenInSession.has(normalizedUrl)) {
      duplicateCounts.withinSession += 1;
      continue;
    }

    seenInSession.add(normalizedUrl);

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

function normalizeArchiveUrl(url) {
  return String(url || "").trim();
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
          description: "",
          summary: "",
          tags: []
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
          description: "",
          summary: "",
          tags: []
        });

        createdBookmarkIds.push(bookmarkNode.id);
      }
    }

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
      aiEnrichmentStatus: useAi ? "pending" : "done"
    };

    savedSessions.unshift(sessionRecord);
    newSessionIds.push(sessionFolder.id);
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
    drainAiEnrichmentQueue();
  }

  return {
    importedCount: sessions.length,
    totalBookmarks: sessions.reduce((sum, s) => sum + s.items.length, 0)
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
          tags: []
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
          tags: []
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
  const queue = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
  if (!queue.length) return;

  const settings = await extensionApi.storage.local.get(SETTINGS_KEY);
  const apiKey = settings[SETTINGS_KEY]?.geminiApiKey;
  const model = settings[SETTINGS_KEY]?.geminiModel || "gemini-2.5-flash";

  for (const sessionId of queue) {
    await enrichSessionWithAi(sessionId, apiKey, model);

    // Remove processed ID from queue
    const remaining = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
    await extensionApi.storage.local.set({
      [AI_ENRICHMENT_QUEUE_KEY]: remaining.filter((id) => id !== sessionId)
    });
  }
}

async function enrichSessionWithAi(sessionId, apiKey, model) {
  const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
  const session = savedSessions.find((s) => String(s.id) === String(sessionId));
  if (!session) return;

  if (!apiKey) {
    markEnrichmentStatus(savedSessions, sessionId, "failed");
    await extensionApi.storage.local.set({ [SAVED_SESSIONS_KEY]: savedSessions });
    return;
  }

  try {
    const items = session.items || [];
    const prompt = buildEnrichmentPrompt(session.title, items);
    const suggestions = await callGeminiApi(prompt, apiKey, model);

    const metadataStore = await getStoredObject(BOOKMARK_METADATA_KEY);

    for (const item of items) {
      const suggestion = suggestions.find((s) => s.url === item.url);
      if (!suggestion) continue;
      if (suggestion.category) item.category = suggestion.category;
      if (Array.isArray(suggestion.tags)) item.tags = suggestion.tags;

      const meta = metadataStore[item.bookmarkId];
      if (meta) {
        if (suggestion.category) meta.category = suggestion.category;
        if (Array.isArray(suggestion.tags)) meta.tags = suggestion.tags;
      }
    }

    session.categories = [...new Set(items.map((i) => i.category))].sort();
    session.categoryCount = session.categories.length;
    session.categoryMeta = session.categories.map((name) => ({ name, description: "", tags: [] }));
    markEnrichmentStatus(savedSessions, sessionId, "done");

    await extensionApi.storage.local.set({
      [SAVED_SESSIONS_KEY]: savedSessions,
      [BOOKMARK_METADATA_KEY]: metadataStore
    });
  } catch (err) {
    console.error("AI enrichment failed for session", sessionId, err);
    markEnrichmentStatus(savedSessions, sessionId, "failed");
    await extensionApi.storage.local.set({ [SAVED_SESSIONS_KEY]: savedSessions });
  }
}

function markEnrichmentStatus(sessions, sessionId, status) {
  const session = sessions.find((s) => String(s.id) === String(sessionId));
  if (session) session.aiEnrichmentStatus = status;
}

function buildEnrichmentPrompt(sessionTitle, items) {
  const list = items.map((i) => `- ${i.title}: ${i.url}`).join("\n");
  return `You are categorizing browser bookmarks from a session called "${sessionTitle}".
For each bookmark, suggest a specific category (2-3 words max) and 2-4 short tags relevant to what the page is actually for.

Bookmarks:
${list}`;
}

async function retryAiEnrichment(sessionId) {
  if (!sessionId) throw new Error("Session ID required");
  const queue = await getStoredArray(AI_ENRICHMENT_QUEUE_KEY);
  if (!queue.includes(sessionId)) {
    await extensionApi.storage.local.set({
      [AI_ENRICHMENT_QUEUE_KEY]: [...queue, sessionId]
    });
    const savedSessions = await getStoredArray(SAVED_SESSIONS_KEY);
    markEnrichmentStatus(savedSessions, sessionId, "pending");
    await extensionApi.storage.local.set({ [SAVED_SESSIONS_KEY]: savedSessions });
  }
  drainAiEnrichmentQueue();
  return { queued: true };
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
    required: ["url", "category", "tags"],
    properties: {
      url: { type: "STRING" },
      category: { type: "STRING" },
      tags: { type: "ARRAY", items: { type: "STRING" } }
    }
  }
};

async function callGeminiApi(prompt, apiKey, model) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
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
}

// tests/test_dedup.js
// Run with: node tests/test_dedup.js

// ---- Functions under test (keep in sync with background.js) ----

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "_ga", "_gid", "ref", "mc_cid", "mc_eid"
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

  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key)) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.searchParams.sort();

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  const query = parsed.search;

  return `${host}${path}${query}`;
}

// ---- Test runner ----

let passed = 0;
let failed = 0;

function assertEqual(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ---- normalizeArchiveUrl tests ----

console.log("\nnormalizeArchiveUrl:");

assertEqual(
  "empty string → empty string",
  normalizeArchiveUrl(""),
  ""
);
assertEqual(
  "null → empty string",
  normalizeArchiveUrl(null),
  ""
);
assertEqual(
  "strips https:// protocol",
  normalizeArchiveUrl("https://example.com/page"),
  "example.com/page"
);
assertEqual(
  "strips http:// protocol",
  normalizeArchiveUrl("http://example.com/page"),
  "example.com/page"
);
assertEqual(
  "http and https normalize to same key",
  normalizeArchiveUrl("http://example.com/page"),
  normalizeArchiveUrl("https://example.com/page")
);
assertEqual(
  "strips www. prefix",
  normalizeArchiveUrl("https://www.example.com/page"),
  "example.com/page"
);
assertEqual(
  "www and non-www normalize to same key",
  normalizeArchiveUrl("https://www.example.com/page"),
  normalizeArchiveUrl("https://example.com/page")
);
assertEqual(
  "strips URL fragment",
  normalizeArchiveUrl("https://example.com/page#section"),
  "example.com/page"
);
assertEqual(
  "strips trailing slash on root",
  normalizeArchiveUrl("https://example.com/"),
  "example.com"
);
assertEqual(
  "trailing slash on root and no slash normalize to same key",
  normalizeArchiveUrl("https://example.com/"),
  normalizeArchiveUrl("https://example.com")
);
assertEqual(
  "strips trailing slash on deep path",
  normalizeArchiveUrl("https://example.com/path/to/page/"),
  "example.com/path/to/page"
);
assertEqual(
  "strips utm_source",
  normalizeArchiveUrl("https://example.com/page?utm_source=newsletter"),
  "example.com/page"
);
assertEqual(
  "strips utm_medium, utm_campaign",
  normalizeArchiveUrl("https://example.com/page?utm_medium=email&utm_campaign=launch"),
  "example.com/page"
);
assertEqual(
  "strips fbclid",
  normalizeArchiveUrl("https://example.com/page?fbclid=abc123"),
  "example.com/page"
);
assertEqual(
  "strips gclid",
  normalizeArchiveUrl("https://example.com/page?gclid=xyz789"),
  "example.com/page"
);
assertEqual(
  "strips _ga",
  normalizeArchiveUrl("https://example.com/page?_ga=2.12345.1.2"),
  "example.com/page"
);
assertEqual(
  "strips utm_term",
  normalizeArchiveUrl("https://example.com/page?utm_term=shoes"),
  "example.com/page"
);
assertEqual(
  "strips utm_content",
  normalizeArchiveUrl("https://example.com/page?utm_content=banner"),
  "example.com/page"
);
assertEqual(
  "strips _gid",
  normalizeArchiveUrl("https://example.com/page?_gid=GA1.2.3"),
  "example.com/page"
);
assertEqual(
  "strips ref",
  normalizeArchiveUrl("https://example.com/page?ref=homepage"),
  "example.com/page"
);
assertEqual(
  "strips mc_cid",
  normalizeArchiveUrl("https://example.com/page?mc_cid=abc"),
  "example.com/page"
);
assertEqual(
  "strips mc_eid",
  normalizeArchiveUrl("https://example.com/page?mc_eid=xyz"),
  "example.com/page"
);
assertEqual(
  "preserves non-tracking query params",
  normalizeArchiveUrl("https://example.com/search?q=hello"),
  "example.com/search?q=hello"
);
assertEqual(
  "strips tracking params but keeps content params",
  normalizeArchiveUrl("https://example.com/search?q=hello&utm_source=ads"),
  "example.com/search?q=hello"
);
assertEqual(
  "sorts remaining query params for consistent key",
  normalizeArchiveUrl("https://example.com/search?b=2&a=1"),
  normalizeArchiveUrl("https://example.com/search?a=1&b=2")
);
assertEqual(
  "lowercases hostname",
  normalizeArchiveUrl("https://EXAMPLE.COM/Page"),
  "example.com/Page"
);
assertEqual(
  "falls back gracefully for non-URL strings",
  normalizeArchiveUrl("not-a-url"),
  "not-a-url"
);
assertEqual(
  "URL with only tracking params normalizes same as bare root URL",
  normalizeArchiveUrl("https://example.com/?utm_source=ads"),
  "example.com"
);

// ---- getUniqueUrls (keep in sync with background.js) ----

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

// ---- getUniqueUrls tests ----

console.log("\ngetUniqueUrls:");

assertEqual(
  "non-array input → empty array",
  JSON.stringify(getUniqueUrls(null)),
  JSON.stringify([])
);
assertEqual(
  "empty array → empty array",
  JSON.stringify(getUniqueUrls([])),
  JSON.stringify([])
);
assertEqual(
  "unique URLs pass through unchanged",
  JSON.stringify(getUniqueUrls(["https://example.com/a", "https://example.com/b"])),
  JSON.stringify(["https://example.com/a", "https://example.com/b"])
);
assertEqual(
  "exact duplicate URL is removed",
  JSON.stringify(getUniqueUrls(["https://example.com/page", "https://example.com/page"])),
  JSON.stringify(["https://example.com/page"])
);
assertEqual(
  "http and https treated as same URL — keeps original URL not normalized",
  JSON.stringify(getUniqueUrls(["https://example.com/page", "http://example.com/page"])),
  JSON.stringify(["https://example.com/page"])
);
assertEqual(
  "www and non-www treated as same URL — keeps original URL",
  JSON.stringify(getUniqueUrls(["https://www.example.com/page", "https://example.com/page"])),
  JSON.stringify(["https://www.example.com/page"])
);
assertEqual(
  "tracking param URL treated as same as clean URL — keeps original URL",
  JSON.stringify(getUniqueUrls(["https://example.com/page?utm_source=ads", "https://example.com/page"])),
  JSON.stringify(["https://example.com/page?utm_source=ads"])
);
assertEqual(
  "output URLs are originals (not normalized keys)",
  getUniqueUrls(["https://example.com/page"])[0],
  "https://example.com/page"
);
assertEqual(
  "non-URL strings are case-folded for dedup",
  JSON.stringify(getUniqueUrls(["Not-A-URL", "not-a-url"])),
  JSON.stringify(["Not-A-URL"])
);

// ---- scoreItemEnrichment (keep in sync with background.js) ----

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

// ---- buildExistingLibraryUrlSet (keep in sync with background.js) ----

function buildExistingLibraryUrlSet(savedSessions, metadataStore) {
  const urls = new Set();
  for (const session of savedSessions || []) {
    for (const item of session.items || []) {
      const normalizedUrl = normalizeArchiveUrl(item?.url || item?.linkUrl);
      if (normalizedUrl) urls.add(normalizedUrl);
    }
  }
  for (const entry of Object.values(metadataStore || {})) {
    const normalizedUrl = normalizeArchiveUrl(entry?.url || entry?.linkUrl);
    if (normalizedUrl) urls.add(normalizedUrl);
  }
  return urls;
}

// ---- buildArchiveItemsForSave (keep in sync with background.js) ----

function buildArchiveItemsForSave(items, savedSessions, metadataStore, settings) {
  const duplicateCounts = { withinSession: 0, acrossSessions: 0 };
  const existingLibraryUrls = settings.dedupeAcrossSessions
    ? buildExistingLibraryUrlSet(savedSessions, metadataStore)
    : new Set();

  let workingItems = items;
  if (settings.dedupeWithinSession) {
    const bestByUrl = new Map();
    for (const item of items) {
      const normalizedUrl = normalizeArchiveUrl(item.url);
      if (!normalizedUrl) continue;
      const current = bestByUrl.get(normalizedUrl);
      if (!current || scoreItemEnrichment(item) > scoreItemEnrichment(current)) {
        bestByUrl.set(normalizedUrl, item);
      }
    }
    const seenUrls = new Set();
    const deduped = [];
    for (const item of items) {
      const normalizedUrl = normalizeArchiveUrl(item.url);
      if (!normalizedUrl) continue;
      if (seenUrls.has(normalizedUrl)) continue;
      seenUrls.add(normalizedUrl);
      deduped.push(bestByUrl.get(normalizedUrl));
    }
    const totalWithUrls = items.filter((i) => normalizeArchiveUrl(i.url)).length;
    duplicateCounts.withinSession = totalWithUrls - deduped.length;
    workingItems = deduped;
  }

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

  return { items: filteredItems, duplicateCounts };
}

// ---- scoreItemEnrichment tests ----

console.log("\nscoreItemEnrichment:");

const emptyItem = { url: "https://example.com", fieldSources: {} };
const heuristicItem = {
  url: "https://example.com",
  fieldSources: { category: "heuristic" }
};
const aiItem = {
  url: "https://example.com",
  fieldSources: { category: "ai", tags: "ai" }
};
const userItem = {
  url: "https://example.com",
  fieldSources: { category: "user", tags: "user", description: "user", summary: "user" }
};
const mixedItem = {
  url: "https://example.com",
  fieldSources: { category: "user", tags: "ai", description: "heuristic" }
};

assertEqual("empty fieldSources → score 0", scoreItemEnrichment(emptyItem), 0);
assertEqual("one heuristic field → score 1", scoreItemEnrichment(heuristicItem), 1);
assertEqual("two ai fields → score 4", scoreItemEnrichment(aiItem), 4);
assertEqual("four user fields → score 12", scoreItemEnrichment(userItem), 12);
assertEqual("mixed: user(3)+ai(2)+heuristic(1) → score 6", scoreItemEnrichment(mixedItem), 6);
assertEqual("null item → score 0", scoreItemEnrichment(null), 0);

// ---- buildArchiveItemsForSave tests ----

console.log("\nbuildArchiveItemsForSave:");

const noDedup = { dedupeWithinSession: false, dedupeAcrossSessions: false };
const withinOnly = { dedupeWithinSession: true, dedupeAcrossSessions: false };
const acrossOnly = { dedupeWithinSession: false, dedupeAcrossSessions: true };
const bothDedup = { dedupeWithinSession: true, dedupeAcrossSessions: true };

// No dedup — all items pass through
const allItems = [
  { url: "https://example.com/a", fieldSources: {} },
  { url: "https://example.com/a", fieldSources: {} },
];
{
  const { items, duplicateCounts } = buildArchiveItemsForSave(allItems, [], {}, noDedup);
  assertEqual("no dedup: keeps both duplicates", items.length, 2);
  assertEqual("no dedup: withinSession count is 0", duplicateCounts.withinSession, 0);
}

// Within-session dedup: keeps one item
{
  const { items, duplicateCounts } = buildArchiveItemsForSave(allItems, [], {}, withinOnly);
  assertEqual("within dedup: removes one duplicate", items.length, 1);
  assertEqual("within dedup: withinSession count is 1", duplicateCounts.withinSession, 1);
}

// Within-session dedup: keeps the BEST item (highest score), not first
const lowScoreFirst = { url: "https://example.com/page", fieldSources: {} }; // score 0
const highScoreSecond = {
  url: "https://example.com/page",
  fieldSources: { category: "user", tags: "ai" } // score 5
};
{
  const { items } = buildArchiveItemsForSave([lowScoreFirst, highScoreSecond], [], {}, withinOnly);
  assertEqual("within dedup: keeps higher-scored item even if it came second", items.length, 1);
  assertEqual("within dedup: kept item has user category", items[0].fieldSources.category, "user");
}

// Within-session dedup: http and https treated as same URL
const httpItem = { url: "http://example.com/page", fieldSources: {} };
const httpsItem = { url: "https://example.com/page", fieldSources: { category: "user" } };
{
  const { items, duplicateCounts } = buildArchiveItemsForSave([httpItem, httpsItem], [], {}, withinOnly);
  assertEqual("within dedup: http+https treated as same URL → 1 item", items.length, 1);
  assertEqual("within dedup: kept item has user category (was https)", items[0].fieldSources.category, "user");
  assertEqual("within dedup: withinSession count is 1", duplicateCounts.withinSession, 1);
}

// Within-session dedup: tracking param URLs treated as same URL
const withTracking = { url: "https://example.com/page?utm_source=ads", fieldSources: {} };
const withoutTracking = { url: "https://example.com/page", fieldSources: { description: "user" } };
{
  const { items, duplicateCounts } = buildArchiveItemsForSave([withTracking, withoutTracking], [], {}, withinOnly);
  assertEqual("within dedup: tracking param URL matches clean URL → 1 item", items.length, 1);
  assertEqual("within dedup: kept best item (has description)", items[0].fieldSources.description, "user");
  assertEqual("within dedup: withinSession count is 1", duplicateCounts.withinSession, 1);
}

// Across-sessions dedup: URL in library is skipped
const existingSessions = [
  { items: [{ url: "https://example.com/existing" }] }
];
const newItems = [
  { url: "https://example.com/existing", fieldSources: {} },
  { url: "https://example.com/new", fieldSources: {} },
];
{
  const { items, duplicateCounts } = buildArchiveItemsForSave(newItems, existingSessions, {}, acrossOnly);
  assertEqual("across dedup: existing library URL is skipped", items.length, 1);
  assertEqual("across dedup: acrossSessions count is 1", duplicateCounts.acrossSessions, 1);
  assertEqual("across dedup: kept item is the new URL", items[0].url, "https://example.com/new");
}

// Both: within removes duplicate, across removes library match
// Input: 2× existing (within-dup removes 1), 1× existing (across-dup removes remaining), 1× new (saved)
const mixedItems = [
  { url: "https://example.com/existing", fieldSources: { category: "ai" } },
  { url: "https://example.com/existing", fieldSources: {} },
  { url: "https://example.com/new", fieldSources: {} },
];
{
  const { items, duplicateCounts } = buildArchiveItemsForSave(
    mixedItems, existingSessions, {}, bothDedup
  );
  assertEqual("both: 1 within-dup + 1 across-dup + 1 new = 1 saved", items.length, 1);
  assertEqual("both: withinSession count is 1", duplicateCounts.withinSession, 1);
  assertEqual("both: acrossSessions count is 1", duplicateCounts.acrossSessions, 1);
  assertEqual("both: surviving item is the new unique URL", items[0].url, "https://example.com/new");
}

// ---- Summary ----

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

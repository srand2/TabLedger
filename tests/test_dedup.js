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

// ---- Summary ----

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

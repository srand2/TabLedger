const http = require("node:http");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "4317", 10);
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();

if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY. Export it before starting the sidecar.");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const requestUrl = new URL(req.url || "/", `http://${HOST}:${PORT}`);

    if (req.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "tabledger-ai-sidecar",
        model: GEMINI_MODEL
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/fill-tab") {
      const payload = await readJsonBody(req);
      const input = normalizeTabInput(payload);
      const aiResult = await generateTabDraft(input);
      sendJson(res, 200, aiResult);
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    const status = error && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    sendJson(res, status, {
      error: error instanceof Error ? error.message : "Unknown error."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TabLedger AI sidecar listening on http://${HOST}:${PORT}`);
  console.log(`Using Gemini model: ${GEMINI_MODEL}`);
});

process.on("SIGINT", () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0);
  });
});

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    throw makeHttpError(400, "Request body is required.");
  }

  try {
    return JSON.parse(rawBody);
  } catch (_error) {
    throw makeHttpError(400, "Request body must be valid JSON.");
  }
}

function normalizeTabInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw makeHttpError(400, "Body must be an object.");
  }

  const title = String(payload.title || "").trim();
  const url = String(payload.url || "").trim();
  const hostname = String(payload.hostname || "").trim();

  if (!url) {
    throw makeHttpError(400, "url is required.");
  }

  if (!hostname) {
    throw makeHttpError(400, "hostname is required.");
  }

  return {
    title,
    url,
    hostname
  };
}

async function generateTabDraft(input) {
  const prompt = [
    "You are filling a bookmark draft for a browser tab.",
    "Return JSON only with exactly these keys:",
    '- "category": a short category name',
    '- "tags": an array of 3 to 6 concise lowercase tags',
    '- "description": one concise sentence explaining why the tab is worth keeping',
    '- "summary": one short summary sentence, or an empty string if confidence is low',
    "Base your answer only on the title, URL, and hostname.",
    "Do not invent details that are not reasonably inferable.",
    "",
    `Title: ${input.title || "(empty)"}`,
    `URL: ${input.url}`,
    `Hostname: ${input.hostname}`
  ].join("\n");

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
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
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw makeHttpError(
      502,
      `Gemini request failed (${response.status}). ${errorText}`.trim()
    );
  }

  const data = await response.json();
  const text = extractGeminiText(data);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    throw makeHttpError(502, "Gemini returned invalid JSON.");
  }

  return normalizeGeminiOutput(parsed, input);
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw makeHttpError(502, "Gemini response did not include content parts.");
  }

  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw makeHttpError(502, "Gemini response was empty.");
  }

  return text;
}

function normalizeGeminiOutput(payload, input) {
  if (!payload || typeof payload !== "object") {
    throw makeHttpError(502, "Gemini output must be an object.");
  }

  const rawCategory = typeof payload.category === "string" ? payload.category.trim() : "";
  const rawDescription =
    typeof payload.description === "string" ? payload.description.trim() : "";
  const rawSummary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const rawTags = Array.isArray(payload.tags) ? payload.tags : null;

  if (!rawTags || !rawTags.every((tag) => typeof tag === "string")) {
    throw makeHttpError(502, "Gemini output tags must be an array of strings.");
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

function makeHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

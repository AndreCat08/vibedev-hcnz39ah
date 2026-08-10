import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { computeSplit, parseSplitInput } from "../shared/split.ts";

const PROD = process.argv.includes("--prod");
const PORT = Number(process.env["PORT"]) || 5173;
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const MAX_BODY = 8 * 1024;

// In dev, Vite runs in-process as middleware: one command, and the client hits
// the real API on the same origin, so there is no proxy config to drift.
const vite = PROD ? null : await (await import("vite")).createServer({ server: { middlewareMode: true }, appType: "spa" });

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
  "font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function head(res: ServerResponse, status: number, type: string) {
  // Vite's dev client needs inline scripts and a websocket; production does not.
  res.writeHead(status, {
    "content-type": type,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...(PROD ? { "content-security-policy": CSP } : {}),
  });
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  head(res, status, MIME[".json"]!);
  res.end(JSON.stringify(body));
};

/** Reads at most MAX_BODY bytes, stopping the moment the cap is passed rather
 *  than draining a body whose length an attacker chooses. */
const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      if ((size += c.length) > MAX_BODY) {
        req.pause();
        reject(new RangeError("too large"));
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

async function api(req: IncomingMessage, res: ServerResponse, path: string) {
  if (req.method === "GET" && path === "/api/health") return json(res, 200, { ok: true });

  if (req.method === "POST" && path === "/api/split") {
    if (!(req.headers["content-type"] ?? "").includes("application/json"))
      return json(res, 415, { error: "Expected content-type: application/json." });

    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      json(res, 413, { error: `Request body must be under ${MAX_BODY / 1024}KB.` });
      return void req.destroy();
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(res, 400, { error: "Body is not valid JSON." });
    }

    const input = parseSplitInput(body);
    // The client never gets to assert its own shares — the server recomputes
    // them from the same engine and that recomputation is the only answer sent back.
    return "error" in input ? json(res, 400, input) : json(res, 200, computeSplit(input));
  }

  json(res, 404, { error: "No such endpoint." });
}

async function serveStatic(path: string, res: ServerResponse) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return json(res, 400, { error: "Malformed URL." });
  }

  // normalize() collapses "..", and the prefix check re-confirms it: nothing
  // outside dist/ is servable.
  const file = join(DIST, normalize(decoded).replace(/^[/\\]+/, ""));
  if (!join(file, ".").startsWith(join(DIST, "."))) return json(res, 403, { error: "Forbidden." });

  const ext = extname(file);
  try {
    const body = await readFile(file);
    head(res, 200, MIME[ext] ?? "application/octet-stream");
    res.end(body);
  } catch {
    if (ext) return json(res, 404, { error: "Not found." });
    // Extensionless miss: hand back the SPA shell.
    head(res, 200, MIME[".html"]!);
    res.end(await readFile(join(DIST, "index.html")));
  }
}

createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const done = path.startsWith("/api/")
    ? api(req, res, path)
    : vite
      ? Promise.resolve(vite.middlewares(req, res))
      : serveStatic(path, res);

  done.catch((error: unknown) => {
    console.error(`${req.method} ${path} failed:`, error);
    if (res.headersSent) res.end();
    else json(res, 500, { error: "Something went wrong on our end." });
  });
}).listen(PORT, () => console.log(`SliceSplitter ${PROD ? "(prod)" : "(dev)"} → http://localhost:${PORT}`));

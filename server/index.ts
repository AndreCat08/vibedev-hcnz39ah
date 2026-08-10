import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { computeSplit, parseSplitInput } from "../shared/split.ts";

const PROD = process.argv.includes("--prod");
const PORT = Number(process.env["PORT"]) || 5173;
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const MAX_BODY = 8 * 1024;

// Dev runs Vite in-process as middleware: one command, same-origin API, no proxy to drift.
const vite = PROD ? null : await (await import("vite")).createServer({ server: { middlewareMode: true }, appType: "spa" });

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
  "font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function head(res: ServerResponse, status: number, type: string) {
  res.writeHead(status, {
    "content-type": type,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...(PROD ? { "content-security-policy": CSP } : {}), // dev's Vite client needs inline scripts + a websocket
  });
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  head(res, status, MIME[".json"]!);
  res.end(JSON.stringify(body));
};

/** Stops reading the instant MAX_BODY is passed, rather than draining a body an attacker sized. */
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

    // The server recomputes shares itself; the client never gets to assert its own money.
    const input = parseSplitInput(body);
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

  // normalize() collapses ".."; the prefix check re-confirms dist/ can't be escaped.
  const file = join(DIST, normalize(decoded).replace(/^[/\\]+/, ""));
  if (!join(file, ".").startsWith(join(DIST, "."))) return json(res, 403, { error: "Forbidden." });

  const ext = extname(file);
  try {
    const body = await readFile(file);
    head(res, 200, MIME[ext] ?? "application/octet-stream");
    res.end(body);
  } catch {
    if (ext) return json(res, 404, { error: "Not found." });
    head(res, 200, MIME[".html"]!); // extensionless miss: hand back the SPA shell
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

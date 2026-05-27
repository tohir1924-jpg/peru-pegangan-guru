const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 5174);
const dataDir = path.join(root, "data");
const stateFile = path.join(dataDir, "peru-state.json");
const maxBodySize = 5 * 1024 * 1024;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodySize) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readState() {
  if (!fs.existsSync(stateFile)) return null;
  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function writeState(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, app: "Peru Pegangan Guru" });
      return;
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      sendJson(res, 200, { ok: true, state: readState() });
      return;
    }

    if (url.pathname === "/api/state" && req.method === "PUT") {
      const body = await readBody(req);
      const parsed = JSON.parse(body || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        sendJson(res, 400, { ok: false, error: "Invalid state payload" });
        return;
      }
      writeState(parsed);
      sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() });
      return;
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { ok: false, error: "API endpoint not found" });
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, error: error.message || "Internal server error" });
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    let filePath = path.join(root, safePath);
    if (url.pathname === "/" || !path.extname(filePath)) filePath = path.join(root, "index.html");

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
      res.end(content);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Peru app running at http://127.0.0.1:${port}`);
    console.log(`Peru API available at http://127.0.0.1:${port}/api/state`);
  });

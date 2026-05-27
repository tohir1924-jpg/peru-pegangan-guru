const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 5174);
const dataDir = path.join(root, "data");
const stateFile = path.join(dataDir, "peru-state.json");
const teachersFile = path.join(dataDir, "pegu-teachers.json");
const statesDir = path.join(dataDir, "teacher-states");
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
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS"
  });
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

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function randomSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function hashPin(pin, salt) {
  return sha256(`${salt}:${pin}`);
}

function teacherStateFile(teacherId) {
  return path.join(statesDir, `${teacherId}.json`);
}

function authToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function readAuthStore() {
  return readJson(teachersFile, { teachers: [], sessions: [] });
}

function writeAuthStore(store) {
  writeJson(teachersFile, store);
}

function requireTeacher(req) {
  const token = authToken(req);
  if (!token) return null;
  const store = readAuthStore();
  const tokenHash = sha256(token);
  const session = store.sessions.find((item) => item.tokenHash === tokenHash);
  if (!session) return null;
  const teacher = store.teachers.find((item) => item.id === session.teacherId);
  if (!teacher) return null;
  session.lastSeenAt = new Date().toISOString();
  writeAuthStore(store);
  return teacher;
}

function readState(teacherId) {
  if (teacherId) return readJson(teacherStateFile(teacherId), null);
  return readJson(stateFile, null);
}

function writeState(teacherId, state) {
  writeJson(teacherId ? teacherStateFile(teacherId) : stateFile, state);
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, app: "Pegu Pegangan Guru", backend: "local-node" });
      return;
    }

    if (url.pathname === "/api/auth" && req.method === "GET") {
      const teacher = requireTeacher(req);
      if (!teacher) {
        sendJson(res, 401, { ok: false, error: "Sesi tidak valid." });
        return;
      }
      sendJson(res, 200, { ok: true, teacher: { id: teacher.id, teacherName: teacher.teacherName, schoolName: teacher.schoolName } });
      return;
    }

    if (url.pathname === "/api/auth" && req.method === "POST") {
      const payload = JSON.parse(await readBody(req) || "{}");
      const action = String(payload.action || "").trim();
      if (action === "logout") {
        const token = authToken(req);
        if (token) {
          const store = readAuthStore();
          store.sessions = store.sessions.filter((item) => item.tokenHash !== sha256(token));
          writeAuthStore(store);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      const teacherName = String(payload.teacherName || "").trim();
      const schoolName = String(payload.schoolName || "").trim();
      const pin = String(payload.pin || "").trim();
      if (!teacherName || pin.length < 4) {
        sendJson(res, 400, { ok: false, error: "Nama guru dan PIN minimal 4 digit wajib diisi." });
        return;
      }

      const store = readAuthStore();
      const sameIdentity = (item) => item.teacherName.toLowerCase() === teacherName.toLowerCase() && item.schoolName.toLowerCase() === schoolName.toLowerCase();
      if (action === "register") {
        if (store.teachers.some(sameIdentity)) {
          sendJson(res, 409, { ok: false, error: "Guru dengan nama dan sekolah ini sudah terdaftar." });
          return;
        }
        const salt = randomSecret();
        const teacher = { id: uid("tea"), teacherName, schoolName, pinSalt: salt, pinHash: hashPin(pin, salt), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const token = randomSecret();
        store.teachers.push(teacher);
        store.sessions.push({ id: uid("ses"), teacherId: teacher.id, tokenHash: sha256(token), createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
        writeAuthStore(store);
        sendJson(res, 200, { ok: true, token, teacher: { id: teacher.id, teacherName, schoolName }, state: null });
        return;
      }

      if (action === "login") {
        const teacher = store.teachers.find(sameIdentity);
        if (!teacher || teacher.pinHash !== hashPin(pin, teacher.pinSalt)) {
          sendJson(res, 401, { ok: false, error: "Nama guru, sekolah, atau PIN tidak cocok." });
          return;
        }
        const token = randomSecret();
        store.sessions.push({ id: uid("ses"), teacherId: teacher.id, tokenHash: sha256(token), createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
        writeAuthStore(store);
        sendJson(res, 200, { ok: true, token, teacher: { id: teacher.id, teacherName: teacher.teacherName, schoolName: teacher.schoolName }, state: readState(teacher.id) });
        return;
      }

      sendJson(res, 400, { ok: false, error: "Aksi auth tidak dikenal." });
      return;
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      const teacher = requireTeacher(req);
      if (!teacher) {
        sendJson(res, 401, { ok: false, error: "Login diperlukan." });
        return;
      }
      sendJson(res, 200, { ok: true, state: readState(teacher.id) });
      return;
    }

    if (url.pathname === "/api/state" && req.method === "PUT") {
      const teacher = requireTeacher(req);
      if (!teacher) {
        sendJson(res, 401, { ok: false, error: "Login diperlukan." });
        return;
      }
      const body = await readBody(req);
      const parsed = JSON.parse(body || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        sendJson(res, 400, { ok: false, error: "Invalid state payload" });
        return;
      }
      writeState(teacher.id, parsed);
      sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() });
      return;
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      const teacher = requireTeacher(req);
      if (!teacher) {
        sendJson(res, 401, { ok: false, error: "Login diperlukan." });
        return;
      }
      const file = teacherStateFile(teacher.id);
      if (fs.existsSync(file)) fs.unlinkSync(file);
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
    console.log(`Pegu app running at http://127.0.0.1:${port}`);
    console.log(`Pegu API available at http://127.0.0.1:${port}/api/state`);
  });

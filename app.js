const STORAGE_KEY = "peru_app_state_v1";
const API_STATE_URL = "/api/state";
const API_AUTH_URL = "/api/auth";
const AUTH_KEY = "pegu_teacher_session_v1";

const navItems = [
  ["dashboard", "home", "Beranda"],
  ["classes", "class", "Kelas"],
  ["students", "students", "Siswa"],
  ["attendance", "check", "Absensi"],
  ["assessments", "score", "Nilai"],
  ["journals", "journal", "Jurnal"],
  ["schedules", "calendar", "Jadwal"],
  ["recaps", "chart", "Rekap"],
  ["settings", "settings", "Pengaturan"],
  ["logout", "logout", "Keluar"]
];

const defaultMobileNavIds = ["dashboard", "classes", "attendance", "assessments", "journals"];
const defaultVisibleNavIds = navItems.filter(([id]) => id !== "logout").map(([id]) => id);
const quickActionItems = [
  ["attendance", "check", "Isi Absensi", "Mulai dari kelas dan tanggal"],
  ["assessments", "score", "Input Nilai", "Buat atau lanjutkan penilaian"],
  ["journals", "journal", "Tulis Jurnal", "Catat kegiatan pembelajaran"],
  ["students", "students", "Tambah Siswa", "Lengkapi data kelas"]
];
const defaultQuickActionIds = quickActionItems.map(([id]) => id);
const weekDays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const dayName = (date = new Date()) => weekDays[(date.getDay() + 6) % 7];
const formatWibTime = (value = "") => String(value || "").trim().replace(":", ".");
const pad2 = (value) => String(value).padStart(2, "0");
const timeToMinutes = (value = "") => {
  const [hour = "0", minute = "0"] = formatWibTime(value).split(".");
  return Number(hour) * 60 + Number(minute);
};
const photoPlaceholder = (label = "") => `<span class="photo-placeholder">${escapeHtml((label || "?").slice(0, 1).toUpperCase())}</span>`;

const seedState = {
  settings: {
    teacherName: "Pak/Bu Guru",
    schoolName: "Sekolah Saya",
    mainSubject: "Matematika",
    activeAcademicYear: "2025/2026",
    activeSemester: "Ganjil",
    quickActionIds: defaultQuickActionIds,
    navIds: defaultVisibleNavIds
  },
  classes: [
    { id: "class-7a", name: "VII A", academicYear: "2025/2026", subject: "Matematika", description: "Kelas contoh", createdAt: "2026-05-25T00:00:00.000Z" },
    { id: "class-8a", name: "VIII A", academicYear: "2025/2026", subject: "Matematika", description: "", createdAt: "2026-05-25T00:00:00.000Z" }
  ],
  students: [
    { id: "stu-1", classId: "class-7a", name: "Ahmad Fauzi", nis: "12345", gender: "L", parentPhone: "", notes: "", createdAt: "2026-05-25T00:00:00.000Z" },
    { id: "stu-2", classId: "class-7a", name: "Siti Rahmah", nis: "12346", gender: "P", parentPhone: "", notes: "Perlu penguatan latihan", createdAt: "2026-05-25T00:00:00.000Z" },
    { id: "stu-3", classId: "class-8a", name: "Rizky Ananda", nis: "22311", gender: "L", parentPhone: "", notes: "", createdAt: "2026-05-25T00:00:00.000Z" }
  ],
  attendanceSessions: [],
  attendanceRecords: [],
  assessments: [],
  assessmentScores: [],
  journals: [],
  schedules: [],
  activityLogs: []
};

let currentTeacher = loadTeacherSession();
let state = loadState();
let route = location.hash.replace("#", "") || "dashboard";
let backendAvailable = false;
let saveTimer = null;

function loadTeacherSession() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    return session?.token && session?.teacher ? session : null;
  } catch {
    return null;
  }
}

function teacherStorageKey() {
  return currentTeacher?.teacher?.id ? `${STORAGE_KEY}_${currentTeacher.teacher.id}` : STORAGE_KEY;
}

function loadState() {
  const raw = localStorage.getItem(teacherStorageKey());
  if (!raw) return structuredClone(seedState);
  try {
    return hydrateState(JSON.parse(raw));
  } catch {
    return structuredClone(seedState);
  }
}

function hydrateState(value) {
  const base = structuredClone(seedState);
  const source = value && typeof value === "object" ? value : {};
  const sourceSettings = source.settings || {};
  const settings = {
    ...base.settings,
    ...sourceSettings,
    quickActionIds: normalizeIds(sourceSettings.quickActionIds, defaultQuickActionIds, quickActionItems.map(([id]) => id)),
    navIds: normalizeIds(sourceSettings.navIds, defaultVisibleNavIds, navItems.filter(([id]) => id !== "logout").map(([id]) => id))
  };
  return {
    ...base,
    ...source,
    settings,
    classes: Array.isArray(source.classes) ? source.classes : base.classes,
    students: Array.isArray(source.students) ? source.students : base.students,
    attendanceSessions: Array.isArray(source.attendanceSessions) ? source.attendanceSessions : base.attendanceSessions,
    attendanceRecords: Array.isArray(source.attendanceRecords) ? source.attendanceRecords : base.attendanceRecords,
    assessments: Array.isArray(source.assessments) ? source.assessments : base.assessments,
    assessmentScores: Array.isArray(source.assessmentScores) ? source.assessmentScores : base.assessmentScores,
    journals: Array.isArray(source.journals) ? source.journals : base.journals,
    schedules: Array.isArray(source.schedules) ? source.schedules : base.schedules,
    activityLogs: Array.isArray(source.activityLogs) ? source.activityLogs : base.activityLogs
  };
}

function normalizeIds(value, fallback, allowed) {
  if (!Array.isArray(value)) return [...fallback];
  const filtered = value.filter((id) => allowed.includes(id));
  return filtered.length ? filtered : [...fallback];
}

function saveState() {
  localStorage.setItem(teacherStorageKey(), JSON.stringify(state));
  syncStateToBackend();
}

async function loadBackendState() {
  if (!currentTeacher?.token) return false;
  try {
    const response = await fetch(API_STATE_URL, { headers: authHeaders({ Accept: "application/json" }) });
    if (response.status === 401) {
      clearTeacherSession();
      return false;
    }
    if (!response.ok) throw new Error("Backend tidak merespons.");
    const payload = await response.json();
    backendAvailable = true;
    if (payload.state) {
      state = hydrateState(payload.state);
      localStorage.setItem(teacherStorageKey(), JSON.stringify(state));
    } else {
      syncStateToBackend(true);
    }
    return true;
  } catch {
    backendAvailable = false;
    return false;
  }
}

function syncStateToBackend(immediate = false) {
  if (!currentTeacher?.token) return;
  if (!backendAvailable && !immediate) return;
  window.clearTimeout(saveTimer);
  const send = async () => {
    try {
      const response = await fetch(API_STATE_URL, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(state)
      });
      if (response.status === 401) clearTeacherSession();
      backendAvailable = response.ok;
    } catch {
      backendAvailable = false;
    }
  };
  if (immediate) send();
  else saveTimer = window.setTimeout(send, 250);
}

function authHeaders(headers = {}) {
  return currentTeacher?.token ? { ...headers, Authorization: `Bearer ${currentTeacher.token}` } : headers;
}

function clearTeacherSession() {
  localStorage.removeItem(AUTH_KEY);
  currentTeacher = null;
  backendAvailable = false;
}

function setRoute(next) {
  if (next === "logout") {
    logoutTeacher();
    return;
  }
  route = next;
  location.hash = next;
  render();
}

async function logoutTeacher() {
  if (currentTeacher?.token) {
    fetch(API_AUTH_URL, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ action: "logout" }) }).catch(() => {});
  }
  clearTeacherSession();
  state = structuredClone(seedState);
  renderLogin();
}

window.addEventListener("hashchange", () => {
  route = location.hash.replace("#", "") || "dashboard";
  render();
});

function className(id) {
  return state.classes.find((item) => item.id === id)?.name || "-";
}

function classSubject(id) {
  return state.classes.find((item) => item.id === id)?.subject || state.settings.mainSubject;
}

function studentsInClass(classId) {
  return state.students.filter((student) => !classId || student.classId === classId);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toast(message) {
  document.querySelector(".toast")?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadFile(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function compressImage(file, maxSize = 420, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("File harus berupa gambar."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = () => reject(new Error("Gambar tidak bisa dibaca."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Gagal membaca gambar."));
    reader.readAsDataURL(file);
  });
}

function bindCompressedPhotoInput(inputSelector, hiddenSelector, previewSelector) {
  const input = document.querySelector(inputSelector);
  if (!input) return;
  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      const hidden = document.querySelector(hiddenSelector);
      const preview = document.querySelector(previewSelector);
      if (hidden) hidden.value = compressed;
      if (preview) preview.innerHTML = `<img src="${compressed}" alt="Preview foto">`;
    } catch (error) {
      alert(error.message || "Gagal memproses foto.");
      event.target.value = "";
    }
  });
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function renderLogin(message = "") {
  const app = document.getElementById("app");
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-panel">
        <div class="auth-brand">
          <span class="brand-mark"><img src="assets/logo.png" alt="Logo Pegu"></span>
          <div>
            <h1>Pegu</h1>
            <p>Pegangan Guru</p>
          </div>
        </div>
        <form id="auth-form" class="auth-form">
          <label>Nama guru<input class="input" name="teacherName" value="${escapeHtml(currentTeacher?.teacher?.teacherName || "")}" required autocomplete="name"></label>
          <label>Nama sekolah<input class="input" name="schoolName" value="${escapeHtml(currentTeacher?.teacher?.schoolName || "")}" autocomplete="organization"></label>
          <label>PIN<input class="input" name="pin" type="password" inputmode="numeric" minlength="4" required autocomplete="current-password"></label>
          <div class="auth-actions">
            <button class="btn primary" type="submit" data-auth-action="login">Masuk</button>
            <button class="btn outline" type="submit" data-auth-action="register">Daftar Guru</button>
          </div>
          <p class="form-hint">Data kelas, siswa, absensi, nilai, dan jurnal akan dipisahkan untuk setiap guru.</p>
          ${message ? `<div class="auth-message">${escapeHtml(message)}</div>` : ""}
        </form>
      </section>
    </main>
  `;
  document.querySelector("#auth-form").addEventListener("submit", submitAuth);
}

async function submitAuth(event) {
  event.preventDefault();
  const action = event.submitter?.dataset.authAction || "login";
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const response = await fetch(API_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Login gagal.");
    currentTeacher = { token: payload.token, teacher: payload.teacher };
    localStorage.setItem(AUTH_KEY, JSON.stringify(currentTeacher));
    state = hydrateState(payload.state || {
      ...structuredClone(seedState),
      settings: {
        ...seedState.settings,
        teacherName: payload.teacher.teacherName,
        schoolName: payload.teacher.schoolName || seedState.settings.schoolName
      }
    });
    localStorage.setItem(teacherStorageKey(), JSON.stringify(state));
    backendAvailable = true;
    if (!payload.state) syncStateToBackend(true);
    render();
  } catch (error) {
    renderLogin(error.message || "Login gagal.");
  }
}

function render() {
  if (!currentTeacher?.token) {
    renderLogin();
    return;
  }
  const active = navItems.some(([id]) => id === route && id !== "logout") ? route : "dashboard";
  const app = document.getElementById("app");
  const visibleNavItems = getVisibleNavItems();
  const mobileItems = visibleNavItems.filter(([id]) => defaultMobileNavIds.includes(id));
  const attentionCount = getAttentionItems().length;
  app.innerHTML = `
    <div class="app-shell route-${active}">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark"><img src="assets/logo.png" alt="Logo Pegu"></div>
          <div>
            <div class="brand-title">Pegu</div>
            <div class="brand-subtitle">Pegangan Guru</div>
          </div>
        </div>
        <div class="nav-list">${visibleNavItems.map(([id, icon, label]) => navButton(id, icon, label, active)).join("")}${navButton("logout", "logout", "Keluar", active)}</div>
        <div class="sidebar-note">
          <strong>${escapeHtml(state.settings.activeAcademicYear)}</strong>
          <span>${escapeHtml(state.settings.schoolName || "Sekolah Saya")}</span>
        </div>
      </aside>
      <main class="main">
        <div class="mobile-app-header">
          <button class="icon-button mobile-menu-toggle" type="button" aria-label="Buka menu">${iconSvg("menu")}</button>
          <div class="mobile-brand">
            <div class="mobile-brand-mark"><img src="assets/logo.png" alt="Logo Pegu"></div>
            <div><strong>Pegu</strong><span>Pegangan Guru</span></div>
          </div>
          <div class="mobile-header-actions">
            <div class="profile-menu-wrap">
              <button class="icon-button" type="button" data-reminder-toggle aria-label="Peringatan">${iconSvg("bell")}${getReminderItems().length ? `<span class="notif-badge">${getReminderItems().length}</span>` : ""}</button>
              ${reminderDropdown()}
            </div>
            <div class="profile-menu-wrap">
              <button class="teacher-avatar" type="button" data-profile-toggle aria-label="Menu profil">${avatarContent()}</button>
              ${profileDropdown()}
            </div>
          </div>
        </div>
        ${renderPage(active)}
      </main>
      <div class="mobile-drawer-backdrop" data-mobile-drawer>
        <div class="mobile-drawer">
          <div class="mobile-drawer-head">
            <div><strong>Menu Pegu</strong><span>Pegangan Guru</span></div>
            <button class="icon-button" type="button" data-close-mobile-menu aria-label="Tutup menu">${iconSvg("close")}</button>
          </div>
          <div class="nav-list">${visibleNavItems.map(([id, icon, label]) => navButton(id, icon, label, active)).join("")}${navButton("logout", "logout", "Keluar", active)}</div>
        </div>
      </div>
      <nav class="mobile-bar" style="grid-template-columns: repeat(${Math.max(1, mobileItems.length)}, minmax(0, 1fr));">${mobileItems.map(([id, icon, label]) => navButton(id, icon, label, active)).join("")}</nav>
    </div>
  `;

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => setRoute(button.dataset.route));
  });
  const mobileDrawer = document.querySelector("[data-mobile-drawer]");
  document.querySelector(".mobile-menu-toggle")?.addEventListener("click", () => mobileDrawer?.classList.add("open"));
  document.querySelector("[data-close-mobile-menu]")?.addEventListener("click", () => mobileDrawer?.classList.remove("open"));
  mobileDrawer?.addEventListener("click", (event) => {
    if (event.target === mobileDrawer) mobileDrawer.classList.remove("open");
  });
  bindProfileMenu();
  bindPage(active);
}

function getVisibleNavItems() {
  const allowed = new Set(state.settings.navIds || defaultVisibleNavIds);
  return navItems.filter(([id]) => id !== "logout" && allowed.has(id));
}

function avatarContent() {
  return state.settings.photoData ? `<img src="${state.settings.photoData}" alt="Foto profil">` : escapeHtml((state.settings.teacherName || "G").slice(0, 1).toUpperCase());
}

function profileDropdown() {
  return `
    <div class="profile-menu" data-profile-menu>
      <button type="button" data-edit-profile>${iconSvg("settings")} Edit Profil</button>
      <button type="button" data-profile-logout>${iconSvg("logout")} Log out</button>
    </div>
  `;
}

function reminderDropdown() {
  const items = getReminderItems();
  return `
    <div class="profile-menu reminder-menu" data-reminder-menu>
      ${items.length ? items.map((item) => `
        <button type="button" data-route="${item.route}" data-reminder-action>
          ${iconSvg(item.icon)}
          <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.desc)}</small></span>
        </button>
      `).join("") : `<div class="reminder-empty">Tidak ada pengingat hari ini.</div>`}
    </div>
  `;
}

function bindProfileMenu() {
  document.querySelectorAll("[data-profile-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = button.closest(".profile-menu-wrap")?.querySelector("[data-profile-menu]");
      document.querySelectorAll("[data-profile-menu].open").forEach((item) => {
        if (item !== menu) item.classList.remove("open");
      });
      menu?.classList.toggle("open");
      if (menu?.classList.contains("open")) window.setTimeout(() => document.addEventListener("click", closeProfileMenus, { once: true }), 0);
    });
  });
  document.querySelectorAll("[data-reminder-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = button.closest(".profile-menu-wrap")?.querySelector("[data-reminder-menu]");
      document.querySelectorAll("[data-profile-menu].open, [data-reminder-menu].open").forEach((item) => {
        if (item !== menu) item.classList.remove("open");
      });
      menu?.classList.toggle("open");
      if (menu?.classList.contains("open")) window.setTimeout(() => document.addEventListener("click", closeProfileMenus, { once: true }), 0);
    });
  });
  document.querySelectorAll("[data-edit-profile]").forEach((button) => button.addEventListener("click", () => {
    button.closest("[data-profile-menu]")?.classList.remove("open");
    profileModal();
  }));
  document.querySelectorAll("[data-profile-logout]").forEach((button) => button.addEventListener("click", () => {
    button.closest("[data-profile-menu]")?.classList.remove("open");
    logoutTeacher();
  }));
}

function closeProfileMenus() {
  document.querySelectorAll("[data-profile-menu].open, [data-reminder-menu].open").forEach((item) => item.classList.remove("open"));
}

function navButton(id, icon, label, active) {
  return `
    <button class="nav-item ${active === id ? "active" : ""}" data-route="${id}">
      <span class="nav-icon">${iconSvg(icon)}</span><span>${label}</span>
    </button>
  `;
}

function iconSvg(name) {
  const icons = {
    home: `<svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>`,
    class: `<svg viewBox="0 0 24 24"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v14H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 6.5v14"/></svg>`,
    students: `<svg viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0-8 0"/><path d="M4 20a8 8 0 0 1 16 0"/><path d="M18 8a3 3 0 0 1 3 3"/><path d="M21 20a6 6 0 0 0-3-5"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="M8 12.5 11 15l5-6"/><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/></svg>`,
    score: `<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h3M8 16h5"/></svg>`,
    journal: `<svg viewBox="0 0 24 24"><path d="M6 4h10l2 2v14H6z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>`,
    chart: `<svg viewBox="0 0 24 24"><path d="M5 20V4"/><path d="M5 20h15"/><path d="M9 16v-5M13 16V8M17 16v-3"/></svg>`,
    bell: `<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
    menu: `<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>`,
    settings: `<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a7 7 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .3 0 .7.1 1l-2 1.5 2 3.4 2.4-1c.5.4 1.1.8 1.8 1l.3 3.1h4.8l.3-3.1c.7-.2 1.3-.6 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/></svg>`,
    logout: `<svg viewBox="0 0 24 24"><path d="M10 5H5v14h5"/><path d="M14 8l4 4-4 4"/><path d="M9 12h9"/></svg>`,
    plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
    upload: `<svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M5 20h14"/></svg>`,
    download: `<svg viewBox="0 0 24 24"><path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><path d="M5 20h14"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24"><path d="M7 3v4M17 3v4"/><path d="M4 6h16v14H4z"/><path d="M4 10h16"/></svg>`,
    alert: `<svg viewBox="0 0 24 24"><path d="M12 4 3 20h18z"/><path d="M12 9v5M12 17h.01"/></svg>`
  };
  return icons[name] || icons.home;
}

function pageHeader(eyebrow, title, desc, actions = "") {
  return `
    <div class="topbar">
      <div>
        <div class="eyebrow">${eyebrow}</div>
        <h1>${title}</h1>
        <p class="subtext">${desc}</p>
      </div>
      <div class="topbar-right">
        <div class="top-actions">${actions}</div>
        <div class="profile-menu-wrap">
          <button class="profile-chip" type="button" data-profile-toggle>
            <span class="profile-avatar">${avatarContent()}</span>
            <span><strong>${escapeHtml(state.settings.teacherName)}</strong><small>${escapeHtml(state.settings.mainSubject || "Guru")}</small></span>
          </button>
          ${profileDropdown()}
        </div>
      </div>
    </div>
  `;
}

function renderPage(active) {
  return {
    dashboard: renderDashboard,
    classes: renderClasses,
    students: renderStudents,
    attendance: renderAttendance,
    assessments: renderAssessments,
    journals: renderJournals,
    schedules: renderSchedules,
    recaps: renderRecaps,
    settings: renderSettings
  }[active]();
}

function bindPage(active) {
  const binders = {
    dashboard: bindDashboard,
    classes: bindClasses,
    students: bindStudents,
    attendance: bindAttendance,
    assessments: bindAssessments,
    journals: bindJournals,
    schedules: bindSchedules,
    recaps: bindRecaps,
    settings: bindSettings
  };
  binders[active]?.();
}

function getStudentAverage(studentId) {
  const scores = state.assessmentScores
    .filter((score) => score.studentId === studentId && score.score !== "")
    .map((score) => Number(score.score))
    .filter((score) => Number.isFinite(score));
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function getAttentionItems(limit = 5) {
  return state.students
    .map((student) => {
      const records = state.attendanceRecords.filter((record) => record.studentId === student.id);
      const absent = records.filter((record) => ["Sakit", "Izin", "Alpha"].includes(record.status)).length;
      const late = records.filter((record) => record.status === "Terlambat").length;
      const average = getStudentAverage(student.id);
      if (absent > 0) return { student, badge: "Absensi", note: `${absent} catatan tidak hadir`, badgeClass: "bad", priority: 1 };
      if (late > 0) return { student, badge: "Terlambat", note: `${late} catatan terlambat`, badgeClass: "warn", priority: 2 };
      if (average !== null && average < 70) return { student, badge: "Nilai Rendah", note: `Rata-rata ${average}`, badgeClass: "warn", priority: 3 };
      if ((student.notes || "").trim()) return { student, badge: "Catatan", note: student.notes.trim(), badgeClass: "warn", priority: 4 };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority || a.student.name.localeCompare(b.student.name))
    .slice(0, limit);
}

function getTodaySchedules() {
  const currentDay = dayName();
  return state.schedules
    .filter((schedule) => (schedule.day || dayName(new Date(`${schedule.date}T00:00:00`))) === currentDay)
    .slice()
    .sort((a, b) => `${a.startTime || ""}${a.endTime || ""}`.localeCompare(`${b.startTime || ""}${b.endTime || ""}`));
}

function getDefaultAttendanceClass() {
  return getTodaySchedules()[0]?.classId || state.classes[0]?.id || "";
}

function getReminderItems() {
  const date = today();
  const schedules = getTodaySchedules();
  const reminders = [];
  schedules.forEach((schedule) => {
    const hasAttendance = state.attendanceSessions.some((session) => session.classId === schedule.classId && session.date === date);
    if (!hasAttendance) {
      reminders.push({
        icon: "check",
        route: "attendance",
        title: `Absensi ${className(schedule.classId)}`,
        desc: `Belum diisi untuk jadwal ${schedule.startTime || "-"}`
      });
    }
    const hasJournal = state.journals.some((journal) => journal.classId === schedule.classId && journal.date === date);
    if (!hasJournal) {
      reminders.push({
        icon: "journal",
        route: "journals",
        title: `Jurnal ${className(schedule.classId)}`,
        desc: `Belum ditulis untuk hari ini`
      });
    }
  });
  return reminders.slice(0, 8);
}

function getRecentActivities(limit = 5) {
  return state.activityLogs
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, limit);
}

function logActivity(type, title, desc) {
  state.activityLogs.unshift({ id: uid("log"), type, title, desc, createdAt: new Date().toISOString() });
  state.activityLogs = state.activityLogs.slice(0, 50);
}

function formatActivityTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function renderDashboard() {
  const todaySchedules = getTodaySchedules();
  const attention = getAttentionItems();
  const activities = getRecentActivities();

  return `
    ${pageHeader("Beranda", `Selamat datang, ${escapeHtml(state.settings.teacherName)}`, "Semangat mengajar hari ini. Semua aktivitas utama ada di sini.", "")}
    <section class="hero-panel">
      <div>
        <span class="soft-label">Pegu Pegangan Guru</span>
        <h2>Ruang kerja harian untuk absensi, nilai, dan jurnal.</h2>
        <p>Pilih aksi yang dibutuhkan, lanjutkan pekerjaan kelas, lalu simpan data secara lokal di browser.</p>
      </div>
      <div class="hero-date">
        <span>Hari ini</span>
        <strong>${today()}</strong>
      </div>
    </section>
    <div class="card card-pad section-gap">
      <div class="section-title"><div><span class="soft-label">Aksi Cepat</span><h2>Mulai pekerjaan kelas</h2></div></div>
      <div class="quick-grid">
        ${getVisibleQuickActions().map(([target, icon, title, desc]) => quick(icon, title, desc, target)).join("") || emptyState("settings", "Aksi cepat belum dipilih", "Atur tombol aksi cepat yang ingin ditampilkan di halaman Pengaturan.")}
      </div>
    </div>
    <div class="grid dashboard-grid">
      <div class="card card-pad">
        <div class="section-title"><div><span class="soft-label">Jadwal Hari Ini</span><h2>Agenda mengajar</h2></div><button class="link-action" data-route="schedules">Kelola jadwal ${iconSvg("chevron")}</button></div>
        <div class="schedule-list">
          ${todaySchedules.length ? todaySchedules.map((schedule) => scheduleItem(`${schedule.startTime} - ${schedule.endTime}`, schedule.subject, className(schedule.classId), schedule.room || "-", schedule.status || "Terjadwal")).join("") : emptyState("calendar", "Belum ada jadwal hari ini", "Tambahkan jadwal mengajar agar agenda harian muncul di sini.", "Tambah Jadwal", "add-schedule-dashboard")}
        </div>
      </div>
      <div class="card card-pad">
        <div class="section-title"><div><span class="soft-label">Perhatian</span><h2>Siswa perlu dipantau</h2></div><button class="link-action" data-route="students">Lihat semua ${iconSvg("chevron")}</button></div>
        <div class="list">
          ${attention.length ? attention.map((item) => attentionCard(item.student.name, item.badge, item.note, item.badgeClass)).join("") : emptyState("alert", "Tidak ada siswa yang perlu dipantau", "Absensi, nilai, dan catatan siswa terlihat aman.")}
        </div>
      </div>
    </div>
    <div class="card card-pad activity-wide">
      <div class="section-title"><div><span class="soft-label">Aktivitas Terbaru</span><h2>Riwayat singkat</h2></div></div>
      <div class="list">
        ${activities.length ? activities.map((activity) => activityItem(activity.type, activity.title, activity.desc, formatActivityTime(activity.createdAt))).join("") : emptyState("bell", "Belum ada aktivitas terbaru", "Aktivitas akan muncul setelah menyimpan absensi, nilai, jurnal, atau jadwal.")}
      </div>
    </div>
  `;
}

function stat(label, value, foot, icon, progress = null) {
  return `<div class="card stat-card"><div class="stat-top"><span class="stat-icon">${iconSvg(icon)}</span></div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div>${progress !== null ? `<div class="mini-progress"><span style="width:${Math.max(4, Math.min(100, progress))}%"></span></div>` : ""}</div>`;
}

function quick(icon, title, desc, target) {
  return `<button class="quick-card" data-route="${target}"><span class="quick-kicker">${iconSvg(icon)}</span><span class="quick-title">${title}</span><span class="list-meta">${desc}</span></button>`;
}

function getVisibleQuickActions() {
  const allowed = new Set(state.settings.quickActionIds || defaultQuickActionIds);
  return quickActionItems.filter(([id]) => allowed.has(id));
}

function listItem(title, desc, meta, badgeClass = "") {
  return `<div class="list-item"><strong>${escapeHtml(title)}</strong><div class="list-meta">${escapeHtml(desc)}</div>${meta ? `<div class="badge badge-stack ${badgeClass}">${escapeHtml(meta)}</div>` : ""}</div>`;
}

function scheduleItem(time, subject, klass, room, status) {
  const badgeClass = status === "Berlangsung" ? "good" : "warn";
  return `
    <div class="schedule-item">
      <div class="schedule-time">${escapeHtml(time)}</div>
      <div>
        <strong>${escapeHtml(subject)}</strong>
        <div class="list-meta">${escapeHtml(klass)} - ${escapeHtml(room)}</div>
      </div>
      <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
    </div>
  `;
}

function timePicker(prefix, label, value) {
  const [hour = "07", minute = "00"] = formatWibTime(value).split(".");
  return `
    <label>${label}
      <div class="time-picker">
        <select class="select" name="${prefix}Hour" aria-label="${label} jam">
          ${Array.from({ length: 24 }, (_, index) => {
            const item = pad2(index);
            return `<option value="${item}" ${hour === item ? "selected" : ""}>${item}</option>`;
          }).join("")}
        </select>
        <span>:</span>
        <select class="select" name="${prefix}Minute" aria-label="${label} menit">
          ${Array.from({ length: 60 }, (_, index) => {
            const item = pad2(index);
            return `<option value="${item}" ${minute === item ? "selected" : ""}>${item}</option>`;
          }).join("")}
        </select>
      </div>
    </label>
  `;
}

function attentionCard(name, badge, note, badgeClass) {
  return `
    <div class="attention-card">
      <span class="mini-avatar">${escapeHtml(name.slice(0, 1))}</span>
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span class="badge ${badgeClass}">${escapeHtml(badge)}</span>
        <p>${escapeHtml(note)}</p>
      </div>
    </div>
  `;
}

function activityItem(icon, title, desc, time) {
  return `
    <div class="activity-item">
      <span class="activity-icon">${iconSvg(icon)}</span>
      <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(desc)}</p></div>
      <time>${escapeHtml(time)}</time>
    </div>
  `;
}

function emptyState(icon, title, text, actionText = "", actionId = "") {
  return `
    <div class="empty">
      <span class="empty-icon">${iconSvg(icon)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
      ${actionText ? `<button class="btn primary" id="${actionId}">${escapeHtml(actionText)}</button>` : ""}
    </div>
  `;
}

function renderClasses() {
  return `
    ${pageHeader("Kelas", "Manajemen kelas", "Kelola kelas, tahun ajaran, mata pelajaran, dan jumlah siswa.", `<button class="btn primary" id="add-class">${iconSvg("plus")} Tambah Kelas</button>`)}
    <div class="card card-pad">
      ${state.classes.length ? `
        <div class="class-grid">
          ${state.classes.map((item) => `
            <article class="data-card class-card">
              <div class="data-card-head">
                <span class="data-icon">${iconSvg("class")}</span>
                <span class="badge">${studentsInClass(item.id).length} siswa</span>
              </div>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.description || "Tidak ada deskripsi")}</p>
              <div class="data-meta">
                <span>${escapeHtml(item.academicYear)}</span>
                <span>${escapeHtml(item.subject || "-")}</span>
              </div>
              <div class="row-actions"><button class="btn small outline" data-edit-class="${item.id}">Edit</button><button class="btn small danger" data-delete-class="${item.id}">Hapus</button></div>
            </article>
          `).join("")}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Nama kelas</th><th>Tahun ajaran</th><th>Mata pelajaran</th><th>Siswa</th><th>Aksi</th></tr></thead>
          <tbody>${state.classes.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.name)}</strong><div class="list-meta">${escapeHtml(item.description || "-")}</div></td>
              <td>${escapeHtml(item.academicYear)}</td>
              <td>${escapeHtml(item.subject || "-")}</td>
              <td><span class="badge">${studentsInClass(item.id).length} siswa</span></td>
              <td><div class="row-actions"><button class="btn small outline" data-edit-class="${item.id}">Edit</button><button class="btn small danger" data-delete-class="${item.id}">Hapus</button></div></td>
            </tr>`).join("")}</tbody>
        </table></div>
      ` : empty("Belum ada kelas. Tambahkan kelas pertama untuk mulai menggunakan Pegu.", "Tambah Kelas", "add-class-empty")}
    </div>
  `;
}

function renderStudents() {
  const selectedClass = sessionStorage.getItem("peru_student_class") || "";
  const query = (sessionStorage.getItem("peru_student_query") || "").toLowerCase();
  const students = state.students.filter((student) =>
    (!selectedClass || student.classId === selectedClass) && student.name.toLowerCase().includes(query)
  );
  return `
    ${pageHeader("Siswa", "Data siswa", "Cari, filter, import, dan export data siswa berdasarkan kelas.", `
      <button class="btn outline" id="download-student-template">${iconSvg("download")} Template CSV</button>
      <button class="btn outline" id="import-students">${iconSvg("upload")} Import CSV</button>
      <button class="btn secondary" id="export-students">${iconSvg("download")} Export Siswa</button>
      <button class="btn primary" id="add-student">${iconSvg("plus")} Tambah Siswa</button>
    `)}
    <div class="card card-pad">
      <div class="toolbar">
        ${classSelect("student-class-filter", selectedClass, "Semua kelas")}
        <input class="input" id="student-search" placeholder="Cari nama siswa..." value="${escapeHtml(sessionStorage.getItem("peru_student_query") || "")}">
      </div>
      ${students.length ? studentTable(students) : empty("Belum ada siswa di filter ini. Tambahkan siswa secara manual atau import dari file.", "Tambah Siswa", "add-student-empty")}
    </div>
    <input class="hidden" type="file" id="student-import-file" accept=".csv,text/csv">
  `;
}

function studentTable(students) {
  return `
    <div class="mobile-card-list">
      ${students.map((student) => `
        <article class="data-card">
          <div class="data-card-head">
            <span class="student-photo small">${student.photoData ? `<img src="${student.photoData}" alt="Foto ${escapeHtml(student.name)}">` : photoPlaceholder(student.name)}</span>
            <span class="badge">${escapeHtml(className(student.classId))}</span>
          </div>
          <h3>${escapeHtml(student.name)}</h3>
          <p>${escapeHtml(student.notes || "Tidak ada catatan khusus")}</p>
          <div class="data-meta">
            <span>NIS ${escapeHtml(student.nis || "-")}</span>
            <span>${escapeHtml(student.gender || "-")}</span>
          </div>
          <div class="row-actions"><button class="btn small outline" data-edit-student="${student.id}">Edit</button><button class="btn small danger" data-delete-student="${student.id}">Hapus</button></div>
        </article>
      `).join("")}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Nama</th><th>NIS</th><th>JK</th><th>Kelas</th><th>Catatan</th><th>Aksi</th></tr></thead>
      <tbody>${students.map((student) => `
        <tr>
          <td><div class="student-cell"><span class="student-photo tiny">${student.photoData ? `<img src="${student.photoData}" alt="Foto ${escapeHtml(student.name)}">` : photoPlaceholder(student.name)}</span><strong>${escapeHtml(student.name)}</strong></div></td>
          <td>${escapeHtml(student.nis || "-")}</td>
          <td>${escapeHtml(student.gender || "-")}</td>
          <td>${escapeHtml(className(student.classId))}</td>
          <td>${escapeHtml(student.notes || "-")}</td>
          <td><div class="row-actions"><button class="btn small outline" data-edit-student="${student.id}">Edit</button><button class="btn small danger" data-delete-student="${student.id}">Hapus</button></div></td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;
}

function renderAttendance() {
  const scheduleDefault = getTodaySchedules()[0];
  const selectedClass = sessionStorage.getItem("peru_attendance_class") || scheduleDefault?.classId || state.classes[0]?.id || "";
  const selectedDate = sessionStorage.getItem("peru_attendance_date") || today();
  const students = studentsInClass(selectedClass);
  const existingSession = state.attendanceSessions.find((session) => session.classId === selectedClass && session.date === selectedDate);
  const records = existingSession ? state.attendanceRecords.filter((record) => record.sessionId === existingSession.id) : [];
  return `
    ${pageHeader("Absensi", "Isi absensi cepat", "Pilih kelas dan tanggal, lalu ubah status siswa yang perlu dicatat.", `<button class="btn secondary" id="export-attendance">${iconSvg("download")} Export Absensi</button>`)}
    <div class="card card-pad">
      <div class="toolbar">
        ${classSelect("attendance-class", selectedClass)}
        <input class="input" type="date" id="attendance-date" value="${selectedDate}">
        <button class="btn outline" id="mark-all-present">Set semua Hadir</button>
      </div>
      <div class="form-hint">${scheduleDefault ? `Otomatis mengikuti jadwal hari ini: ${escapeHtml(className(scheduleDefault.classId))} ${escapeHtml(scheduleDefault.startTime || "")}. Kelas dan tanggal tetap bisa diganti manual.` : "Belum ada jadwal hari ini. Pilih kelas dan tanggal secara manual."}</div>
      ${students.length ? `
        <div class="attendance-list">
          ${students.map((student) => {
            const record = records.find((item) => item.studentId === student.id);
            return studentStatusRow(student, record?.status || "Hadir", record?.notes || "");
          }).join("")}
        </div>
        <div class="form-actions"><button class="btn primary" id="save-attendance">Simpan Absensi</button></div>
      ` : empty("Belum ada siswa di kelas ini. Tambahkan siswa dahulu sebelum absensi.", "Tambah Siswa", "goto-students")}
    </div>
    <div class="card card-pad section-gap-top">
      <div class="section-title"><h2>Riwayat absensi</h2></div>
      ${historyAttendance(selectedClass)}
    </div>
  `;
}

function studentStatusRow(student, status, notes) {
  return `
    <div class="student-input-row" data-attendance-student="${student.id}">
      <div><div class="student-name">${escapeHtml(student.name)}</div><div class="student-sub">${escapeHtml(student.nis || className(student.classId))}</div></div>
      <select class="select attendance-status">
        ${["Hadir", "Sakit", "Izin", "Alpha", "Terlambat"].map((item) => `<option ${status === item ? "selected" : ""}>${item}</option>`).join("")}
      </select>
      <input class="input attendance-notes" placeholder="Catatan opsional" value="${escapeHtml(notes)}">
    </div>
  `;
}

function historyAttendance(classId) {
  const sessions = state.attendanceSessions.filter((session) => !classId || session.classId === classId).slice().reverse();
  if (!sessions.length) return emptyState("calendar", "Belum ada riwayat absensi", "Sesi absensi yang sudah disimpan akan muncul di sini.");
  return `
    <div class="mobile-card-list">
      ${sessions.map((session) => {
        const records = state.attendanceRecords.filter((record) => record.sessionId === session.id);
        const count = (status) => records.filter((record) => record.status === status).length;
        return `
          <article class="data-card">
            <div class="data-card-head"><span class="data-icon">${iconSvg("check")}</span><span class="badge">${session.date}</span></div>
            <h3>${className(session.classId)}</h3>
            <div class="status-grid">
              <span>Hadir <strong>${count("Hadir")}</strong></span>
              <span>Sakit <strong>${count("Sakit")}</strong></span>
              <span>Izin <strong>${count("Izin")}</strong></span>
              <span>Alpha <strong>${count("Alpha")}</strong></span>
            </div>
          </article>
        `;
      }).join("")}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Tanggal</th><th>Kelas</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpha</th><th>Terlambat</th></tr></thead>
      <tbody>${sessions.map((session) => {
        const records = state.attendanceRecords.filter((record) => record.sessionId === session.id);
        const count = (status) => records.filter((record) => record.status === status).length;
        return `<tr><td>${session.date}</td><td>${className(session.classId)}</td><td>${count("Hadir")}</td><td>${count("Sakit")}</td><td>${count("Izin")}</td><td>${count("Alpha")}</td><td>${count("Terlambat")}</td></tr>`;
      }).join("")}</tbody>
    </table></div>
  `;
}

function renderAssessments() {
  const selectedClass = sessionStorage.getItem("peru_assessment_class") || state.classes[0]?.id || "";
  const assessments = state.assessments.filter((item) => !selectedClass || item.classId === selectedClass).slice().reverse();
  return `
    ${pageHeader("Penilaian", "Input dan riwayat nilai", "Buat aktivitas penilaian lalu isi nilai siswa dalam satu halaman.", `
      <button class="btn secondary" id="export-assessments">${iconSvg("download")} Export Nilai</button>
      <button class="btn primary" id="add-assessment">${iconSvg("plus")} Buat Penilaian</button>
    `)}
    <div class="card card-pad">
      <div class="toolbar">${classSelect("assessment-class-filter", selectedClass, "Semua kelas")}</div>
      ${assessments.length ? `
        <div class="mobile-card-list">
          ${assessments.map((item) => assessmentCard(item)).join("")}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Penilaian</th><th>Kelas</th><th>Kategori</th><th>Tanggal</th><th>Rata-rata</th><th>Aksi</th></tr></thead>
          <tbody>${assessments.map((item) => assessmentRow(item)).join("")}</tbody>
        </table></div>
      ` : empty("Belum ada penilaian. Buat penilaian pertama untuk mulai input nilai.", "Buat Penilaian", "add-assessment-empty")}
    </div>
  `;
}

function assessmentCard(item) {
  const scores = state.assessmentScores.filter((score) => score.assessmentId === item.id && score.score !== "");
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + Number(score.score), 0) / scores.length) : "-";
  return `
    <article class="data-card">
      <div class="data-card-head"><span class="data-icon">${iconSvg("score")}</span><span class="badge warn">Rata-rata ${average}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.category)} - ${escapeHtml(item.date)}</p>
      <div class="data-meta"><span>${className(item.classId)}</span><span>${scores.length} nilai</span></div>
      <div class="row-actions"><button class="btn small outline" data-edit-assessment="${item.id}">Isi/Edit</button><button class="btn small danger" data-delete-assessment="${item.id}">Hapus</button></div>
    </article>
  `;
}

function assessmentRow(item) {
  const scores = state.assessmentScores.filter((score) => score.assessmentId === item.id && score.score !== "");
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + Number(score.score), 0) / scores.length) : "-";
  return `
    <tr>
      <td><strong>${escapeHtml(item.title)}</strong></td><td>${className(item.classId)}</td><td>${item.category}</td><td>${item.date}</td><td><span class="badge">${average}</span></td>
      <td><div class="row-actions"><button class="btn small outline" data-edit-assessment="${item.id}">Isi/Edit</button><button class="btn small danger" data-delete-assessment="${item.id}">Hapus</button></div></td>
    </tr>
  `;
}

function renderJournals() {
  const selectedClass = sessionStorage.getItem("peru_journal_class") || "";
  const query = (sessionStorage.getItem("peru_journal_query") || "").toLowerCase();
  const journals = state.journals
    .filter((journal) => (!selectedClass || journal.classId === selectedClass) && journal.material.toLowerCase().includes(query))
    .slice()
    .reverse();
  return `
    ${pageHeader("Jurnal", "Jurnal mengajar", "Catat materi, kegiatan, kendala, dan tindak lanjut pembelajaran.", `
      <button class="btn secondary" id="export-journals">${iconSvg("download")} Export Jurnal</button>
      <button class="btn primary" id="add-journal">${iconSvg("plus")} Tulis Jurnal</button>
    `)}
    <div class="card card-pad">
      <div class="toolbar">
        ${classSelect("journal-class-filter", selectedClass, "Semua kelas")}
        <input class="input" id="journal-search" placeholder="Cari materi..." value="${escapeHtml(sessionStorage.getItem("peru_journal_query") || "")}">
      </div>
      ${journals.length ? `
        <div class="list">${journals.map((journal) => `
          <div class="list-item">
            <div class="section-title compact"><strong>${escapeHtml(journal.material)}</strong><span class="badge">${journal.date}</span></div>
            <div class="list-meta">${className(journal.classId)} - ${escapeHtml(journal.subject)} - ${escapeHtml(journal.lessonHours || "-")}</div>
            <div class="journal-preview">${escapeHtml(journal.activities)}</div>
            <div class="row-actions action-row"><button class="btn small outline" data-edit-journal="${journal.id}">Edit</button><button class="btn small danger" data-delete-journal="${journal.id}">Hapus</button></div>
          </div>`).join("")}</div>
      ` : empty("Belum ada jurnal mengajar. Tulis jurnal pertama setelah kegiatan pembelajaran.", "Tulis Jurnal", "add-journal-empty")}
    </div>
  `;
}

function renderSchedules() {
  const selectedDay = sessionStorage.getItem("peru_schedule_day") || dayName();
  const schedules = state.schedules
    .filter((schedule) => (schedule.day || dayName(new Date(`${schedule.date}T00:00:00`))) === selectedDay)
    .slice()
    .sort((a, b) => `${a.startTime || ""}${a.endTime || ""}`.localeCompare(`${b.startTime || ""}${b.endTime || ""}`));

  return `
    ${pageHeader("Jadwal", "Jadwal mengajar", "Input sekali untuk pola jadwal mingguan. Berlaku sepanjang semester aktif.", `<button class="btn primary" id="add-schedule">${iconSvg("plus")} Tambah Jadwal</button>`)}
    <div class="card card-pad">
      <div class="toolbar">
        <select class="select" id="schedule-day-filter">
          ${weekDays.map((day) => `<option value="${day}" ${selectedDay === day ? "selected" : ""}>${day}</option>`).join("")}
        </select>
      </div>
      ${schedules.length ? `
        <div class="mobile-card-list">
          ${schedules.map((schedule) => `
            <article class="data-card">
              <div class="data-card-head"><span class="data-icon">${iconSvg("calendar")}</span><span class="badge">${escapeHtml(schedule.status || "Terjadwal")}</span></div>
              <h3>${escapeHtml(schedule.subject)}</h3>
              <p>${escapeHtml(className(schedule.classId))} - ${escapeHtml(schedule.room || "-")}</p>
              <div class="data-meta"><span>${escapeHtml(schedule.startTime)} - ${escapeHtml(schedule.endTime)}</span><span>${escapeHtml(schedule.day || selectedDay)}</span></div>
              <div class="row-actions"><button class="btn small outline" data-edit-schedule="${schedule.id}">Edit</button><button class="btn small danger" data-delete-schedule="${schedule.id}">Hapus</button></div>
            </article>
          `).join("")}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Jam</th><th>Mata pelajaran</th><th>Kelas</th><th>Ruang</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>${schedules.map((schedule) => `
            <tr>
              <td>${escapeHtml(schedule.startTime)} - ${escapeHtml(schedule.endTime)}</td>
              <td><strong>${escapeHtml(schedule.subject)}</strong><div class="list-meta">Setiap ${escapeHtml(schedule.day || selectedDay)}</div></td>
              <td>${escapeHtml(className(schedule.classId))}</td>
              <td>${escapeHtml(schedule.room || "-")}</td>
              <td><span class="badge ${schedule.status === "Berlangsung" ? "good" : "warn"}">${escapeHtml(schedule.status || "Terjadwal")}</span></td>
              <td><div class="row-actions"><button class="btn small outline" data-edit-schedule="${schedule.id}">Edit</button><button class="btn small danger" data-delete-schedule="${schedule.id}">Hapus</button></div></td>
            </tr>
          `).join("")}</tbody>
        </table></div>
      ` : empty("Belum ada jadwal pada hari ini. Tambahkan jadwal sekali, lalu jadwal ini berlaku sepanjang semester.", "Tambah Jadwal", "add-schedule-empty")}
    </div>
  `;
}

function renderRecaps() {
  const selectedClass = sessionStorage.getItem("peru_recap_class") || "";
  const selectedStudent = sessionStorage.getItem("peru_recap_student") || "";
  const type = sessionStorage.getItem("peru_recap_type") || "attendance-class";
  const effectiveClass = (type === "attendance-student" || type === "score-student") && !selectedClass ? state.classes[0]?.id || "" : selectedClass;
  return `
    ${pageHeader("Rekap", "Rekap sederhana", "Lihat ringkasan absensi, nilai, dan jurnal berdasarkan kelas.", "")}
    ${recapVisualStats(type, effectiveClass)}
    <div class="card card-pad">
      <div class="tabs">
        ${[
          ["attendance-class", "Absensi per kelas"],
          ["attendance-student", "Absensi per siswa"],
          ["score-class", "Nilai per kelas"],
          ["score-student", "Nilai per siswa"],
          ["journal", "Jurnal"]
        ].map(([id, label]) => `<button class="tab ${type === id ? "active" : ""}" data-recap-type="${id}">${label}</button>`).join("")}
      </div>
      <div class="toolbar">${recapFilters(type, effectiveClass, selectedStudent)}</div>
      <div class="toolbar export-toolbar"><button class="btn secondary" id="export-recap">${iconSvg("download")} Export Rekap</button></div>
      ${recapTable(type, effectiveClass, selectedStudent)}
    </div>
  `;
}

function recapFilters(type, selectedClass, selectedStudent) {
  const needsStudent = type === "attendance-student" || type === "score-student";
  const classValue = needsStudent && !selectedClass ? state.classes[0]?.id || "" : selectedClass;
  const students = studentsInClass(classValue);
  return `
    ${classSelect("recap-class-filter", classValue, needsStudent ? null : "Semua kelas")}
    ${needsStudent ? `
      <select class="select" id="recap-student-filter">
        ${students.map((student) => `<option value="${student.id}" ${selectedStudent === student.id ? "selected" : ""}>${escapeHtml(student.name)}</option>`).join("")}
      </select>
    ` : ""}
  `;
}

function recapVisualStats(type, classId) {
  const students = studentsInClass(classId);
  const records = state.attendanceRecords.filter((record) => students.some((student) => student.id === record.studentId));
  const present = records.filter((record) => record.status === "Hadir").length;
  const absent = records.filter((record) => ["Sakit", "Izin", "Alpha"].includes(record.status)).length;
  const late = records.filter((record) => record.status === "Terlambat").length;
  const scores = state.assessmentScores
    .filter((score) => students.some((student) => student.id === score.studentId) && score.score !== "")
    .map((score) => Number(score.score))
    .filter((score) => Number.isFinite(score));
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  const journals = state.journals.filter((journal) => !classId || journal.classId === classId).length;
  const totalAttendance = Math.max(1, present + absent + late);
  const bars = [
    ["Hadir", present, Math.round((present / totalAttendance) * 100), "green"],
    ["Perlu tindak lanjut", absent + late, Math.round(((absent + late) / totalAttendance) * 100), "orange"],
    ["Rata-rata nilai", average, Math.min(100, average), "blue"],
    ["Jurnal", journals, Math.min(100, journals * 12), "purple"]
  ];
  return `
    <div class="recap-visual-grid">
      <div class="recap-hero">
        <span class="soft-label">Statistik</span>
        <h2>${type.includes("score") ? "Performa nilai" : type === "journal" ? "Aktivitas jurnal" : "Kondisi kelas"}</h2>
        <p>Ringkasan visual otomatis dari data lokal yang sudah tersimpan.</p>
      </div>
      <div class="recap-metrics">
        ${bars.map(([label, value, percent, tone]) => `
          <div class="recap-metric ${tone}">
            <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
            <div class="recap-chart"><span class="recap-chart-fill" style="width:${Math.max(4, Math.min(100, percent))}%"></span></div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function recapTable(type, classId, studentId = "") {
  if (type === "journal") {
    const rows = state.journals.filter((journal) => !classId || journal.classId === classId);
    return rows.length ? tableFromRows(rows.map((journal) => ({ tanggal: journal.date, kelas: className(journal.classId), materi: journal.material, kegiatan: journal.activities }))) : `<div class="empty">Belum ada jurnal untuk direkap.</div>`;
  }
  if (type.startsWith("score")) {
    const targetStudent = studentId || studentsInClass(classId)[0]?.id || "";
    const source = type === "score-student" ? state.students.filter((student) => student.id === targetStudent) : studentsInClass(classId);
    const rows = source.map((student) => {
      const scores = state.assessmentScores.filter((score) => score.studentId === student.id && score.score !== "");
      const avg = scores.length ? Math.round(scores.reduce((sum, score) => sum + Number(score.score), 0) / scores.length) : "-";
      return { siswa: student.name, kelas: className(student.classId), jumlah_nilai: scores.length, rata_rata: avg };
    });
    return rows.length ? tableFromRows(rows) : `<div class="empty">Belum ada data nilai untuk direkap.</div>`;
  }
  const targetStudent = studentId || studentsInClass(classId)[0]?.id || "";
  const source = type === "attendance-student" ? state.students.filter((student) => student.id === targetStudent) : studentsInClass(classId);
  const rows = source.map((student) => {
    const records = state.attendanceRecords.filter((record) => record.studentId === student.id);
    const count = (status) => records.filter((record) => record.status === status).length;
    return { siswa: student.name, kelas: className(student.classId), hadir: count("Hadir"), sakit: count("Sakit"), izin: count("Izin"), alpha: count("Alpha"), terlambat: count("Terlambat") };
  });
  return rows.length ? tableFromRows(rows) : `<div class="empty">Belum ada data absensi untuk direkap.</div>`;
}

function tableFromRows(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return `
    <div class="mobile-card-list">
      ${rows.map((row) => `
        <article class="data-card">
          <div class="data-card-head"><span class="data-icon">${iconSvg("chart")}</span><span class="badge">${escapeHtml(row[headers[1]] || "Rekap")}</span></div>
          <h3>${escapeHtml(row[headers[0]])}</h3>
          <div class="status-grid">${headers.slice(2).map((h) => `<span>${escapeHtml(h.replaceAll("_", " "))} <strong>${escapeHtml(row[h])}</strong></span>`).join("")}</div>
        </article>
      `).join("")}
    </div>
    <div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h.replaceAll("_", " ")}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(row[h])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
  `;
}

function renderSettings() {
  const selectedQuick = new Set(state.settings.quickActionIds || defaultQuickActionIds);
  const selectedNav = new Set(state.settings.navIds || defaultVisibleNavIds);
  return `
    ${pageHeader("Pengaturan", "Tampilan dan data", "Atur tombol aksi cepat, menu navbar, backup data, restore data, dan reset lokal.", "")}
    <div class="grid two-col">
      <div class="card card-pad">
        <div class="section-title"><h2>Kartu aksi cepat</h2></div>
        <form id="display-settings-form" class="settings-list">
          ${quickActionItems.map(([id, icon, title, desc]) => `
            <label class="setting-toggle">
              <input type="checkbox" name="quickActionIds" value="${id}" ${selectedQuick.has(id) ? "checked" : ""}>
              <span class="nav-icon">${iconSvg(icon)}</span>
              <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(desc)}</small></span>
            </label>
          `).join("")}
          <div class="section-title settings-subtitle"><h2>Navbar</h2></div>
          ${navItems.filter(([id]) => id !== "logout").map(([id, icon, label]) => `
            <label class="setting-toggle">
              <input type="checkbox" name="navIds" value="${id}" ${selectedNav.has(id) ? "checked" : ""}>
              <span class="nav-icon">${iconSvg(icon)}</span>
              <span><strong>${escapeHtml(label)}</strong><small>Tampilkan di menu navigasi</small></span>
            </label>
          `).join("")}
          <div><button class="btn primary" type="submit">Simpan Tampilan</button></div>
        </form>
      </div>
      <div class="card card-pad">
        <div class="section-title"><h2>Backup data</h2></div>
        <div class="list">
          ${listItem("Export backup JSON", "Simpan semua data lokal ke file backup.", "Direkomendasikan rutin")}
          <button class="btn secondary" id="backup-json">Backup JSON</button>
          <button class="btn outline" id="restore-json">Restore JSON</button>
          <button class="btn danger" id="reset-data">Reset Data Lokal</button>
          <input class="hidden" type="file" id="restore-file" accept=".json,application/json">
        </div>
      </div>
    </div>
  `;
}

function profileModal() {
  openModal("Edit profil", `
    <div class="form-grid">
      <div class="photo-field full">
        <div class="student-photo preview" id="settings-photo-preview">${state.settings.photoData ? `<img src="${state.settings.photoData}" alt="Foto profil">` : photoPlaceholder(state.settings.teacherName || "G")}</div>
        <div>
          <label>Foto profil
            <input class="input" type="file" id="settings-photo-input" accept="image/*" capture="environment">
          </label>
          <input type="hidden" name="photoData" id="settings-photo-data" value="${escapeHtml(state.settings.photoData || "")}">
          <div class="form-hint">Foto otomatis dikompresi sebelum disimpan.</div>
        </div>
      </div>
      <label>Nama guru<input class="input" name="teacherName" value="${escapeHtml(state.settings.teacherName)}" required></label>
      <label>Nama sekolah<input class="input" name="schoolName" value="${escapeHtml(state.settings.schoolName)}"></label>
      <label>Mata pelajaran utama<input class="input" name="mainSubject" value="${escapeHtml(state.settings.mainSubject)}"></label>
      <label>Tahun ajaran aktif<input class="input" name="activeAcademicYear" value="${escapeHtml(state.settings.activeAcademicYear)}" required></label>
      <label>Semester aktif<select class="select" name="activeSemester"><option ${state.settings.activeSemester === "Ganjil" ? "selected" : ""}>Ganjil</option><option ${state.settings.activeSemester === "Genap" ? "selected" : ""}>Genap</option></select></label>
    </div>
  `, (data) => {
    state.settings = { ...state.settings, ...data };
    if (currentTeacher?.teacher) {
      currentTeacher.teacher.teacherName = data.teacherName;
      currentTeacher.teacher.schoolName = data.schoolName;
      localStorage.setItem(AUTH_KEY, JSON.stringify(currentTeacher));
    }
  });
  bindCompressedPhotoInput("#settings-photo-input", "#settings-photo-data", "#settings-photo-preview");
}

function empty(text, actionText, actionId) {
  return emptyState("plus", "Data belum tersedia", text, actionText, actionId);
}

function classSelect(id, selected = "", allLabel = null) {
  return `
    <select class="select" id="${id}">
      ${allLabel ? `<option value="">${allLabel}</option>` : ""}
      ${state.classes.map((item) => `<option value="${item.id}" ${selected === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
    </select>
  `;
}

function openModal(title, content, onSubmit) {
  document.querySelector(".modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header"><h2>${title}</h2><button class="close-btn" type="button">X</button></div>
      <form id="modal-form">
        <div class="modal-body">${content}</div>
        <div class="modal-footer"><button class="btn outline" type="button" id="cancel-modal">Batal</button><button class="btn primary" type="submit">Simpan</button></div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".close-btn").addEventListener("click", close);
  backdrop.querySelector("#cancel-modal").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  backdrop.querySelector("#modal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (onSubmit(data) === false) return;
    saveState();
    close();
    render();
    toast("Data tersimpan");
  });
}

function bindDashboard() {
  document.querySelector("#add-schedule-dashboard")?.addEventListener("click", () => scheduleModal({ day: dayName() }));
}

function bindSchedules() {
  document.querySelector("#schedule-day-filter")?.addEventListener("change", (event) => {
    sessionStorage.setItem("peru_schedule_day", event.target.value);
    render();
  });
  document.querySelector("#add-schedule")?.addEventListener("click", () => scheduleModal({ day: sessionStorage.getItem("peru_schedule_day") || dayName() }));
  document.querySelector("#add-schedule-empty")?.addEventListener("click", () => scheduleModal({ day: sessionStorage.getItem("peru_schedule_day") || dayName() }));
  document.querySelectorAll("[data-edit-schedule]").forEach((button) => button.addEventListener("click", () => scheduleModal(state.schedules.find((item) => item.id === button.dataset.editSchedule))));
  document.querySelectorAll("[data-delete-schedule]").forEach((button) => button.addEventListener("click", () => {
    if (!confirm("Hapus jadwal ini?")) return;
    state.schedules = state.schedules.filter((item) => item.id !== button.dataset.deleteSchedule);
    saveState(); render(); toast("Jadwal dihapus");
  }));
}

function scheduleModal(item = null) {
  const existing = item?.id ? item : null;
  openModal(existing ? "Edit jadwal" : "Tambah jadwal", `
    <div class="form-grid">
      <label>Hari<select class="select" name="day">${weekDays.map((day) => `<option value="${day}" ${(item?.day || dayName(item?.date ? new Date(`${item.date}T00:00:00`) : new Date())) === day ? "selected" : ""}>${day}</option>`).join("")}</select></label>
      <label>Kelas${classSelect("schedule-class-field", item?.classId || state.classes[0]?.id || "")}</label>
      ${timePicker("start", "Mulai (WIB)", item?.startTime || "07.00")}
      ${timePicker("end", "Selesai (WIB)", item?.endTime || "08.00")}
      <div class="form-hint full">Waktu selesai harus setelah waktu mulai.</div>
      <label>Mata pelajaran<input class="input" name="subject" value="${escapeHtml(item?.subject || state.settings.mainSubject || "")}" required></label>
      <label>Ruang<input class="input" name="room" value="${escapeHtml(item?.room || "")}" placeholder="Ruang kelas"></label>
      <label>Status<select class="select" name="status">${["Terjadwal", "Berlangsung", "Selesai", "Diganti"].map((status) => `<option ${item?.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
      <label class="full">Catatan<textarea class="textarea" name="notes">${escapeHtml(item?.notes || "")}</textarea></label>
    </div>
  `.replace('id="schedule-class-field"', 'id="schedule-class-field" name="classId"'), (data) => {
    data.startTime = `${data.startHour}.${data.startMinute}`;
    data.endTime = `${data.endHour}.${data.endMinute}`;
    if (timeToMinutes(data.endTime) <= timeToMinutes(data.startTime)) {
      alert("Waktu selesai harus setelah waktu mulai.");
      return false;
    }
    delete data.startHour;
    delete data.startMinute;
    delete data.endHour;
    delete data.endMinute;
    if (existing) Object.assign(existing, data);
    else state.schedules.push({ id: uid("sch"), ...data, createdAt: new Date().toISOString() });
    logActivity("calendar", `Jadwal ${data.subject} disimpan`, `Setiap ${data.day} - ${className(data.classId)}`);
  });
}

function bindClasses() {
  document.querySelector("#add-class")?.addEventListener("click", () => classModal());
  document.querySelector("#add-class-empty")?.addEventListener("click", () => classModal());
  document.querySelectorAll("[data-edit-class]").forEach((button) => button.addEventListener("click", () => classModal(state.classes.find((item) => item.id === button.dataset.editClass))));
  document.querySelectorAll("[data-delete-class]").forEach((button) => button.addEventListener("click", () => {
    if (studentsInClass(button.dataset.deleteClass).length) return alert("Kelas masih memiliki siswa. Pindahkan atau hapus siswa terlebih dahulu.");
    if (!confirm("Hapus kelas ini?")) return;
    state.classes = state.classes.filter((item) => item.id !== button.dataset.deleteClass);
    saveState(); render(); toast("Kelas dihapus");
  }));
}

function classModal(item = null) {
  openModal(item ? "Edit kelas" : "Tambah kelas", `
    <div class="form-grid">
      <label>Nama kelas<input class="input" name="name" value="${escapeHtml(item?.name || "")}" required placeholder="VII A"></label>
      <label>Tahun ajaran<input class="input" name="academicYear" value="${escapeHtml(item?.academicYear || state.settings.activeAcademicYear)}" required></label>
      <label>Mata pelajaran<input class="input" name="subject" value="${escapeHtml(item?.subject || state.settings.mainSubject)}"></label>
      <label class="full">Deskripsi<textarea class="textarea" name="description" placeholder="Opsional">${escapeHtml(item?.description || "")}</textarea></label>
    </div>
  `, (data) => {
    if (item) Object.assign(item, data);
    else state.classes.push({ id: uid("class"), ...data, createdAt: new Date().toISOString() });
  });
}

function bindStudents() {
  document.querySelector("#student-class-filter")?.addEventListener("change", (e) => { sessionStorage.setItem("peru_student_class", e.target.value); render(); });
  document.querySelector("#student-search")?.addEventListener("input", (e) => { sessionStorage.setItem("peru_student_query", e.target.value); render(); });
  document.querySelector("#add-student")?.addEventListener("click", () => studentModal());
  document.querySelector("#add-student-empty")?.addEventListener("click", () => studentModal());
  document.querySelector("#download-student-template")?.addEventListener("click", downloadStudentTemplate);
  document.querySelector("#export-students")?.addEventListener("click", exportStudents);
  document.querySelector("#import-students")?.addEventListener("click", () => document.querySelector("#student-import-file").click());
  document.querySelector("#student-import-file")?.addEventListener("change", importStudents);
  document.querySelectorAll("[data-edit-student]").forEach((button) => button.addEventListener("click", () => studentModal(state.students.find((item) => item.id === button.dataset.editStudent))));
  document.querySelectorAll("[data-delete-student]").forEach((button) => button.addEventListener("click", () => {
    if (!confirm("Hapus siswa ini?")) return;
    state.students = state.students.filter((item) => item.id !== button.dataset.deleteStudent);
    state.attendanceRecords = state.attendanceRecords.filter((item) => item.studentId !== button.dataset.deleteStudent);
    state.assessmentScores = state.assessmentScores.filter((item) => item.studentId !== button.dataset.deleteStudent);
    saveState(); render(); toast("Siswa dihapus");
  }));
}

function studentModal(item = null) {
  openModal(item ? "Edit siswa" : "Tambah siswa", `
    <div class="form-grid">
      <div class="photo-field full">
        <div class="student-photo preview" id="student-photo-preview">${item?.photoData ? `<img src="${item.photoData}" alt="Foto ${escapeHtml(item.name)}">` : photoPlaceholder(item?.name || "S")}</div>
        <div>
          <label>Foto siswa
            <input class="input" type="file" id="student-photo-input" accept="image/*" capture="environment">
          </label>
          <input type="hidden" name="photoData" id="student-photo-data" value="${escapeHtml(item?.photoData || "")}">
          <div class="form-hint">Foto otomatis dikompresi agar wajah tetap jelas dengan ukuran kecil.</div>
        </div>
      </div>
      <label>Nama siswa<input class="input" name="name" value="${escapeHtml(item?.name || "")}" required></label>
      <label>Kelas${classSelect("class-field", item?.classId || state.classes[0]?.id || "")}</label>
      <label>NIS/NISN<input class="input" name="nis" value="${escapeHtml(item?.nis || "")}"></label>
      <label>Jenis kelamin<select class="select" name="gender"><option value="">-</option><option ${item?.gender === "L" ? "selected" : ""}>L</option><option ${item?.gender === "P" ? "selected" : ""}>P</option></select></label>
      <label>Nomor HP orang tua<input class="input" name="parentPhone" value="${escapeHtml(item?.parentPhone || "")}"></label>
      <label class="full">Catatan khusus<textarea class="textarea" name="notes">${escapeHtml(item?.notes || "")}</textarea></label>
    </div>
  `.replace('id="class-field"', 'id="class-field" name="classId"'), (data) => {
    if (item) Object.assign(item, data);
    else state.students.push({ id: uid("student"), ...data, createdAt: new Date().toISOString() });
  });
  bindCompressedPhotoInput("#student-photo-input", "#student-photo-data", "#student-photo-preview");
}

function importStudents(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(reader.result);
    rows.forEach((row) => {
      let klass = state.classes.find((item) => item.name.toLowerCase() === (row.kelas || "").toLowerCase());
      if (!klass && row.kelas) {
        klass = { id: uid("class"), name: row.kelas, academicYear: state.settings.activeAcademicYear, subject: state.settings.mainSubject, description: "Dari import siswa", createdAt: new Date().toISOString() };
        state.classes.push(klass);
      }
      if (row.nama && klass) state.students.push({ id: uid("student"), classId: klass.id, name: row.nama, nis: row.nis || "", gender: row.jenis_kelamin || "", parentPhone: "", notes: row.catatan || "", createdAt: new Date().toISOString() });
    });
    saveState(); render(); toast("Import siswa selesai");
  };
  reader.readAsText(file);
}

function exportStudents() {
  downloadFile("peru-siswa.csv", toCsv(state.students.map((s) => ({ nama: s.name, nis: s.nis, jenis_kelamin: s.gender, kelas: className(s.classId), catatan: s.notes }))), "text/csv");
}

function downloadStudentTemplate() {
  downloadFile("template-import-siswa-peru.csv", toCsv([
    { nama: "Ahmad Fauzan", nis: "12345", jenis_kelamin: "L", kelas: "VII A", catatan: "Opsional" },
    { nama: "Siti Aminah", nis: "12346", jenis_kelamin: "P", kelas: "VII A", catatan: "" }
  ]), "text/csv");
}

function bindAttendance() {
  document.querySelector("#attendance-class")?.addEventListener("change", (e) => { sessionStorage.setItem("peru_attendance_class", e.target.value); render(); });
  document.querySelector("#attendance-date")?.addEventListener("change", (e) => { sessionStorage.setItem("peru_attendance_date", e.target.value); render(); });
  document.querySelector("#mark-all-present")?.addEventListener("click", () => document.querySelectorAll(".attendance-status").forEach((select) => { select.value = "Hadir"; }));
  document.querySelector("#goto-students")?.addEventListener("click", () => setRoute("students"));
  document.querySelector("#save-attendance")?.addEventListener("click", saveAttendance);
  document.querySelector("#export-attendance")?.addEventListener("click", exportAttendance);
}

function saveAttendance() {
  const classId = document.querySelector("#attendance-class").value;
  const date = document.querySelector("#attendance-date").value;
  if (!classId || !date) return alert("Kelas dan tanggal wajib diisi.");
  let session = state.attendanceSessions.find((item) => item.classId === classId && item.date === date);
  if (!session) {
    session = { id: uid("att"), classId, date, notes: "", createdAt: new Date().toISOString() };
    state.attendanceSessions.push(session);
  }
  state.attendanceRecords = state.attendanceRecords.filter((item) => item.sessionId !== session.id);
  document.querySelectorAll("[data-attendance-student]").forEach((row) => {
    state.attendanceRecords.push({ id: uid("attrec"), sessionId: session.id, studentId: row.dataset.attendanceStudent, status: row.querySelector(".attendance-status").value, notes: row.querySelector(".attendance-notes").value });
  });
  logActivity("check", `Absensi ${className(classId)} disimpan`, date);
  saveState(); render(); toast("Absensi tersimpan");
}

function exportAttendance() {
  const rows = state.attendanceRecords.map((record) => {
    const session = state.attendanceSessions.find((item) => item.id === record.sessionId);
    const student = state.students.find((item) => item.id === record.studentId);
    return { tanggal: session?.date, kelas: className(session?.classId), siswa: student?.name, status: record.status, catatan: record.notes };
  });
  downloadFile("peru-absensi.csv", toCsv(rows), "text/csv");
}

function bindAssessments() {
  document.querySelector("#assessment-class-filter")?.addEventListener("change", (e) => { sessionStorage.setItem("peru_assessment_class", e.target.value); render(); });
  document.querySelector("#add-assessment")?.addEventListener("click", () => assessmentModal());
  document.querySelector("#add-assessment-empty")?.addEventListener("click", () => assessmentModal());
  document.querySelector("#export-assessments")?.addEventListener("click", exportAssessments);
  document.querySelectorAll("[data-edit-assessment]").forEach((button) => button.addEventListener("click", () => assessmentModal(state.assessments.find((item) => item.id === button.dataset.editAssessment))));
  document.querySelectorAll("[data-delete-assessment]").forEach((button) => button.addEventListener("click", () => {
    if (!confirm("Hapus penilaian ini?")) return;
    state.assessments = state.assessments.filter((item) => item.id !== button.dataset.deleteAssessment);
    state.assessmentScores = state.assessmentScores.filter((item) => item.assessmentId !== button.dataset.deleteAssessment);
    saveState(); render(); toast("Penilaian dihapus");
  }));
}

function assessmentModal(item = null) {
  const classId = item?.classId || sessionStorage.getItem("peru_assessment_class") || state.classes[0]?.id || "";
  const students = studentsInClass(classId);
  openModal(item ? "Isi/Edit penilaian" : "Buat penilaian", `
    <div class="form-grid">
      <label>Nama penilaian<input class="input" name="title" value="${escapeHtml(item?.title || "")}" required placeholder="Tugas 1 Bilangan Bulat"></label>
      <label>Kelas${classSelect("assessment-class-field", classId)}</label>
      <label>Kategori<select class="select" name="category">${["Tugas", "Ulangan Harian", "Praktik", "Proyek", "PTS", "PAS", "Lainnya"].map((cat) => `<option ${item?.category === cat ? "selected" : ""}>${cat}</option>`).join("")}</select></label>
      <label>Tanggal<input class="input" type="date" name="date" value="${item?.date || today()}" required></label>
      <div class="full score-list">
        ${students.length ? students.map((student) => {
          const score = state.assessmentScores.find((s) => s.assessmentId === item?.id && s.studentId === student.id);
          return `<div class="student-input-row" data-score-student="${student.id}"><div><div class="student-name">${escapeHtml(student.name)}</div><div class="student-sub">${escapeHtml(student.nis || "")}</div></div><input class="input score-value" type="number" min="0" max="100" placeholder="0-100" value="${score?.score ?? ""}"><input class="input score-notes" placeholder="Catatan nilai" value="${escapeHtml(score?.notes || "")}"></div>`;
        }).join("") : `<div class="empty">Belum ada siswa di kelas ini.</div>`}
      </div>
    </div>
  `.replace('id="assessment-class-field"', 'id="assessment-class-field" name="classId"'), (data) => {
    let assessment = item;
    if (assessment) Object.assign(assessment, data);
    else {
      assessment = { id: uid("asm"), ...data, createdAt: new Date().toISOString() };
      state.assessments.push(assessment);
    }
    state.assessmentScores = state.assessmentScores.filter((score) => score.assessmentId !== assessment.id);
    document.querySelectorAll("[data-score-student]").forEach((row) => {
      const value = row.querySelector(".score-value").value;
      state.assessmentScores.push({ id: uid("score"), assessmentId: assessment.id, studentId: row.dataset.scoreStudent, score: value, notes: row.querySelector(".score-notes").value });
    });
    logActivity("score", `${data.title} disimpan`, `${data.date} - ${className(data.classId)}`);
  });
}

function exportAssessments() {
  const rows = state.assessmentScores.map((score) => {
    const assessment = state.assessments.find((item) => item.id === score.assessmentId);
    const student = state.students.find((item) => item.id === score.studentId);
    return { tanggal: assessment?.date, kelas: className(assessment?.classId), penilaian: assessment?.title, kategori: assessment?.category, siswa: student?.name, nilai: score.score, catatan: score.notes };
  });
  downloadFile("peru-nilai.csv", toCsv(rows), "text/csv");
}

function bindJournals() {
  document.querySelector("#journal-class-filter")?.addEventListener("change", (e) => { sessionStorage.setItem("peru_journal_class", e.target.value); render(); });
  document.querySelector("#journal-search")?.addEventListener("input", (e) => { sessionStorage.setItem("peru_journal_query", e.target.value); render(); });
  document.querySelector("#add-journal")?.addEventListener("click", () => journalModal());
  document.querySelector("#add-journal-empty")?.addEventListener("click", () => journalModal());
  document.querySelector("#export-journals")?.addEventListener("click", exportJournals);
  document.querySelectorAll("[data-edit-journal]").forEach((button) => button.addEventListener("click", () => journalModal(state.journals.find((item) => item.id === button.dataset.editJournal))));
  document.querySelectorAll("[data-delete-journal]").forEach((button) => button.addEventListener("click", () => {
    if (!confirm("Hapus jurnal ini?")) return;
    state.journals = state.journals.filter((item) => item.id !== button.dataset.deleteJournal);
    saveState(); render(); toast("Jurnal dihapus");
  }));
}

function journalModal(item = null) {
  openModal(item ? "Edit jurnal" : "Tulis jurnal", `
    <div class="form-grid">
      <label>Tanggal<input class="input" type="date" name="date" value="${item?.date || today()}" required></label>
      <label>Kelas${classSelect("journal-class-field", item?.classId || state.classes[0]?.id || "")}</label>
      <label>Mata pelajaran<input class="input" name="subject" value="${escapeHtml(item?.subject || classSubject(item?.classId || state.classes[0]?.id))}"></label>
      <label>Jam pelajaran<input class="input" name="lessonHours" value="${escapeHtml(item?.lessonHours || "")}" placeholder="Jam ke-1 sampai 2"></label>
      <label class="full">Materi<input class="input" name="material" value="${escapeHtml(item?.material || "")}" required placeholder="Materi yang diajarkan hari ini..."></label>
      <label class="full">Tujuan pembelajaran<textarea class="textarea" name="learningGoals" placeholder="Tujuan pembelajaran...">${escapeHtml(item?.learningGoals || "")}</textarea></label>
      <label class="full">Kegiatan pembelajaran<textarea class="textarea" name="activities" required placeholder="Kegiatan pembelajaran yang dilakukan...">${escapeHtml(item?.activities || "")}</textarea></label>
      <label class="full">Kendala<textarea class="textarea" name="obstacles" placeholder="Kendala yang muncul...">${escapeHtml(item?.obstacles || "")}</textarea></label>
      <label class="full">Tindak lanjut<textarea class="textarea" name="followUp" placeholder="Tindak lanjut untuk pertemuan berikutnya...">${escapeHtml(item?.followUp || "")}</textarea></label>
      <label class="full">Catatan tambahan<textarea class="textarea" name="notes">${escapeHtml(item?.notes || "")}</textarea></label>
    </div>
  `.replace('id="journal-class-field"', 'id="journal-class-field" name="classId"'), (data) => {
    if (item) Object.assign(item, data);
    else state.journals.push({ id: uid("journal"), ...data, createdAt: new Date().toISOString() });
    logActivity("journal", `${data.material} disimpan`, `${data.date} - ${className(data.classId)}`);
  });
}

function exportJournals() {
  downloadFile("peru-jurnal.csv", toCsv(state.journals.map((j) => ({ tanggal: j.date, kelas: className(j.classId), mapel: j.subject, jam: j.lessonHours, materi: j.material, kegiatan: j.activities, kendala: j.obstacles, tindak_lanjut: j.followUp, catatan: j.notes }))), "text/csv");
}

function bindRecaps() {
  document.querySelectorAll("[data-recap-type]").forEach((button) => button.addEventListener("click", () => { sessionStorage.setItem("peru_recap_type", button.dataset.recapType); sessionStorage.removeItem("peru_recap_student"); render(); }));
  document.querySelector("#recap-class-filter")?.addEventListener("change", (e) => { sessionStorage.setItem("peru_recap_class", e.target.value); sessionStorage.removeItem("peru_recap_student"); render(); });
  document.querySelector("#recap-student-filter")?.addEventListener("change", (e) => { sessionStorage.setItem("peru_recap_student", e.target.value); render(); });
  document.querySelector("#export-recap")?.addEventListener("click", () => {
    const type = sessionStorage.getItem("peru_recap_type") || "attendance-class";
    const needsStudent = type === "attendance-student" || type === "score-student";
    const classId = sessionStorage.getItem("peru_recap_class") || (needsStudent ? state.classes[0]?.id || "" : "");
    const studentId = sessionStorage.getItem("peru_recap_student") || "";
    const temp = document.createElement("div");
    temp.innerHTML = recapTable(type, classId, studentId);
    const headers = [...temp.querySelectorAll("th")].map((th) => th.textContent.trim().replaceAll(" ", "_"));
    const rows = [...temp.querySelectorAll("tbody tr")].map((tr) => Object.fromEntries([...tr.children].map((td, i) => [headers[i], td.textContent.trim()])));
    downloadFile(`peru-rekap-${type}.csv`, toCsv(rows), "text/csv");
  });
}

function bindSettings() {
  document.querySelector("#display-settings-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.settings = {
      ...state.settings,
      quickActionIds: data.getAll("quickActionIds"),
      navIds: data.getAll("navIds")
    };
    saveState(); render(); toast("Pengaturan tersimpan");
  });
  document.querySelector("#backup-json")?.addEventListener("click", () => downloadFile(`peru-backup-${today()}.json`, JSON.stringify(state, null, 2), "application/json"));
  document.querySelector("#restore-json")?.addEventListener("click", () => document.querySelector("#restore-file").click());
  document.querySelector("#restore-file")?.addEventListener("change", restoreJson);
  document.querySelector("#reset-data")?.addEventListener("click", () => {
    if (!confirm("Reset semua data lokal? Tindakan ini tidak bisa dibatalkan tanpa backup.")) return;
    state = structuredClone(seedState);
    saveState(); render(); toast("Data lokal direset");
  });
}

function restoreJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = hydrateState(JSON.parse(reader.result));
      saveState(); render(); toast("Restore data selesai");
    } catch {
      alert("File backup tidak valid.");
    }
  };
  reader.readAsText(file);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

async function init() {
  await loadBackendState();
  render();
}

init();

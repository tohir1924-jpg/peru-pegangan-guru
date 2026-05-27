const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const sandbox = {
  console,
  structuredClone,
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { hash: "" },
  window: { addEventListener: () => {}, clearTimeout: () => {}, setTimeout: () => {} },
  navigator: {},
  document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => ({ innerHTML: "" }) },
  setTimeout: () => {},
  fetch: async () => ({ ok: true, json: async () => ({}) })
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const html = sandbox.renderDashboard();

assert(!html.includes("stats-grid"), "dashboard should not render the statistics grid");
assert(!html.includes("Absensi Hari Ini"), "dashboard should hide today's attendance card");
assert(!html.includes("Jurnal Bulan Ini"), "dashboard should hide this month's journal card");

assert(html.includes('class="grid dashboard-grid"'), "dashboard should keep the two-column work grid");
assert(html.includes('class="card card-pad activity-wide"'), "latest activity should render as a full-width lower card");

const gridMatch = html.match(/<div class="grid dashboard-grid">([\s\S]*?)<\/div>\s*<div class="card card-pad activity-wide">/);
assert(gridMatch, "latest activity should be outside and below the dashboard grid");
assert(gridMatch[1].includes("Jadwal Hari Ini"), "dashboard grid should include today's schedule");
assert(gridMatch[1].includes("Siswa perlu dipantau"), "dashboard grid should include monitored students");
assert(!gridMatch[1].includes("Aktivitas Terbaru"), "dashboard grid should not include latest activity");

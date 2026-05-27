const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const appNode = { innerHTML: "" };
const sandbox = {
  console,
  structuredClone,
  localStorage: { getItem: () => null, setItem: () => {} },
  sessionStorage: { getItem: () => "", setItem: () => {} },
  location: { hash: "" },
  window: { addEventListener: () => {}, clearTimeout: () => {}, setTimeout: () => {} },
  navigator: {},
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => appNode
  },
  setTimeout: () => {},
  fetch: async () => ({ ok: true, json: async () => ({}) })
};

vm.createContext(sandbox);
vm.runInContext(appSource, sandbox);
sandbox.render();

assert(appNode.innerHTML.includes("mobile-menu-toggle"), "mobile header should include a menu button");
assert(appNode.innerHTML.includes("mobile-drawer"), "mobile layout should include a drawer menu");
assert(appNode.innerHTML.indexOf("mobile-menu-toggle") < appNode.innerHTML.indexOf("mobile-brand"), "mobile menu button should appear before the logo");
assert(appNode.innerHTML.includes('data-route="schedules"'), "mobile drawer should expose the schedule page");
assert(appNode.innerHTML.includes('data-route="recaps"'), "mobile drawer should expose the recap page");
assert(appNode.innerHTML.includes('data-route="settings"'), "mobile drawer should expose the settings page");

assert(cssSource.includes(".mobile-drawer-backdrop.open"), "CSS should provide an opened mobile drawer state");
assert(!cssSource.includes(".route-dashboard .dashboard-grid > .card:nth-child(2) .list {\n    grid-template-columns: repeat(3"), "mobile attention list should not use a horizontal three-column scroller");
assert(cssSource.includes(".route-dashboard .dashboard-grid > .card .list"), "mobile dashboard card lists should have a single-column mobile rule");
assert(!appSource.includes("mobile-secondary-nav"), "page headers should not render secondary Rekap/Pengaturan buttons");

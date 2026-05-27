const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

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
    getElementById: () => ({ innerHTML: "" }),
    createElement: () => ({
      innerHTML: "",
      className: "",
      remove: () => {},
      addEventListener: () => {},
      querySelector: () => ({ addEventListener: () => {} }),
      querySelectorAll: () => []
    }),
    body: { appendChild: () => {} }
  },
  setTimeout: () => {},
  fetch: async () => ({ ok: true, json: async () => ({}) })
};

vm.createContext(sandbox);
vm.runInContext(appSource, sandbox);

assert(cssSource.includes(".topbar") && cssSource.includes("position: sticky"), "page header should stay visible while scrolling");
assert(cssSource.includes(".mobile-app-header") && cssSource.includes("position: sticky"), "mobile header should stay visible while scrolling");

const studentModalSource = sandbox.studentModal.toString();
assert(studentModalSource.includes('accept="image/*"'), "student form should accept image uploads");
assert(studentModalSource.includes('capture="environment"'), "student form should support camera capture");
assert(studentModalSource.includes("student-photo-data"), "student form should store compressed photo data");
assert(appSource.includes("compressImage"), "app should include image compression before storing photos");
assert(appSource.includes("maxSize = 420"), "image compression should cap dimensions for small stored photos");

const settingsHtml = sandbox.renderSettings();
assert(settingsHtml.includes('accept="image/*"'), "settings should support profile image upload");
assert(settingsHtml.includes('capture="environment"'), "settings should support camera capture");
assert(settingsHtml.includes("settings-photo-data"), "settings should store compressed profile photo data");

const recapHtml = sandbox.renderRecaps();
assert(recapHtml.includes("recap-visual-grid"), "recap should render a visual statistics section");
assert(recapHtml.includes("recap-chart"), "recap should include modern chart visuals");
assert(cssSource.includes(".recap-chart-fill"), "recap chart CSS should be present");

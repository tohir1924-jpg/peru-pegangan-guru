const assert = require("assert");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

assert(!css.includes("radial-gradient"), "visual refresh should avoid decorative radial background orbs");
assert(!css.includes(".card:nth-of-type(4n + 1)"), "cards should not use rotating gradient color treatments");
assert(css.includes("--bg: #f6f7f9"), "visual refresh should use the updated neutral app background");
assert(css.includes("--radius: 14px"), "visual refresh should use tighter, cleaner card radius tokens");
assert(css.includes(".mobile-drawer-backdrop.open"), "mobile drawer styling should remain available");

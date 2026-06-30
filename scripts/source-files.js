// Single source of truth for the front-end / Electron source files that make
// up the app. build-mac-app.js copies these into the packaged .app bundle, and
// check.js syntax-checks the JavaScript among them. Add a new module here once
// and both the bundle and the check pick it up automatically.
const sourceFiles = [
  "main.js",
  "preload.js",
  "index.html",
  "styles.css",
  "app.js",
  "diff-engine.js",
];

module.exports = { sourceFiles };

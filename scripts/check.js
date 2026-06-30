// Syntax-checks every JavaScript source file. The bundled file list comes from
// source-files.js so it never drifts from what build-mac-app.js packages.
const { execFileSync } = require("child_process");
const path = require("path");
const { sourceFiles } = require("./source-files");

const rootDir = path.resolve(__dirname, "..");
const buildScripts = [
  "scripts/source-files.js",
  "scripts/check.js",
  "scripts/build-mac-app.js",
];
const filesToCheck = sourceFiles
  .filter((fileName) => fileName.endsWith(".js"))
  .concat(buildScripts);

filesToCheck.forEach((fileName) => {
  execFileSync("node", ["--check", path.join(rootDir, fileName)], {
    stdio: "inherit",
  });
});

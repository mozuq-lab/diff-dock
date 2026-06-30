const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const productName = packageJson.productName || packageJson.name;
const appName = `${productName}.app`;
const bundleId = "com.local.diffdock";

const electronAppPath = path.join(
  rootDir,
  "node_modules",
  "electron",
  "dist",
  "Electron.app"
);
const outDir = path.join(rootDir, "out", "mac");
const outAppPath = path.join(outDir, appName);
const outContentsPath = path.join(outAppPath, "Contents");
const outMacOSPath = path.join(outContentsPath, "MacOS");
const outResourcesPath = path.join(outContentsPath, "Resources");
const bundledAppPath = path.join(outResourcesPath, "app");
const iconSourceCandidates = [
  path.join(rootDir, "assets", "icon-transparent.png"),
  path.join(rootDir, "assets", "icon.png"),
];
const iconSourcePath = iconSourceCandidates.find((candidatePath) =>
  fs.existsSync(candidatePath)
);
const iconsetPath = path.join(outDir, `${productName}.iconset`);
const icnsPath = path.join(outResourcesPath, `${productName}.icns`);
const electronIcnsPath = path.join(outResourcesPath, "electron.icns");
const plistPath = path.join(outContentsPath, "Info.plist");
const sourceFiles = [
  "main.js",
  "preload.js",
  "index.html",
  "styles.css",
  "app.js",
  "diff-engine.js",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function ensureExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    fail(message);
  }
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function runQuiet(command, args) {
  execFileSync(command, args, { stdio: "ignore" });
}

function setPlistValue(key, value) {
  const command = `/usr/libexec/PlistBuddy`;
  const setArgs = ["-c", `Set :${key} ${value}`, plistPath];
  const addArgs = ["-c", `Add :${key} string ${value}`, plistPath];

  try {
    execFileSync(command, setArgs, { stdio: "ignore" });
  } catch (error) {
    execFileSync(command, addArgs, { stdio: "ignore" });
  }
}

function copyAppSources() {
  fs.mkdirSync(bundledAppPath, { recursive: true });

  const bundledPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    productName,
    main: packageJson.main,
    private: true,
  };

  fs.writeFileSync(
    path.join(bundledAppPath, "package.json"),
    `${JSON.stringify(bundledPackageJson, null, 2)}\n`
  );

  sourceFiles.forEach((fileName) => {
    fs.copyFileSync(
      path.join(rootDir, fileName),
      path.join(bundledAppPath, fileName)
    );
  });

  fs.cpSync(path.join(rootDir, "assets"), path.join(bundledAppPath, "assets"), {
    recursive: true,
  });
}

function createIcns() {
  if (!iconSourcePath) {
    fail(
      `Missing app icon. Expected one of: ${iconSourceCandidates
        .map((candidatePath) => path.relative(rootDir, candidatePath))
        .join(", ")}`
    );
  }

  fs.rmSync(iconsetPath, { recursive: true, force: true });
  fs.mkdirSync(iconsetPath, { recursive: true });

  [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ].forEach(([fileName, size]) => {
    runQuiet("sips", [
      "--resampleHeightWidth",
      String(size),
      String(size),
      iconSourcePath,
      "--out",
      path.join(iconsetPath, fileName),
    ]);
  });

  run("iconutil", ["-c", "icns", "-o", icnsPath, iconsetPath]);
  fs.copyFileSync(icnsPath, electronIcnsPath);
  fs.rmSync(iconsetPath, { recursive: true, force: true });
}

function updateBundleMetadata() {
  const originalExecutablePath = path.join(outMacOSPath, "Electron");
  const brandedExecutablePath = path.join(outMacOSPath, productName);

  if (fs.existsSync(originalExecutablePath)) {
    fs.renameSync(originalExecutablePath, brandedExecutablePath);
  }

  setPlistValue("CFBundleDisplayName", productName);
  setPlistValue("CFBundleExecutable", productName);
  setPlistValue("CFBundleIdentifier", bundleId);
  setPlistValue("CFBundleIconFile", productName);
  setPlistValue("CFBundleName", productName);
  setPlistValue("CFBundleShortVersionString", packageJson.version);
  setPlistValue("CFBundleVersion", packageJson.version);
}

function signBundle() {
  try {
    run("codesign", ["--force", "--deep", "--sign", "-", outAppPath]);
  } catch (error) {
    console.warn(
      "codesign failed; the .app was created but may not launch by double-click."
    );
  }
}

function touchBundle() {
  const now = new Date();

  fs.utimesSync(outAppPath, now, now);
}

function build() {
  ensureExists(
    electronAppPath,
    "Electron is not installed. Run `npm install` before building the app bundle."
  );

  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(outAppPath, { recursive: true, force: true });
  run("ditto", [electronAppPath, outAppPath]);

  copyAppSources();
  createIcns();
  updateBundleMetadata();
  signBundle();
  touchBundle();

  console.log(`Created ${path.relative(rootDir, outAppPath)}`);
}

build();

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const appIconPath = path.join(__dirname, "assets", "icon.png");

ipcMain.handle("diffdock:save-export", async (event, payload) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const dialogResult = await dialog.showSaveDialog(senderWindow, {
    defaultPath:
      payload && payload.fileName ? payload.fileName : "diffdock-export.txt",
  });

  if (dialogResult.canceled || !dialogResult.filePath) {
    return { status: "canceled" };
  }

  try {
    await fs.writeFile(dialogResult.filePath, (payload && payload.content) || "", "utf8");
    return { status: "saved", filePath: dialogResult.filePath };
  } catch (error) {
    return { status: "error", message: error.message };
  }
});

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: "DiffDock",
    icon: appIconPath,
    backgroundColor: "#eef0f3",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
    }
  });
}

app.setName("DiffDock");

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(appIconPath);
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("diffDockRuntime", {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
  },
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("diffDockRuntime", {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
  },
  saveExport: function (payload) {
    return ipcRenderer.invoke("diffdock:save-export", payload);
  },
});

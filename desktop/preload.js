const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('scopeDesktop', {
  isDesktop: true,
  saveBackup: (json) => ipcRenderer.invoke('bk:save', json),
  info: () => ipcRenderer.invoke('bk:info'),
  latest: () => ipcRenderer.invoke('bk:latest'),
  chooseFolder: () => ipcRenderer.invoke('bk:choose'),
  pickRestore: () => ipcRenderer.invoke('bk:pick'),
  openFolder: () => ipcRenderer.invoke('bk:open')
});

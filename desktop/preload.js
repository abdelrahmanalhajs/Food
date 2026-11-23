const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('scopeDesktop', {
  isDesktop: true,
  saveBackup: (json) => ipcRenderer.invoke('bk:save', json),
  info: () => ipcRenderer.invoke('bk:info'),
  latest: () => ipcRenderer.invoke('bk:latest'),
  chooseFolder: () => ipcRenderer.invoke('bk:choose'),
  pickRestore: () => ipcRenderer.invoke('bk:pick'),
  openFolder: () => ipcRenderer.invoke('bk:open'),
  encStatus: () => ipcRenderer.invoke('bk:encstatus'),
  setBackupPassword: (pw) => ipcRenderer.invoke('bk:setpw', pw),
  checkBackupPassword: (pw) => ipcRenderer.invoke('bk:checkpw', pw),
  decrypt: (raw, pw) => ipcRenderer.invoke('bk:decrypt', raw, pw),
  licStatus: () => ipcRenderer.invoke('lic:status'),
  activate: (code) => ipcRenderer.invoke('lic:activate', code)
});

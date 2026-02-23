const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  onKey: (callback) => {
    ipcRenderer.on('ktrl-key', (_, id, state) => callback({ id, state }))
  },
  getMenu: () => ipcRenderer.invoke('get-menu'),
  getIcon: (id) => ipcRenderer.invoke('get-icon', id),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
})

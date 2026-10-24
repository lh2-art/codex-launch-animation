const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexLauncher', {
  getMode: () => ipcRenderer.invoke('launcher:getMode'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getSkinVeil: () => ipcRenderer.invoke('skin-veil:get'),
  setSkinVeil: (patch) => ipcRenderer.invoke('skin-veil:set', patch),
  setAutoPlay: (enabled) => ipcRenderer.invoke('settings:setAutoPlay', Boolean(enabled)),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  openSettings: () => ipcRenderer.send('launcher:openSettings'),
  openPreview: () => ipcRenderer.send('launcher:openPreview'),
  // 覆盖层按 ChatGPT 实际大小就位后再开播
  onOverlayReady: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('launcher:overlayReady', listener);
    return () => ipcRenderer.removeListener('launcher:overlayReady', listener);
  },
  // 渲染层就绪后主动查询，避免错过已发出的信号
  rendererReady: () => ipcRenderer.invoke('launcher:rendererReady'),
  getBounds: () => ipcRenderer.invoke('launcher:getBounds'),
  videoVisible: () => ipcRenderer.invoke('launcher:videoVisible'),
  waitForAppReady: () => ipcRenderer.invoke('launcher:waitForAppReady'),
  animationComplete: () => ipcRenderer.send('launcher:animationComplete'),
  closeOverlay: () => ipcRenderer.send('launcher:close')
});

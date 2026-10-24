'use strict';
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Model = require('./settings-model.js');
const skinVeil=require('./skin-veil.cjs').createSkinVeilStore();
const { runNative } = require('./native-launch.cjs');
const args = new Set(process.argv.slice(1));
const mode = args.has('--settings') ? 'settings' : args.has('--preview') ? 'preview' : 'native';
app.setName('codex-launcher');
app.setPath('userData', process.env.CODEX_LAUNCHER_TEST_DATA || path.join(app.getPath('appData'),'codex-launcher'));
if(mode==='native')app.disableHardwareAcceleration();
let settingsWindow, previewWindow, launching = false;
function log(event, data={}) {
  try { fs.mkdirSync(app.getPath('userData'),{recursive:true}); fs.appendFileSync(path.join(app.getPath('userData'),'runtime.log'),JSON.stringify({at:new Date().toISOString(),event,...data})+'\n'); } catch {}
}
function readSettings() { try{return Model.normalize(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'settings.json'),'utf8')));}catch{return Model.normalize();} }
function updateSettings(patch) {
  const settings=Model.merge(readSettings(),patch), directory=app.getPath('userData');
  fs.mkdirSync(directory,{recursive:true}); const temp=path.join(directory,'settings-'+process.pid+'.tmp');
  fs.writeFileSync(temp,JSON.stringify(settings,null,2)); fs.renameSync(temp,path.join(directory,'settings.json')); return settings;
}
function createSettings() {
  if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.show();settingsWindow.focus();return;}
  settingsWindow=new BrowserWindow({width:1280,height:840,minWidth:900,minHeight:640,show:false,title:'ChatGPT 启动动画 · 控制台',backgroundColor:'#f7f7f8',autoHideMenuBar:true,icon:path.join(__dirname,'assets/chatgpt-shortcut-icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}});
  settingsWindow.launcherMode='settings';
  settingsWindow.loadFile(path.join(__dirname,'settings.html')).then(()=>{settingsWindow?.show();log('settings-shown');}).catch(error=>log('settings-error',{message:error.message}));
  settingsWindow.on('closed',()=>{settingsWindow=undefined;});
}
function createPreview() {
  if(previewWindow&&!previewWindow.isDestroyed()){previewWindow.show();previewWindow.focus();return;}
  // Manual fallback preview is a normal framed window, never a desktop overlay.
  previewWindow=new BrowserWindow({width:1100,height:700,show:false,title:'ChatGPT 启动动画预览',backgroundColor:'#f7f7f8',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  previewWindow.launcherMode='preview';
  previewWindow.loadFile(path.join(__dirname,'index.html'),{query:{mode:'preview'}}).catch(error=>log('preview-error',{message:error.message}));
  previewWindow.on('closed',()=>{previewWindow=undefined;});
}
function sender(event){return BrowserWindow.fromWebContents(event.sender);}
ipcMain.handle('launcher:getMode',event=>sender(event)?.launcherMode||mode);
ipcMain.handle('settings:get',readSettings);
ipcMain.handle('skin-veil:get',()=>skinVeil.read());
ipcMain.handle('skin-veil:set',(_event,patch)=>skinVeil.update(patch));
ipcMain.handle('settings:update',(_event,patch)=>updateSettings(patch));
ipcMain.handle('settings:setAutoPlay',(_event,autoPlay)=>updateSettings({autoPlay:Boolean(autoPlay)}));
ipcMain.handle('settings:reset',()=>{const current=readSettings();return updateSettings(Model.normalize({autoPlay:current.autoPlay,uiLanguage:current.uiLanguage}));});
ipcMain.handle('launcher:getBounds',()=>null);
ipcMain.handle('launcher:videoVisible',()=>{});
ipcMain.handle('launcher:rendererReady',event=>{
  if(sender(event)!==previewWindow)return false;
  previewWindow.show();previewWindow.webContents.send('launcher:overlayReady');return true;
});
ipcMain.handle('launcher:waitForAppReady',()=>true);
ipcMain.on('launcher:animationComplete',event=>sender(event)?.close());
ipcMain.on('launcher:close',event=>sender(event)?.close());
ipcMain.on('launcher:openSettings',createSettings);
ipcMain.on('launcher:openPreview',createPreview);
async function launch() {
  if(launching)return;
  launching=true; log('native-launch-start',{openingWindowLimit:0,videoExternalWindows:0,opaque:true,windowFollowing:false});
  try{await runNative(__dirname,app.getPath('userData'),log);}
  catch(error){log('launch-error',{message:error.message});}
  finally{launching=false;if(!settingsWindow&&!previewWindow)app.quit();}
}
if(!app.requestSingleInstanceLock({mode}))app.quit();
else {
  app.on('second-instance',(_event,argv)=>app.whenReady().then(()=>{
    if(argv.includes('--settings'))createSettings();
    else if(argv.includes('--preview'))createPreview();
    else launch();
  }));
  app.whenReady().then(()=>{
    Menu.setApplicationMenu(null);
    if(mode==='settings')createSettings();
    else if(mode==='preview')createPreview();
    else launch();
  });
  app.on('window-all-closed',()=>{if(!launching)app.quit();});
}

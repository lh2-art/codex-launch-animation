'use strict';
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const directory=process.env.CODEX_CDP_FIXTURE_DIR;
fs.mkdirSync(path.join(directory,'profile'),{recursive:true});
app.setPath('userData',path.join(directory,'profile'));
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.whenReady().then(async()=>{
  protocol.handle('app',()=>new Response('<!doctype html><html><head><meta charset="utf-8"><title>Native app fixture</title></head><body style="margin:0;background:rgb(240,240,240)"><header id="native-titlebar" style="height:46px;-webkit-app-region:drag">Native title bar</header><main id="root"><h1>Native loading interface</h1><input id="original-input" value="preserve-me"></main></body></html>',{headers:{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; frame-src 'self'"}}));
  const visible=process.env.CODEX_CDP_VISIBLE==='1';
  const window=new BrowserWindow({show:visible,x:100,y:100,width:1100,height:700,titleBarStyle:'hidden',titleBarOverlay:{color:'#00000000',symbolColor:'#ffffff',height:36},webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:process.env.CODEX_CDP_THROTTLE==='1',offscreen:!visible}});
  const auxiliary=process.env.CODEX_CDP_HIDDEN_AUX==='1'?new BrowserWindow({show:false,width:300,height:200,resizable:false}):null;
  const loadDelay=process.env.CODEX_CDP_DELAY==='1'?6500:Number(process.env.CODEX_CDP_DELAY)||0;
  if(loadDelay)await new Promise(resolve=>setTimeout(resolve,loadDelay));
  await window.loadURL('app://-/index.html');
  fs.writeFileSync(path.join(directory,'ready.json'),JSON.stringify({ready:true,pid:process.pid,handle:window.getNativeWindowHandle().readBigUInt64LE().toString(),auxiliaryHandle:auxiliary?.getNativeWindowHandle().readBigUInt64LE().toString(),bounds:window.getBounds()}));
  let command='';
  setInterval(()=>{
    const file=path.join(directory,'command.txt');
    if(fs.existsSync(file)){
      const next=fs.readFileSync(file,'utf8');
      if(next!==command){command=next;if(next==='quit')app.quit();else if(next==='resize')window.setSize(800,700);else if(next==='capture')window.webContents.capturePage().then(image=>fs.writeFileSync(path.join(directory,'native-animation.png'),image.toPNG()));}
    }
  },80);
  setTimeout(()=>app.quit(),90000);
});

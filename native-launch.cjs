'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { BoundsClient: PlatformClient } = require('./helper-client.cjs');
const { injectAnimation, buildNativePayload } = require('./native-renderer.cjs');
const Model = require('./settings-model.js');
const {powerShell}=require('./platform-runtime.cjs');
const {readSkinConfig,runSkinNative}=require('./skin-launch.cjs');
const APP_ID = 'OpenAI.Codex_2p2nqsd0c76g0!App';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function openNative() {
  const child = spawn('explorer.exe', [`shell:AppsFolder\\${APP_ID}`], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); child.unref();
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function runNative(root, directory, log = () => {}, options = {}) {
  const skin=readSkinConfig(root);
  if(skin)return runSkinNative(root,directory,skin,log,options);
  let settings;
  try { settings=Model.normalize(JSON.parse(fs.readFileSync(path.join(directory,'settings.json'),'utf8'))); }
  catch { settings=Model.normalize(); }
  if(!settings.autoPlay){openNative();log('native-direct-disabled');return;}
  const helper=new PlatformClient(powerShell(),path.join(root,'native-platform.ps1'),{initTimeout:12000,queryTimeout:15000});
  let client,launched=false;
  const launchClock=Date.now();
  let stage='inspect';
  try {
    const existing=await helper.request('e');
    if(existing.ok && existing.running.length){openNative();log('native-existing-instance-focused',{elapsedMs:Date.now()-launchClock,fastPath:true});return;}
    const app=await helper.request('i');
    if(!app.ok)throw Error(app.message);
    if(app.running.length){openNative();log('native-existing-instance-focused');return;}
    // Prepare bytes before activating the cold app, so file I/O and Base64
    // conversion do not compete with its first renderer frames.
    stage='assets';
    const preparedMedia=await fs.promises.readFile(path.join(root,'assets/gpt6-stars-full.mp4'));
    if(preparedMedia.length>24*1024*1024)throw Error('Native animation media exceeds limit');
    const encodedMedia=preparedMedia.toString('base64');
    const preparedPayload=buildNativePayload(root,settings,{compositorRotation:true});
    const assetsReadyMs=Date.now()-launchClock;
    const port=await freePort();
    stage='activation';
    log('native-package-activation-requested',{openingWindows:0,opaque:true});
    const activation=await helper.request('l '+port);
    if(!activation.ok)throw Error(activation.message||'Native package activation failed');
    launched=true;
    log('native-process-started',{pid:activation.pid,elapsedMs:Date.now()-launchClock,processStartedAt:activation.startedAt,waitedForOpening:false,activation:activation.activation});
    const {mainTarget,socketUrl,attach}=await import('./native-cdp.mjs');
    stage='target';
    const targetClock=Date.now();
    const deadline=Date.now()+15000;
    let targets;
    while(Date.now()<deadline){
      try {
        const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000),redirect:'error'});
        if(response.ok){targets=(await response.json()).filter(mainTarget);if(targets.length===1)break;}
      }catch{}
      await delay(100);
    }
    if(targets?.length!==1)throw Error('No unique native main page before startup deadline');
    const targetWaitMs=Date.now()-targetClock;
    stage='verification';
    const verificationClock=Date.now();
    const identity=await helper.request('v '+port);
    if(!identity.ok||!identity.verified)throw Error(identity.message||'Native listener verification failed');
    client=await attach(socketUrl(targets[0].webSocketDebuggerUrl,port));
    const verificationMs=Date.now()-verificationClock;
    stage='renderer';
    const result=await injectAnimation(client,root,settings,{preparedMedia,encodedMedia,preparedPayload,onProgress:value=>{stage=value;}});
    try{const icon=await helper.request('k '+activation.pid);log('native-window-icon',{pid:activation.pid,...icon})}catch(error){log('native-window-icon-warning',{message:error.message})}
    log('native-animation-prepared',{...result,version:app.version,openingWindows:0,videoExternalWindows:0,opaque:true,cameraSeconds:3.2,rotationSeconds:5,assetsReadyMs,targetWaitMs,verificationMs,elapsedMs:Date.now()-launchClock});
  }catch(error){
    log('native-animation-fallback',{message:error.message,stage,elapsedMs:Date.now()-launchClock});
    if(!launched)openNative();
  }finally{helper.dispose();client?.close();}
}
module.exports = { runNative, openNative };

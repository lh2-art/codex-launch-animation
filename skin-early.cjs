'use strict';
const fs=require('node:fs'),path=require('node:path');
const {buildNativePayload,injectAnimation}=require('./native-renderer.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.win32.normalize(a).toLowerCase()===path.win32.normalize(b).toLowerCase();
function sameStoreFamily(previous,current){
 const pattern=/^(.*\\WindowsApps\\)OpenAI\.Codex_\d+(?:\.\d+){3}_(x64|arm64)__2p2nqsd0c76g0\\app\\ChatGPT\.exe$/i;
 const a=typeof previous==='string'&&path.win32.normalize(previous).match(pattern),b=typeof current==='string'&&path.win32.normalize(current).match(pattern);
 // The caller has verified the current registered package and signature via
 // helper 'i'. Only an update within the same Store family can reuse this profile.
 return Boolean(a&&b&&same(a[1],b[1])&&a[2].toLowerCase()===b[2].toLowerCase());
}
function canFastBoot(config,official){
 try{
  const state=JSON.parse(fs.readFileSync(path.join(config.stateRoot,'state.json'),'utf8'));
  if((!same(state.codexExe,official.exe)&&!sameStoreFamily(state.codexExe,official.exe))||!same(state.profilePath,config.profilePath)||!same(state.themeDir,path.join(config.stateRoot,'active-theme')))return false;
  const journal=path.join(config.stateRoot,'config.before-dream-skin.toml.startup-appearance.json');
  if(fs.existsSync(journal)&&JSON.parse(fs.readFileSync(journal,'utf8')).stage!=='committed')return false;
  return fs.existsSync(path.join(config.stateRoot,'active-theme/theme.json'))&&fs.existsSync(config.profilePath);
 }catch{return false}
}
async function fastBootNative({helper,port,start,attach,verify,log=()=>{}}){
 const launch=await helper.request('ls '+port);if(!launch.ok)throw Error(launch.message||'Native skin profile activation failed');
 log('skin-native-fast-activated',{pid:launch.pid});
 let resolveAttached,rejectAttached;
 const nativeAttached=new Promise((resolve,reject)=>{resolveAttached=resolve;rejectAttached=reject});nativeAttached.catch(()=>{});
 return parallelSkinLaunch({
  start:async()=>{await nativeAttached;return start()},
  attach:async failed=>{try{return await attach(failed,resolveAttached)}catch(error){rejectAttached(error);throw error}},verify,log
 });
}
async function prepareAnimation(root,settings){
 const preparedMedia=await fs.promises.readFile(path.join(root,'assets/gpt6-stars-full.mp4'));
 if(preparedMedia.length>24*1024*1024)throw Error('Animation media exceeds limit');
 return {preparedMedia,encodedMedia:preparedMedia.toString('base64'),preparedPayload:buildNativePayload(root,settings,{waitForAppReady:true,timeoutMs:150000,compositorRotation:true})};
}
async function attachEarly(root,config,official,helper,settings,prepared,failed=()=>null,log=()=>{},options={}){
 const startedAt=Date.now();
 const {attach,mainTarget,socketUrl}=await import('./native-cdp.mjs');
 const deadline=Date.now()+(options.timeoutMs||45000);let client,candidate,lastError,listenerVerified=false;
 while(Date.now()<deadline){
  if(failed())throw failed();
  try{
   if(!candidate){
     const snapshot=await helper.request('s');if(!snapshot.ok)throw Error(snapshot.message);
     const apps=snapshot.apps.filter(a=>a.port===config.port&&same(a.exe,official.exe)&&same(a.profile,config.profilePath));
     if(apps.length!==1)throw Error('Waiting for the new official skin profile');candidate=apps[0];
   }
   if(!listenerVerified){const verified=await helper.request(`v ${candidate.port} ${candidate.pid}`);if(!verified.verified)throw Error('Early native listener verification failed');listenerVerified=true}
   const response=await fetch(`http://127.0.0.1:${candidate.port}/json/list`,{signal:AbortSignal.timeout(1200),redirect:'error'});if(!response.ok)throw Error('Native page not ready');
   const pages=(await response.json()).filter(mainTarget);if(pages.length!==1)throw Error('Waiting for the unique native main document');
   const verified=await helper.request(`v ${candidate.port} ${candidate.pid}`);if(!verified.verified)throw Error('Native listener changed before attach');
   client=await attach(socketUrl(pages[0].webSocketDebuggerUrl,candidate.port));log('skin-native-page-attached',{pid:candidate.pid,elapsedMs:Date.now()-startedAt});options.onAttached?.();break;
  }catch(e){lastError=e;client?.close();client=null;await delay(candidate?100:200)}
 }
 if(!client)throw lastError||Error('Early native animation timed out');
 try{
  const result=await (options.inject||injectAnimation)(client,root,settings,{...prepared,waitForAppReady:true,timeoutMs:150000});
  log('skin-animation-early-native',{...result,pid:candidate.pid,elapsedMs:Date.now()-startedAt});
  // Cosmetic repair is best-effort and must never abort playback or skin.
  try{const icon=await helper.request('k '+candidate.pid);log('native-window-icon',{pid:candidate.pid,...icon})}catch(error){log('native-window-icon-warning',{message:error.message})}
 }catch(e){client.close();throw e}
 return {
  candidate,
  async openingFinished(){
    const limit=Date.now()+30000;
    while(Date.now()<limit){const r=await client.call('Runtime.evaluate',{expression:"(()=>{const a=window.__codexStartupAnimation;if(!a?.active)return true;const s=a.status();return s.time>=8.2})()",returnByValue:true});if(r.result?.value)return;await delay(200)}
    // Let skin loading proceed even if a paused or struggling renderer misses
    // its expected opening budget. This never closes/restarts the native app.
  },
  async ready(){await client.call('Runtime.evaluate',{expression:'window.__codexStartupAnimation?.releaseApp()',returnByValue:true})},
  async finished(){const limit=Date.now()+150000;while(Date.now()<limit){const r=await client.call('Runtime.evaluate',{expression:'Boolean(window.__codexStartupAnimation?.active)',returnByValue:true});if(!r.result?.value)return;await delay(350)}throw Error('Native animation completion timed out')},
  async close(){try{await client.call('Runtime.evaluate',{expression:"window.__codexStartupAnimation?.dispose('launch-cleanup')",returnByValue:true},1500)}catch{}finally{client.close()}}
 };
}
// Start skin loading and early native animation together. A failure always
// disposes only our DOM/video; the official application is never stopped.
async function parallelSkinLaunch({start,attach,verify,log=()=>{}}){
 let error,animation;
 const skin=Promise.resolve().then(start).catch(e=>{error=e;throw e});skin.catch(()=>{});
 try{animation=await attach(()=>error);await skin;await verify(animation);await animation.ready();log('native-handoff-ready');await animation.finished();return {installed:true,earlyNative:true}}
 catch(e){await skin.catch(()=>{});throw e}
 finally{await animation?.close()}
}
module.exports={prepareAnimation,attachEarly,parallelSkinLaunch,canFastBoot,fastBootNative};

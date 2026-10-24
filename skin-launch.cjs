'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {BoundsClient}=require('./helper-client.cjs');
const {injectAnimation}=require('./native-renderer.cjs');
const Model=require('./settings-model.js');
const {powerShell}=require('./platform-runtime.cjs');
const {clearStaleInjector}=require('./skin-state.cjs');
const {prepareScene,sceneConfig,sceneHealthy}=require('./skin-scene.cjs');
const {prepareAnimation,attachEarly,parallelSkinLaunch,canFastBoot,fastBootNative}=require('./skin-early.cjs');
const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.win32.normalize(a).toLowerCase()===path.win32.normalize(b).toLowerCase();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function detectSkin(options){
  const stateRoot=path.join(process.env.LOCALAPPDATA,'CodexDreamSkin');
  const runtime=path.join(stateRoot,'manager-runtime');
  if(!fs.existsSync(runtime))return null;
  let state={};try{state=JSON.parse(fs.readFileSync(path.join(stateRoot,'state.json'),'utf8'))}catch{}
  const versions=fs.readdirSync(runtime,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^[\w.+-]+$/.test(e.name)).map(e=>e.name).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
  const startScript=versions.map(v=>path.join(runtime,v,'payload/scripts/start-dream-skin.ps1')).find(p=>fs.existsSync(p));
  if(!startScript)return null;
  let wallpaperAssets=options.wallpaperAssets||process.env.WALLPAPER_ENGINE_ASSETS;
  if(!wallpaperAssets)try{const theme=JSON.parse(fs.readFileSync(path.join(stateRoot,'active-theme/theme.json'),'utf8'));const match=theme.media?.scenePath?.match(/^(.*)[\\/]steamapps[\\/]workshop[\\/]content[\\/]431960[\\/]/i);if(match){const assets=path.join(match[1],'steamapps/common/wallpaper_engine/assets');if(fs.existsSync(assets))wallpaperAssets=assets;}}catch{}
  return {...options,stateRoot,profilePath:path.join(stateRoot,'cdp-profile'),startScript,port:options.port||state.port||9335,wallpaperAssets};
}
function readSkinConfig(root) {
  const userDir=process.env.CODEX_LAUNCHER_TEST_DATA||path.join(process.env.APPDATA,'codex-launcher');
  const override=path.join(userDir,'skin-integration.json');
  const file=fs.existsSync(override)?override:path.join(root,'skin-integration.json');
  if(!fs.existsSync(file))return null;
  let config=JSON.parse(fs.readFileSync(file,'utf8'));
  if(config.autoDetect===true){config=detectSkin(config);if(!config)return null;}
  if(config.enabled!==true)return null;
  const stateRoot=path.join(process.env.LOCALAPPDATA,'CodexDreamSkin');
  if(!samePath(config.stateRoot,stateRoot)||!samePath(config.profilePath,path.join(stateRoot,'cdp-profile')))throw Error('Unexpected Dream Skin profile');
  let script=config.startScript;
  try {
    const state=JSON.parse(fs.readFileSync(path.join(stateRoot,'state.json'),'utf8'));
    if(typeof state.injectorPath==='string') {
      const candidate=path.join(path.dirname(state.injectorPath),'start-dream-skin.ps1');
      if(fs.existsSync(candidate))script=candidate;
    }
  }catch{}
  const relative=path.win32.relative(path.join(stateRoot,'manager-runtime'),script||'');
  if(!/^[\w.+-]+\\payload\\scripts\\start-dream-skin\.ps1$/i.test(relative)||!fs.existsSync(script))throw Error('Dream Skin startup script unavailable');
  const port=Number(config.port);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid Dream Skin debug port');
  return {...config,startScript:script};
}
function readSettings(directory) {
  try{return Model.normalize(JSON.parse(fs.readFileSync(path.join(directory,'settings.json'),'utf8')))}catch{return Model.normalize()}
}
function skinStartArguments(config) {
  // Use the manager's own backend. Never pass either restart/consent switch.
  return ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',config.startScript,'-Port',String(config.port),'-ProfilePath',config.profilePath,'-OperationLockTimeoutMilliseconds','15000'];
}
async function startSkin(pwsh,config,{root,directory,helper,log=()=>{}}) {
  await clearStaleInjector(config,helper,log);
  const session=await prepareScene(root,config,directory,log);
  const args=skinStartArguments(config);
  const vendor=new Promise((resolve,reject)=>{
    const child=spawn(pwsh,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const output=data=>{try{fs.mkdirSync(directory,{recursive:true});fs.appendFileSync(path.join(directory,'skin-startup.log'),data)}catch{}};
    child.stdout.on('data',output);child.stderr.on('data',output);
    // Timeout leaves the manager's transaction running; never kill Codex or
    // interrupt its appearance/config recovery to implement an animation.
    const timer=setTimeout(()=>reject(Error('Dream Skin startup timed out; no process was stopped')),180000);
    child.once('error',error=>{clearTimeout(timer);reject(error)});
    child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Dream Skin startup failed ('+code+'); see its verify.log'))});
  });
  try{await Promise.all([vendor,session?.ready]);session?.release()}
  catch(error){session?.stop();throw error}
}
async function skinNeedsRepair(config){
  if(!config.stateRoot)return false;
  if(!fs.existsSync(path.join(config.stateRoot,'state.json')))return true;
  const scene=sceneConfig(config);return scene?!await sceneHealthy(scene):false;
}
async function connectSkin(root,directory,config,candidate,helper,log=()=>{},options={}) {
  const {attach,mainTarget,socketUrl}=await import('./native-cdp.mjs');
  const deadline=Date.now()+(options.timeoutMs||20000);
  const verification=await helper.request(`v ${candidate.port} ${candidate.pid}`);
  if(!verification.ok||!verification.verified)throw Error(verification.message||'Dream Skin listener verification failed');
  let client,lastError;
  try {
    while(Date.now()<deadline) {
      try {
        const state=JSON.parse(fs.readFileSync(path.join(config.stateRoot,'state.json'),'utf8'));
        if(state.port!==candidate.port||!samePath(state.profilePath,config.profilePath)||!samePath(state.codexExe,candidate.exe))throw Error('Dream Skin state is not bound to this process');
        const base=`http://127.0.0.1:${candidate.port}`;
        const [version,list]=await Promise.all([
          fetch(base+'/json/version',{signal:AbortSignal.timeout(1000),redirect:'error'}).then(r=>{if(!r.ok)throw Error('Debugger identity unavailable');return r.json()}),
          fetch(base+'/json/list',{signal:AbortSignal.timeout(1000),redirect:'error'}).then(r=>{if(!r.ok)throw Error('Debugger page unavailable');return r.json()})
        ]);
        const browser=new URL(version.webSocketDebuggerUrl);
        if(browser.protocol!=='ws:'||browser.hostname!=='127.0.0.1'||Number(browser.port)!==candidate.port||browser.username||browser.password||browser.search||browser.hash||browser.pathname!==`/devtools/browser/${state.browserId}`)throw Error('Dream Skin browser identity changed');
        const targets=list.filter(mainTarget);if(targets.length!==1)throw Error('No unique Dream Skin main page');
        client=await attach(socketUrl(targets[0].webSocketDebuggerUrl,candidate.port));
        const ready=await client.call('Runtime.evaluate',{expression:"(()=>{const s=window.__CODEX_DREAM_SKIN_STATE__;const styled=Boolean(document.getElementById('codex-dream-skin-style'))||(s?.styleMode==='adopted'&&[...document.adoptedStyleSheets].includes(s.styleSheet));return document.visibilityState==='visible'&&document.documentElement.getAttribute('data-dream-skin')==='active'&&styled})()",returnByValue:true});
        if(ready.exceptionDetails||ready.result?.value!==true)throw Error('Dream Skin has not finished applying to the visible page');
        break;
      }catch(error){lastError=error;client?.close();client=undefined;await sleep(250)}
    }
    if(!client)throw lastError||Error('Dream Skin readiness timed out');
    const settings=readSettings(directory);
    if(!settings.autoPlay&&!options.forSkinRepair){log('skin-animation-disabled');return {skipped:true}}
    const again=await helper.request(`v ${candidate.port} ${candidate.pid}`);
    if(!again.ok||!again.verified)throw Error('Dream Skin listener changed before animation');
    const result=await (options.inject||injectAnimation)(client,root,settings);
    log('skin-animation-prepared',{...result,pid:candidate.pid,port:candidate.port});
    return result;
  }finally{client?.close()}
}
async function runSkinNative(root,directory,config,log=()=>{},overrides={}) {
  const pwsh=powerShell();
  const helper=overrides.helper||new BoundsClient(pwsh,path.join(root,'native-platform.ps1'),{initTimeout:12000,queryTimeout:15000});
  const start=Date.now();
  const launchSkin=overrides.startSkin||((pwsh,config)=>startSkin(pwsh,config,{root,directory,helper,log}));
  try {
    const snapshot=await helper.request('s');if(!snapshot.ok)throw Error(snapshot.message);
    if(snapshot.apps.length) {
      const candidate=snapshot.apps.length===1?snapshot.apps[0]:null;
      if(candidate&&candidate.port===config.port&&samePath(candidate.profile,config.profilePath)&&await (overrides.needsRepair||skinNeedsRepair)(config)){
        const official=await helper.request('i');if(!official.ok||!samePath(official.exe,candidate.exe))throw Error('Existing skin process could not be verified');
        const verified=await helper.request(`v ${candidate.port} ${candidate.pid}`);if(!verified.verified)throw Error('Existing skin listener could not be verified');
        if(!overrides.startSkin&&config.stateRoot&&fs.existsSync(path.join(config.stateRoot,'state.json'))){
          // A live verified skin needs only its missing scene stream restored.
          // Re-running the vendor's theme transaction needlessly replaces the
          // watcher and can hit its strict historical process-identity guard.
          await connectSkin(root,directory,config,candidate,helper,log,{forSkinRepair:true,inject:async()=>{
            const session=await prepareScene(root,config,directory,log);
            try{await session?.ready;session?.release();return{sceneOnlyRepair:true}}catch(error){session?.stop();throw error}
          }});
        }else await launchSkin(pwsh,config);
        log('skin-existing-session-repaired',{pid:candidate.pid});
      }
      const focused=await helper.request('f '+snapshot.apps[0].pid);
      if(!focused.ok||(!focused.focused&&!focused.visible))throw Error(focused.message||'The running Codex window could not be restored');
      log('native-existing-instance-focused',{skinCompatible:true,pid:snapshot.apps[0].pid,...focused});
      return {existing:true};
    }
    const settings=readSettings(directory);
    // Warm media/payload in parallel with the identity checks below. The early
    // attach path needs the resolved payload, never the pending promise.
    const preparation=settings.autoPlay&&config.stateRoot?prepareAnimation(root,settings):null;
    preparation?.catch(()=>{});
    const official=await helper.request('i');if(!official.ok)throw Error(official.message);
    // Recheck immediately before invoking the vendor script. Its own no-restart
    // guard closes the remaining race if Codex is opened by another entry.
    const latest=await helper.request('s');if(!latest.ok)throw Error(latest.message);
    if(latest.apps.length){const focused=await helper.request('f '+latest.apps[0].pid);if(!focused.ok||(!focused.focused&&!focused.visible))throw Error(focused.message||'The running Codex window could not be restored');log('native-existing-instance-focused',{skinCompatible:true,pid:latest.apps[0].pid,...focused});return {existing:true}}
    if(settings.autoPlay&&config.stateRoot){
      const prepared=await preparation;
      const fast=canFastBoot(config,official);
      log('skin-native-start-strategy',{fast,elapsedMs:Date.now()-start});
      let rotationDone,rotationFailed;
      const quietOpening=new Promise((resolve,reject)=>{rotationDone=resolve;rotationFailed=reject});quietOpening.catch(()=>{});
      const result=await (fast?fastBootNative:parallelSkinLaunch)({helper,port:config.port,
        start:async()=>{if(fast)await quietOpening;return launchSkin(pwsh,config)},
        attach:async(failed,onAttached)=>{
          try{
            const animation=await attachEarly(root,config,official,helper,settings,prepared,failed,log,{onAttached});
            if(fast)animation.openingFinished().then(rotationDone,rotationFailed);
            return animation;
          }catch(error){rotationFailed(error);throw error}
        },
        verify:animation=>connectSkin(root,directory,config,animation.candidate,helper,log,{inject:async()=>({handoffReady:true})}),log
      });
      log('skin-launch-complete',{elapsedMs:Date.now()-start,presentation:'early-native'});return result;
    }
    log('skin-start-requested',{script:config.startScript,port:config.port,restartExisting:false});
    await launchSkin(pwsh,config);
    const after=await helper.request('s');if(!after.ok)throw Error(after.message);
    const candidates=after.apps.filter(app=>app.port===config.port&&samePath(app.profile,config.profilePath)&&samePath(app.exe,official.exe));
    if(candidates.length!==1)throw Error('Dream Skin did not create a unique native profile; no fallback native instance was opened');
    // The manager has completed its own renderer verification before our overlay
    // is mounted, so its recovery code cannot mistake the overlay for a failure.
    if(!readSettings(directory).autoPlay){log('skin-animation-disabled');return {skipped:true}}
    const result=await (overrides.connectSkin||connectSkin)(root,directory,config,candidates[0],helper,log);
    log('skin-launch-complete',{elapsedMs:Date.now()-start});return result;
  }catch(error){
    log('skin-launch-error',{message:error.message,elapsedMs:Date.now()-start});
    // A failed skin/animation must not strand an already running app invisibly.
    // This restores its own window and never kills/restarts Codex.
    try{const snapshot=await helper.request('s');if(snapshot.ok&&snapshot.apps.length===1){const result=await helper.request('f '+snapshot.apps[0].pid);log('native-window-recovery',{pid:snapshot.apps[0].pid,...result})}}catch(recovery){log('native-window-recovery-error',{message:recovery.message})}
    throw error;
  }
  finally{helper.dispose()}
}
module.exports={readSkinConfig,runSkinNative,connectSkin,samePath,skinStartArguments,startSkin};

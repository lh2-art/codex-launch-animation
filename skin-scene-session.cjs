'use strict';
// Own only the scene adapter. Its lifetime is bound to this verified browser.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {BoundsClient}=require('./helper-client.cjs');
const {powerShell}=require('./platform-runtime.cjs');
const {samePath}=require('./skin-launch.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let adapter,helper,browser,ready=false,stopping=false,directory;
function log(event,data={}){if(directory)fs.appendFileSync(path.join(directory,'skin-startup.log'),JSON.stringify({at:new Date().toISOString(),event,...data})+'\n')}
function stop(){
 if(stopping)return;stopping=true;helper?.dispose();browser?.close();
 if(adapter&&adapter.exitCode===null){adapter.stdin.end('{"command":"shutdown"}\n');setTimeout(()=>process.exit(0),10000)}else process.exit(0);
}
process.on('disconnect',()=>{if(!ready)stop()});
process.on('message',async message=>{
 if(message.stop){stop();return}
 if(!message.config||directory)return;
 directory=message.directory;fs.mkdirSync(directory,{recursive:true});
 const {config,scene,root}=message;
 try{
  const pwsh=powerShell();
  helper=new BoundsClient(pwsh,path.join(root,'native-platform.ps1'),{queryTimeout:20000});
  const official=await helper.request('i');if(!official.ok)throw Error(official.message);
  let state,version,lastError;
  const deadline=Date.now()+90000;
  while(Date.now()<deadline&&!stopping){
   try{
    state=JSON.parse(fs.readFileSync(path.join(config.stateRoot,'state.json'),'utf8'));
    if(state.port!==config.port||!samePath(state.codexExe,official.exe)||!samePath(state.profilePath,config.profilePath))throw Error('Waiting for matching skin state');
    const snapshot=await helper.request('s');const candidates=snapshot.apps.filter(a=>a.port===config.port&&samePath(a.profile,config.profilePath)&&samePath(a.exe,official.exe));
    if(candidates.length!==1)throw Error('No unique official skin process');
    const verified=await helper.request(`v ${config.port} ${candidates[0].pid}`);if(!verified.verified)throw Error('Scene CDP listener failed verification');
    version=await(await fetch(`http://127.0.0.1:${config.port}/json/version`,{signal:AbortSignal.timeout(1500),redirect:'error'})).json();
    if(version.webSocketDebuggerUrl!==`ws://127.0.0.1:${config.port}/devtools/browser/${state.browserId}`)throw Error('Waiting for matching browser identity');
    break;
   }catch(e){lastError=e;version=null;await delay(250)}
  }
  if(stopping)return;if(!version)throw lastError||Error('Skin browser was not ready');
  browser=new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{browser.addEventListener('open',resolve,{once:true});browser.addEventListener('error',()=>reject(Error('Browser lifetime connection failed')),{once:true})});
  browser.addEventListener('close',stop);browser.addEventListener('error',stop);
  helper.dispose();helper=null;
  const fps=Math.max(15,Math.min(30,Number(config.sceneFps)||30));
  const bounds=official.desktopBounds;
  const bridgeFile=path.join(path.dirname(scene.adapter),'codex_bridge.mjs');
  const canOffscreen=Array.isArray(bounds)&&bounds.length===4&&fs.readFileSync(bridgeFile,'utf8').includes('CODEX_SCENE_OFFSCREEN_START');
  const sceneEnv=canOffscreen?{CODEX_SCENE_OFFSCREEN_START:'1',CODEX_SCENE_OFFSCREEN_X:String(bounds[0]+bounds[2]+64),CODEX_SCENE_OFFSCREEN_Y:String(bounds[1])}:{};
  // Respect this per-launch cap, retaining native viewport size and the
  // adapter's existing hardware encoder/quality settings. Never edit WE config.
  adapter=spawn(scene.adapter,['--stdin-json','--respect-manager','--resolution','codex','--fps',String(fps),scene.assets,scene.scene],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,...sceneEnv,WP_STREAM_TOKEN:scene.token,WP_STREAM_PORT:String(scene.port)}});
  log('scene-start-position',{offscreen:canOffscreen});
  adapter.stdin.on('error',()=>{});
  const started=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Scene adapter did not become ready')),45000);
   let text='';adapter.stdout.on('data',data=>{text=(text+data.toString()).slice(-4096);if(text.includes('scene-viewer: stream ready '+scene.url)){clearTimeout(timer);resolve()}});
   adapter.once('error',e=>{clearTimeout(timer);reject(e)});adapter.once('exit',code=>{clearTimeout(timer);reject(Error('Scene adapter exited ('+code+')'))});
  });
  adapter.stderr.on('data',data=>log('adapter', {message:data.toString().slice(0,1500)}));
  adapter.once('exit',()=>{log('scene-stopped');stop();process.exit(0)});
  await started;
  ready=true;log('scene-ready',{port:scene.port});if(process.connected)process.send({ready:true});
  setInterval(()=>{
   try{const theme=JSON.parse(fs.readFileSync(path.join(config.stateRoot,'active-theme/theme.json'),'utf8'));if(theme.media?.streamUrl!==scene.url||theme.media?.scenePath!==scene.scene)stop()}catch{stop()}
  },3000);
 }catch(e){log('scene-error',{message:e.message});if(process.connected)process.send({error:e.message});stop()}
});

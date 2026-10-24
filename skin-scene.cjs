'use strict';
const fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process');
function sceneConfig(config){
 const theme=JSON.parse(fs.readFileSync(path.join(config.stateRoot,'active-theme/theme.json'),'utf8'));
 if(theme.media?.type!=='scene')return null;
 const url=new URL(theme.media.streamUrl);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!/^\/[a-f0-9]{48}\/stream\.mp4$/.test(url.pathname)||url.username||url.password||url.search||url.hash||Number(url.port)<1024)throw Error('Invalid saved scene endpoint');
 const scene=theme.media.scenePath,assets=config.wallpaperAssets;
 if(!path.win32.isAbsolute(scene||'')||!/^scene\.(pkg|json)$/i.test(path.basename(scene))||!fs.existsSync(scene))throw Error('Saved scene file is unavailable');
 if(!assets||path.basename(assets).toLowerCase()!=='assets'||!fs.existsSync(assets))throw Error('Wallpaper Engine assets directory is unavailable');
 const adapter=path.join(config.stateRoot,'scene-runtime/SceneViewer.exe');
 if(!fs.existsSync(adapter))throw Error('Scene adapter is unavailable');
 return {url:url.href,token:url.pathname.split('/')[1],port:Number(url.port),scene,assets,adapter};
}
async function sceneHealthy(scene){
 try{const r=await fetch(scene.url.replace(/stream\.mp4$/,'health'),{signal:AbortSignal.timeout(1500),redirect:'error'});if(!r.ok)return false;const h=await r.json();return h.ready===true&&!h.closed&&!h.error}catch{return false}
}
async function prepareScene(root,config,directory,log=()=>{}){
 const scene=sceneConfig(config);if(!scene)return null;
 if(await sceneHealthy(scene)){log('skin-scene-reused');return null}
 const runtimeRoot=path.resolve(path.dirname(config.startScript),'../..');
 const node=path.join(runtimeRoot,'node/node.exe');
 if(!fs.existsSync(node))throw Error('Skin Node runtime unavailable');
 const child=fork(path.join(root,'skin-scene-session.cjs'),[],{execPath:node,execArgv:[],detached:true,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 let settled=false;
 const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.send?.({stop:true});reject(Error('Scene startup timed out; see skin-startup.log'))},110000);
  child.on('message',m=>{if(m.ready){settled=true;clearTimeout(timer);resolve()}else if(m.error){clearTimeout(timer);reject(Error(m.error))}});
  child.once('error',e=>{clearTimeout(timer);reject(e)});
  child.once('exit',code=>{clearTimeout(timer);if(!settled)reject(Error('Scene service exited ('+code+')'))});
 });
 // Attach a rejection handler before the vendor process starts.
 ready.catch(()=>{});
 child.send({config,scene,directory,root});
 return {ready,release(){child.removeAllListeners('message');child.channel?.unref();if(child.connected)child.disconnect();child.unref()},stop(){if(child.connected)child.send({stop:true})}};
}
module.exports={sceneConfig,sceneHealthy,prepareScene};

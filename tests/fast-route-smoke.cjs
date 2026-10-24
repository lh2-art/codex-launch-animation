'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {runSkinNative}=require('../skin-launch.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(__dirname,'artifacts/fast-route',String(Date.now())),stateRoot=path.join(dir,'CodexDreamSkin'),profilePath=path.join(stateRoot,'cdp-profile');
fs.mkdirSync(profilePath,{recursive:true});fs.mkdirSync(path.join(stateRoot,'active-theme'),{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const exe=path.join(root,'node_modules/electron/dist/electron.exe'),stateFile=path.join(stateRoot,'state.json');
 const state={port,profilePath,codexExe:exe,themeDir:path.join(stateRoot,'active-theme'),browserId:'pending'};
 fs.writeFileSync(stateFile,JSON.stringify(state));fs.writeFileSync(path.join(stateRoot,'active-theme/theme.json'),'{}');fs.writeFileSync(path.join(stateRoot,'config.before-dream-skin.toml.startup-appearance.json'),JSON.stringify({stage:'committed'}));
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({autoPlay:true,motion:{rotationSpeed:1.8,gatherSpeed:.65}}));
 let child,client,vendorOpeningTime,performanceSample;const events=[],commands=[],start=Date.now();
 const config={stateRoot,profilePath,port,startScript:'fixture-only'};
 const connect=async()=>{if(client)return client;const {attach,mainTarget,socketUrl}=await import('../native-cdp.mjs');const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();client=await attach(socketUrl(pages.find(mainTarget).webSocketDebuggerUrl,port));return client};
 const evaluate=async expression=>{const c=await connect();const r=await c.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 const childEnv={...process.env,CODEX_CDP_FIXTURE_DIR:dir,CODEX_CDP_VISIBLE:'1'};delete childEnv.ELECTRON_RUN_AS_NODE;
 const helper={async request(command){commands.push(command);if(command==='s')return{ok:true,apps:child?[{pid:child.pid,port,profile:profilePath,exe}]:[]};if(command==='i')return{ok:true,exe};if(command==='ls '+port){child=spawn(exe,[path.join(__dirname,'cdp-fixture.cjs'),'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port],{windowsHide:false,stdio:'ignore',env:childEnv});return{ok:true,pid:child.pid}}if(command===`v ${port} ${child?.pid}`)return{ok:true,verified:true};throw Error('Unexpected helper request '+command)},dispose(){}};
 try{
  const result=await runSkinNative(root,dir,config,(event,data)=>{
   events.push({event,...data,atMs:Date.now()-start});
   if(event==='skin-animation-early-native')performanceSample=evaluate(`new Promise(resolve=>{const w=document.getElementById('codex-startup-animation').contentWindow;const values=[];let prev;const tick=t=>{const time=w.__timelines['codex-launcher'].time();if(time>=2.8&&time<=4.8){if(prev)values.push(t-prev);prev=t}if(time<4.8)w.requestAnimationFrame(tick);else{values.sort((a,b)=>a-b);resolve({frames:values.length,p95:values[Math.floor(values.length*.95)],max:values.at(-1)})}};w.requestAnimationFrame(tick)})`);
  },{helper,startSkin:async()=>{
   vendorOpeningTime=await evaluate('window.__codexStartupAnimation.status().time');assert.ok(vendorOpeningTime>=8.2,'Heavy skin work must wait until rotation finishes');
   const v=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();state.browserId=new URL(v.webSocketDebuggerUrl).pathname.split('/').at(-1);fs.writeFileSync(stateFile,JSON.stringify(state));
   await evaluate(`(()=>{const sheet=new CSSStyleSheet();sheet.replaceSync('body{background:#18212c}');document.adoptedStyleSheets=[sheet];window.__CODEX_DREAM_SKIN_STATE__={styleMode:'adopted',styleSheet:sheet};document.documentElement.setAttribute('data-dream-skin','active');return true})()`);
  }});
  assert.equal(result.earlyNative,true);assert.equal(events.filter(e=>e.event==='skin-animation-early-native').length,1);assert.ok(events.some(e=>e.event==='skin-native-start-strategy'&&e.fast));
  assert.equal(await evaluate('Boolean(window.__codexStartupAnimation)'),false);
  const report={scope:'real runSkinNative stateRoot fast branch with isolated native/CDP; no official restart',stateRootBranch:true,resolvedMedia:true,oneAnimation:true,heavySkinWorkAfterRotation:vendorOpeningTime,rotationStart:await performanceSample,events};
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log('PASS '+JSON.stringify({stateRootBranch:true,vendorOpeningTime,rotationStart:report.rotationStart}));
 }finally{client?.close();fs.writeFileSync(path.join(dir,'command.txt'),'quit');await delay(300);if(child?.exitCode===null)child.kill()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});

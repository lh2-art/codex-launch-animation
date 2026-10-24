'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(__dirname,'artifacts/native-window-recovery',String(Date.now()));fs.mkdirSync(dir,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const env={...process.env,APPDATA:dir};delete env.ELECTRON_RUN_AS_NODE;
 const pwsh=require('../platform-runtime.cjs').powerShell();
 const child=spawn(pwsh,['-NoProfile','-File',path.join(__dirname,'native-window-fixture.ps1'),'-Root',root,'-Profile',path.join(dir,'profile'),'-Port',String(port)],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let errors='',pending=[];const lines=[];child.stderr.on('data',d=>errors+=d);createInterface({input:child.stdout}).on('line',line=>{try{const v=JSON.parse(line);if(pending.length)pending.shift()(v);else lines.push(v)}catch{}});
 const next=()=>lines.length?Promise.resolve(lines.shift()):Promise.race([new Promise(r=>pending.push(r)),delay(20000).then(()=>{throw Error('Fixture timed out '+errors)})]);
 const command=async c=>{child.stdin.write(c+'\n');return next()};let client;
 try{
  const launch=await next();assert.ok(launch.pid);let version;
  const deadline=Date.now()+12000;while(Date.now()<deadline){try{version=await(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(800)})).json();if(version.webSocketDebuggerUrl)break}catch{}await delay(100)}
  assert.ok(version?.webSocketDebuggerUrl,'Exact launch method must forward debugging arguments');
  let initial;for(let i=0;i<20;i++){initial=await command('probe');if(initial.found&&initial.visible)break;await delay(100)}assert.equal(initial.found,true,JSON.stringify(initial));assert.equal(initial.visible,true,JSON.stringify(initial));
  assert.equal((await command('hide')).visible,false);const restored=await command('restore');assert.equal(restored.visible,true);
  assert.equal((await command('minimize')).minimized,true);const unminimized=await command('restore');assert.equal(unminimized.found,true);assert.equal(unminimized.visible,true);assert.equal(unminimized.minimized,false);
  const icon=await command('icon');assert.ok(icon.appId);assert.equal(icon.iconResource,path.join(root,'assets/chatgpt-taskbar.ico')+',0');
  const result={scope:'isolated Electron fixture; current Codex untouched',directLaunchDebugPort:true,hiddenWindowRestored:true,minimizedWindowRestored:true,taskbarIconResource:true,pid:launch.pid};fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  const {attach}=await import('../native-cdp.mjs');client=await attach(version.webSocketDebuggerUrl);await client.call('Browser.close').catch(()=>{});
 }finally{client?.close();child.stdin.end('q\n');await delay(300)}
})().catch(e=>{console.error(e.stack);process.exitCode=1});

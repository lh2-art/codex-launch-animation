'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {runSkinNative,skinStartArguments,readSkinConfig}=require('../skin-launch.cjs');
const {parallelSkinLaunch,canFastBoot,fastBootNative}=require('../skin-early.cjs');
const dir=path.join(__dirname,'artifacts/skin-routing');fs.mkdirSync(dir,{recursive:true});
const config={port:9335,profilePath:'C:\\Users\\fixture\\AppData\\Local\\CodexDreamSkin\\cdp-profile',startScript:'C:\\skin\\start-dream-skin.ps1'};
const app={pid:1122,exe:'C:\\WindowsApps\\OpenAI.Codex_fixture\\app\\ChatGPT.exe',port:9335,profile:config.profilePath};
function helperFor(snapshots){const commands=[];let disposed=false;return{commands,get disposed(){return disposed},async request(command){commands.push(command);if(command==='s')return {ok:true,apps:snapshots.shift()};if(command==='i')return {ok:true,exe:app.exe};if(command.startsWith('f '))return {ok:true,focused:true};if(command.startsWith('v '))return {ok:true,verified:true};throw Error(command)},dispose(){disposed=true}}}
test('existing Codex is focused by PID; skin startup and animation are never invoked',async()=>{
 const helper=helperFor([[app]]);let starts=0,injects=0;
 await runSkinNative('.',dir,config,()=>{},{helper,startSkin:async()=>starts++,connectSkin:async()=>injects++});
 assert.deepEqual(helper.commands,['s','f 1122']);assert.equal(starts,0);assert.equal(injects,0);assert.equal(helper.disposed,true);
});
test('cold start completes the vendor script before attaching animation to that profile',async()=>{
 const helper=helperFor([[],[],[app]]),order=[];
 await runSkinNative('.',dir,config,()=>{},{helper,startSkin:async()=>{order.push('vendor-start');await Promise.resolve();order.push('vendor-verified')},connectSkin:async(_r,_d,_c,candidate)=>{assert.deepEqual(candidate,app);order.push('animation');return {installed:true}}});
 assert.deepEqual(order,['vendor-start','vendor-verified','animation']);assert.deepEqual(helper.commands,['s','i','s','s']);assert.equal(helper.disposed,true);
});
test('a Codex opened between the initial checks prevents skin startup',async()=>{
 const helper=helperFor([[],[app]]);
 await runSkinNative('.',dir,config,()=>{},{helper,startSkin:async()=>{throw Error('must not launch')}});
 assert.deepEqual(helper.commands,['s','i','s','f 1122']);
});
test('vendor failure never starts a second stock instance and always closes the helper',async()=>{
 const helper=helperFor([[],[]]);let injects=0;
 await assert.rejects(runSkinNative('.',dir,config,()=>{},{helper,startSkin:async()=>{throw Error('vendor failed')},connectSkin:async()=>injects++}),/vendor failed/);
 assert.equal(injects,0);assert.equal(helper.disposed,true);assert.deepEqual(helper.commands,['s','i','s','s']);
});
test('a different profile cannot receive the animation',async()=>{
 const helper=helperFor([[],[],[{...app,profile:'C:\\stock-profile'}]]);
 await assert.rejects(runSkinNative('.',dir,config,()=>{},{helper,startSkin:async()=>{},connectSkin:async()=>{throw Error('must not attach')}}),/unique native profile/);
});
test('disabling animation keeps the vendor skin startup path',async()=>{
 const disabled=path.join(dir,'disabled');fs.mkdirSync(disabled,{recursive:true});fs.writeFileSync(path.join(disabled,'settings.json'),JSON.stringify({autoPlay:false}));
 const helper=helperFor([[],[],[app]]);let started=false;
 const result=await runSkinNative('.',disabled,config,()=>{},{helper,startSkin:async()=>{started=true},connectSkin:async()=>{throw Error('must not animate')}});
 assert.equal(started,true);assert.equal(result.skipped,true);
});
test('the vendor command has no restart/force/prompt flags or shell expansion',()=>{
 const args=skinStartArguments(config);assert.ok(args.includes(config.startScript));assert.ok(args.includes(config.profilePath));assert.equal(args.some(s=>/restart|force|prompt/i.test(s)),false);assert.equal(args.includes('-Command'),false);
});
test('an invalid integration profile fails without launching anything',()=>{
 const invalid=path.join(dir,'invalid');fs.mkdirSync(invalid,{recursive:true});fs.writeFileSync(path.join(invalid,'skin-integration.json'),JSON.stringify({enabled:true,stateRoot:'C:\\not-the-skin-profile'}));assert.throws(()=>readSkinConfig(invalid),/Unexpected Dream Skin profile/);
});

test('a broken existing skin session is repaired in place without playing startup animation',async()=>{
 const helper=helperFor([[app]]);let starts=0;
 await runSkinNative('.',dir,config,()=>{},{helper,needsRepair:async()=>true,startSkin:async()=>starts++,connectSkin:async()=>{throw Error('must not animate existing window')}});
 assert.equal(starts,1);assert.deepEqual(helper.commands,['s','i','v 9335 1122','f 1122']);assert.equal(helper.disposed,true);
});

test('a default-profile existing app is never restarted to repair a skin',async()=>{
 const helper=helperFor([[{...app,profile:null}]]);
 await runSkinNative('.',dir,config,()=>{},{helper,needsRepair:async()=>{throw Error('must not repair default profile')},startSkin:async()=>{throw Error('must not restart')}});
 assert.deepEqual(helper.commands,['s','f 1122']);
});

test('native animation attaches while the skin is still loading; reveal waits for verification',async()=>{
 const order=[];let readySkin;
 const skinReady=new Promise(r=>readySkin=r);
 const result=await parallelSkinLaunch({start:async()=>{order.push('skin-start');await skinReady;order.push('skin-ready')},attach:async()=>{order.push('native-animation');readySkin();return {ready:async()=>order.push('release'),finished:async()=>order.push('complete'),close:async()=>order.push('cleanup')}},verify:async()=>order.push('verify')});
 assert.equal(result.earlyNative,true);assert.ok(order.indexOf('native-animation')<order.indexOf('skin-ready'));assert.ok(order.indexOf('skin-ready')<order.indexOf('release'));assert.ok(order.indexOf('verify')<order.indexOf('release'));assert.equal(order.at(-1),'cleanup');
});

test('skin startup failure disposes the in-app animation without stopping the app',async()=>{
 let cleaned=false;
 await assert.rejects(parallelSkinLaunch({start:async()=>{throw Error('skin failed')},attach:async()=>({close:async()=>{cleaned=true}}),verify:async()=>{throw Error('must not reveal')}}),/skin failed/);
 assert.equal(cleaned,true);
});

test('animation disabled starts skin directly without creating a presentation window',async()=>{
 const disabled=path.join(dir,'disabled');const helper=helperFor([[],[],[app]]);
 await runSkinNative('.',disabled,config,()=>{},{helper,startSkin:async()=>{},beginPresentation:async()=>{throw Error('must not show')}});
});

test('fast native boot activates the official profile first and starts skin only after CDP attachment',async()=>{
 const order=[];
 await fastBootNative({port:9335,helper:{async request(command){assert.equal(command,'ls 9335');order.push('official-activation');return{ok:true,pid:12}}},start:async()=>order.push('skin-start'),attach:async(_failed,onAttached)=>{order.push('native-attached');onAttached();await Promise.resolve();return{ready:async()=>order.push('release'),finished:async()=>{},close:async()=>order.push('cleanup')}},verify:async()=>order.push('verified')});
 assert.deepEqual(order,['official-activation','native-attached','skin-start','verified','release','cleanup']);
});

test('native activation failure never launches skin or injects an unrelated running app',async()=>{
 await assert.rejects(fastBootNative({port:9335,helper:{async request(){return{ok:false,message:'already running'}}},start:async()=>{throw Error('must not start')},attach:async()=>{throw Error('must not attach')}}),/already running/);
});

test('fast boot requires saved matching package/profile and a completed appearance transaction',()=>{
 const stateRoot=path.join(dir,'fast-cache'),profilePath=path.join(stateRoot,'cdp-profile');fs.mkdirSync(profilePath,{recursive:true});fs.mkdirSync(path.join(stateRoot,'active-theme'),{recursive:true});
 fs.writeFileSync(path.join(stateRoot,'active-theme/theme.json'),'{}');
 const cfg={stateRoot,profilePath};const state={codexExe:app.exe,profilePath,themeDir:path.join(stateRoot,'active-theme')};
 fs.writeFileSync(path.join(stateRoot,'state.json'),JSON.stringify(state));
 const journal=path.join(stateRoot,'config.before-dream-skin.toml.startup-appearance.json');
 fs.writeFileSync(journal,JSON.stringify({stage:'committed'}));assert.equal(canFastBoot(cfg,{exe:app.exe}),true);
 fs.writeFileSync(journal,JSON.stringify({stage:'preparing'}));assert.equal(canFastBoot(cfg,{exe:app.exe}),false);
 fs.writeFileSync(journal,JSON.stringify({stage:'committed'}));assert.equal(canFastBoot(cfg,{exe:'C:\\new-package\\ChatGPT.exe'}),false);
 fs.writeFileSync(path.join(stateRoot,'state.json'),JSON.stringify({...state,profilePath:'C:\\other-profile'}));assert.equal(canFastBoot(cfg,{exe:app.exe}),false);
});

test('fast skin boot prepares animation media before the first native activation',async()=>{
 const stateRoot=path.join(dir,'early-fast-cache'),profilePath=path.join(stateRoot,'cdp-profile');
 fs.mkdirSync(profilePath,{recursive:true});fs.mkdirSync(path.join(stateRoot,'active-theme'),{recursive:true});
 fs.writeFileSync(path.join(stateRoot,'active-theme/theme.json'),'{}');
 fs.writeFileSync(path.join(stateRoot,'state.json'),JSON.stringify({codexExe:app.exe,profilePath,themeDir:path.join(stateRoot,'active-theme')}));
 fs.writeFileSync(path.join(stateRoot,'config.before-dream-skin.toml.startup-appearance.json'),JSON.stringify({stage:'committed'}));
 const commands=[],logged=[];let starts=0;
 const helper={async request(command){commands.push(command);if(command==='s')return{ok:true,apps:[]};if(command==='i')return{ok:true,exe:app.exe};if(command.startsWith('ls '))return{ok:false,message:'activation refused'};throw Error(command)},dispose(){}};
 await assert.rejects(runSkinNative('.',dir,{...config,stateRoot,profilePath},event=>logged.push(event),{helper,startSkin:async()=>{starts++}}),/activation refused/);
 assert.ok(logged.includes('skin-native-start-strategy'),'the early native path must be reached with prepared media');
 assert.ok(logged.includes('skin-launch-error'));assert.equal(starts,0);
});

test('Store version updates reuse only the same verified family and existing committed profile',()=>{
 const stateRoot=path.join(dir,'updated-store'),profilePath=path.join(stateRoot,'cdp-profile');fs.mkdirSync(profilePath,{recursive:true});fs.mkdirSync(path.join(stateRoot,'active-theme'),{recursive:true});fs.writeFileSync(path.join(stateRoot,'active-theme/theme.json'),'{}');
 fs.writeFileSync(path.join(stateRoot,'config.before-dream-skin.toml.startup-appearance.json'),JSON.stringify({stage:'committed'}));
 const old='C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1016.8120.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe',updated=old.replace('8120','8622');
 const state={codexExe:old,profilePath,themeDir:path.join(stateRoot,'active-theme')};const cfg={stateRoot,profilePath};fs.writeFileSync(path.join(stateRoot,'state.json'),JSON.stringify(state));
 assert.equal(canFastBoot(cfg,{exe:updated}),true);assert.equal(canFastBoot(cfg,{exe:updated.replace('2p2nqsd0c76g0','otherpublisher')}),false);assert.equal(canFastBoot(cfg,{exe:updated.replace('C:','D:')}),false);assert.equal(canFastBoot(cfg,{exe:updated.replace('x64','arm64')}),false);
 fs.writeFileSync(path.join(stateRoot,'config.before-dream-skin.toml.startup-appearance.json'),JSON.stringify({stage:'preparing'}));assert.equal(canFastBoot(cfg,{exe:updated}),false);
});

test('a failed focus is not silently reported as successful startup',async()=>{
 const helper=helperFor([[app]]),original=helper.request;helper.request=async command=>command.startsWith('f ')?{ok:true,focused:false,visible:false}:original.call(helper,command);
 await assert.rejects(runSkinNative('.',dir,config,()=>{},{helper}),/window could not be restored/);
});

test('skin failure restores the remaining native window without stopping it or launching another app',async()=>{
 const helper=helperFor([[],[],[app]]),events=[];
 await assert.rejects(runSkinNative('.',dir,config,event=>events.push(event),{helper,startSkin:async()=>{throw Error('skin unavailable')}}),/skin unavailable/);
 assert.deepEqual(helper.commands,['s','i','s','s','f 1122']);assert.ok(events.includes('native-window-recovery'));
});

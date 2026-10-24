const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {readSkinConfig}=require('../skin-launch.cjs'),{powerShell}=require('../platform-runtime.cjs');
test('PowerShell resolver honors explicit override without requiring an author-specific cache',()=>{assert.equal(powerShell({CODEX_PWSH:'custom-powershell.exe'}),'custom-powershell.exe');assert.equal(powerShell({}),'powershell.exe')});
test('optional skin detection works for a different user and disables cleanly when absent',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-config-')),oldLocal=process.env.LOCALAPPDATA,oldTest=process.env.CODEX_LAUNCHER_TEST_DATA;
 t.after(()=>{if(oldLocal===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=oldLocal;if(oldTest===undefined)delete process.env.CODEX_LAUNCHER_TEST_DATA;else process.env.CODEX_LAUNCHER_TEST_DATA=oldTest;fs.rmSync(dir,{recursive:true,force:true})});
 process.env.LOCALAPPDATA=dir;process.env.CODEX_LAUNCHER_TEST_DATA=path.join(dir,'settings');fs.writeFileSync(path.join(dir,'skin-integration.json'),JSON.stringify({enabled:true,autoDetect:true,sceneFps:30}));assert.equal(readSkinConfig(dir),null);
 const manager=path.join(dir,'CodexDreamSkin/manager-runtime/1.7.3/payload/scripts');fs.mkdirSync(manager,{recursive:true});fs.writeFileSync(path.join(manager,'start-dream-skin.ps1'),'# fixture');const config=readSkinConfig(dir);assert.equal(config.stateRoot,path.join(dir,'CodexDreamSkin'));assert.equal(config.port,9335);assert.equal(config.startScript,path.join(manager,'start-dream-skin.ps1'));
});

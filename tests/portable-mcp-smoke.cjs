'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {Client}=require('../in-app-plugin/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const {StdioClientTransport}=require('../in-app-plugin/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js');
const root=path.resolve(__dirname,'..'),dir=path.join(__dirname,'artifacts/portable-install',String(Date.now())),local=path.join(dir,'Local AppData'),link=path.join(dir,'Original Codex.lnk');fs.mkdirSync(local,{recursive:true});
const env={...process.env,LOCALAPPDATA:local,CODEX_ANIMATION_MCP_DEBUG:'1',CODEX_LAUNCHER_TEST_DATA:path.join(dir,'settings')};
const pwsh=require('../platform-runtime.cjs').powerShell();
function ps(args){const p=spawnSync(pwsh,['-NoProfile','-ExecutionPolicy','Bypass',...args],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:90000});assert.equal(p.status,0,p.stderr||p.stdout);return p.stdout}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 const create=path.join(dir,'create-shortcut.ps1');fs.writeFileSync(create,"\ufeffparam([string]$Link)\n$s=New-Object -ComObject WScript.Shell;$l=$s.CreateShortcut($Link);$l.TargetPath=$env:WINDIR+'\\explorer.exe';$l.Arguments='shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App';$l.Save()\n");
 ps(['-File',create,'-Link',link]);const before=hash(link);
 ps(['-File',path.join(root,'Install.ps1'),'-ShortcutPath',link,'-SkipPluginRegistration']);
 const installed=path.join(local,'CodexLaunchAnimation'),state=JSON.parse(fs.readFileSync(path.join(installed,'install-state.json'),'utf8').replace(/^\uFEFF/,''));assert.equal(state.shortcut,link);assert.equal(hash(path.join(installed,'original-shortcut.lnk')),before);
 const manifest=JSON.parse(fs.readFileSync(path.join(installed,'in-app-plugin/.mcp.json'),'utf8')).mcpServers.launch_animation;
 assert.equal(manifest.command,'powershell.exe');assert.ok(!JSON.stringify(manifest).includes(root),'Public MCP configuration must not embed checkout path');
 const transport=new StdioClientTransport({command:manifest.command,args:manifest.args,cwd:installed,env:{...env,...manifest.env}}),client=new Client({name:'portable-install-verification',version:'1.0.0'});
 let timeout;try{await Promise.race([client.connect(transport),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Portable MCP handshake timed out')),60000))]);clearTimeout(timeout);const response=await client.callTool({name:'get_animation_configuration',arguments:{}});assert.equal(response.isError,undefined);assert.ok(response.structuredContent.settings.motion.rotationSpeed);const tools=(await client.listTools()).tools;assert.ok(tools.some(t=>t.name==='set_skin_veil'));}finally{clearTimeout(timeout);await client.close()}
 ps(['-File',path.join(installed,'Uninstall.ps1'),'-SkipPluginRegistration']);assert.equal(hash(link),before,'Uninstall must restore the exact original shortcut');
 const result={realPortableMcpHandshake:true,installAndRestore:true,fixtureLocalAppData:local,currentUserConfigurationUntouched:true};fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1});

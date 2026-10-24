'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const script=path.resolve(root,process.argv[2]||'');
if(!script.startsWith(root+path.sep)||!script.endsWith('.cjs'))throw new Error('Expected a project test script');
const folder=path.join(__dirname,'artifacts/test-logs');fs.mkdirSync(folder,{recursive:true});
const file=path.join(folder,path.basename(script)+'.log');const output=fs.openSync(file,'w');
// GUI tests explicitly verify visible windows. SW_HIDE in STARTUPINFO can
// suppress the first ShowWindow call even after BrowserWindow.show().
const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[script,...process.argv.slice(3)],{windowsHide:false,stdio:['ignore',output,output]});
const timeout=setTimeout(()=>{child.kill();process.exitCode=1;},90000);
child.once('exit',code=>{clearTimeout(timeout);fs.closeSync(output);process.stdout.write(fs.readFileSync(file,'utf8'));process.exitCode=code===0?0:1;});
child.once('error',error=>{clearTimeout(timeout);fs.closeSync(output);console.error(error.message);process.exitCode=1;});

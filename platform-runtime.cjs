'use strict';
const fs=require('node:fs'),path=require('node:path');
function powerShell(env=process.env){
 if(env.CODEX_PWSH)return env.CODEX_PWSH;
 const candidates=[env.ProgramFiles&&path.join(env.ProgramFiles,'PowerShell/7/pwsh.exe'),env.SystemRoot&&path.join(env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe')].filter(Boolean);
 return candidates.find(p=>fs.existsSync(p))||'powershell.exe';
}
module.exports={powerShell};

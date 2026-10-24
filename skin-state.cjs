'use strict';
const fs=require('node:fs'),path=require('node:path');
// Discard only a proven obsolete watcher reference. Never stop the PID:
// Windows may have reused it for an unrelated process after a reboot.
async function clearStaleInjector(config,helper,log=()=>{}){
 const file=path.join(config.stateRoot,'state.json');let bytes,state;
 try{bytes=fs.readFileSync(file);state=JSON.parse(bytes)}catch(e){if(e.code==='ENOENT')return false;throw e}
 let recorded=state;
 if(state.injectorPid===0&&state.injectorStartedAt===null){
  // Repair only the exact invalid state written by 2.6.9, using its preserved
  // original as proof. Arbitrary malformed user state must remain untouched.
  const candidates=fs.readdirSync(config.stateRoot).filter(n=>/^state\.before-stale-injector-\d+\.json$/.test(n)).sort().reverse();
  recorded=null;
  for(const name of candidates){try{const original=JSON.parse(fs.readFileSync(path.join(config.stateRoot,name),'utf8'));if(original.injectorPid>0&&JSON.stringify({...original,injectorPid:0,injectorStartedAt:null})===JSON.stringify(state)){recorded=original;break}}catch{}}
  if(!recorded)return false;
 }
 if(!Number.isInteger(recorded.injectorPid)||recorded.injectorPid<=0)return false;
 const status=await helper.request('t '+recorded.injectorPid);if(!status.ok)return false;
 const saved=Date.parse(recorded.injectorStartedAt),actual=Date.parse(status.startedAt);
 const obsolete=status.exists===false||(status.exists===true&&Number.isFinite(saved)&&Number.isFinite(actual)&&Math.abs(saved-actual)>1);
 if(!obsolete||!fs.readFileSync(file).equals(bytes))return false;
 const backup=path.join(config.stateRoot,'state.stale-launcher-'+Date.now()+'-'+process.pid+'.json');
 // The manager accepts an absent state and creates a fresh schema-3 record.
 // A synthetic PID=0 record is invalid even when its JSON parses correctly.
 if(!fs.readFileSync(file).equals(bytes))return false;
 fs.renameSync(file,backup);
 log('skin-obsolete-watcher-reference-cleared',{pid:recorded.injectorPid,reason:status.exists?'pid-reused':'exited',archived:true});return true;
}
module.exports={clearStaleInjector};

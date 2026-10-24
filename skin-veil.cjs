'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createSkinVeilStore(directory=process.env.CODEX_LAUNCHER_TEST_DATA?path.join(process.env.CODEX_LAUNCHER_TEST_DATA,'CodexDreamSkin'):path.join(process.env.LOCALAPPDATA,'CodexDreamSkin')){
 const themeFile=path.join(directory,'active-theme/theme.json'),filename=path.join(directory,'theme-preferences.json');
 const json=file=>{if(fs.statSync(file).size>256*1024)throw Error('Skin configuration exceeds size limit');return JSON.parse(fs.readFileSync(file,'utf8'))};
 function preferences(){try{const p=json(filename);if(p.schemaVersion!==1||!p.themes||typeof p.themes!=='object'||Array.isArray(p.themes))throw Error('Invalid skin preferences');return p}catch(e){if(e.code==='ENOENT')return {schemaVersion:1,themes:{}};throw e}}
 function current(){const theme=json(themeFile);if(typeof theme.id!=='string'||!theme.id||['__proto__','prototype','constructor'].includes(theme.id))throw Error('Invalid current skin');return theme}
 function read(){try{const theme=current(),p=preferences(),value=p.themes[theme.id]?.transparency;if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100))throw Error('Invalid skin transparency');return {available:true,themeId:theme.id,opacity:value===undefined?70:Math.round(100-value)}}catch(e){if(e.code==='ENOENT')return {available:false,themeId:'',opacity:70};throw e}}
 function update({themeId,opacity}){
  if(!Number.isInteger(opacity)||opacity<0||opacity>100)throw Error('Mask opacity must be an integer from 0 to 100');
  if(current().id!==themeId)throw Error('Skin changed. Reopen the console before adjusting the mask.');
  const p=preferences();p.themes[themeId]={...p.themes[themeId],transparency:100-opacity};
  const backup=path.join(directory,'theme-preferences.before-veil-slider.json');if(fs.existsSync(filename)&&!fs.existsSync(backup))fs.copyFileSync(filename,backup,fs.constants.COPYFILE_EXCL);
  const temporary=filename+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(temporary,JSON.stringify(p,null,2)+'\n');if(current().id!==themeId)throw Error('Skin changed while saving');fs.renameSync(temporary,filename)}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
  return read();
 }
 return {read,update};
}
module.exports={createSkinVeilStore};

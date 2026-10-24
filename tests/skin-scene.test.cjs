'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {sceneConfig,sceneHealthy}=require('../skin-scene.cjs');
const dir=path.join(__dirname,'artifacts/scene-config');fs.mkdirSync(path.join(dir,'active-theme'),{recursive:true});
const theme=media=>fs.writeFileSync(path.join(dir,'active-theme/theme.json'),JSON.stringify({media}));
test('static themes need no scene service; untrusted saved streams are rejected',()=>{
 theme({type:'image'});assert.equal(sceneConfig({stateRoot:dir}),null);
 for(const streamUrl of ['https://example.com/file.mp4','http://127.0.0.1:1234/wrong/stream.mp4','http://user:pass@127.0.0.1:1234/'+'a'.repeat(48)+'/stream.mp4']){
  theme({type:'scene',streamUrl});assert.throws(()=>sceneConfig({stateRoot:dir}),/Invalid saved scene endpoint/);
 }
});
test('reuse requires an actual live stream; closed or failed streams must restart',async()=>{
 let data={ready:true,closed:false};const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const scene={url:`http://127.0.0.1:${server.address().port}/test/stream.mp4`};
 try{assert.equal(await sceneHealthy(scene),true);data.closed=true;assert.equal(await sceneHealthy(scene),false);data={ready:false};assert.equal(await sceneHealthy(scene),false);data={ready:true,error:'capture failed'};assert.equal(await sceneHealthy(scene),false)}finally{await new Promise(r=>server.close(r))}
 assert.equal(await sceneHealthy(scene),false);
});

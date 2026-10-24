(() => {
 'use strict';
 const bridge=window.codexLauncher,slider=document.getElementById('skin-veil-opacity'),number=document.getElementById('skin-veil-number'),status=document.getElementById('skin-veil-status');
 const tr=s=>window.AnimationI18n.text(s);
 let themeId,revision=0,timer,queue=Promise.resolve();
 const enable=value=>{slider.disabled=!value;number.disabled=!value};
 const paint=value=>{slider.value=value;number.value=value};
 async function load(){
  if(!bridge?.getSkinVeil){status.textContent=tr('请在本机控制台调节皮肤遮罩');return}
  try{const result=await bridge.getSkinVeil();themeId=result.themeId;enable(result.available);paint(result.opacity);status.textContent=tr(result.available?'拖动即自动保存，当前皮肤实时生效':'尚未找到当前皮肤')}catch{enable(false);status.textContent=tr('皮肤设置读取失败，请重新打开控制台')}
 }
 function save(){
  clearTimeout(timer);const value=Number(slider.value),id=themeId,version=revision;
  queue=queue.catch(()=>{}).then(async()=>{
   if(version!==revision)return;
   try{await bridge.setSkinVeil({themeId:id,opacity:value});if(version===revision)status.textContent=tr('遮罩已保存，当前皮肤实时生效')}
   catch{if(version===revision)status.textContent=tr('遮罩保存失败，若已切换皮肤请重新打开控制台')}
  });
 }
 function edit(event){if(!themeId||event.target.value==='')return;const value=Math.round(Math.max(0,Math.min(100,Number(event.target.value))));if(!Number.isFinite(value))return;paint(value);revision++;clearTimeout(timer);status.textContent=tr('正在调整遮罩…');timer=setTimeout(save,120)}
 slider.addEventListener('input',edit);number.addEventListener('input',edit);
 slider.addEventListener('change',save);number.addEventListener('change',save);
 enable(false);load();
})();

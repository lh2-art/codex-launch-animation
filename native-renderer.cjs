'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Model = require('./settings-model.js');

// Runs inside the native app's page through CDP. No host styles or app state are changed.
function installAnimation(config, runtime) {
  if (window.__codexStartupAnimation?.active) return window.__codexStartupAnimation;
  const host = window, doc = document;
  const previousFocus = doc.activeElement;
  let surface, frame, skip, dragBar, timer, frameReady, resolveVideo, rejectVideo;
  let active = true, bytes = 0, movieUrl, started = false, mediaReady = false;
  let mediaReadyAt = null, playbackReadyAt = null;
  const parts = [];
  const readyVideo = new Promise((resolve, reject) => { resolveVideo = resolve; rejectVideo = reject; });
  readyVideo.catch(() => {});
  const startedAt = performance.now();
  let releaseApp,waitingForApp=false;
  const appReady=new Promise(resolve=>{releaseApp=resolve;if(!config.waitForAppReady)resolve()});
  function decodeBase64(encoded) {
    // Chromium's native decoder avoids a 16MB JS string and per-byte JS loop
    // on the same renderer thread that is starting the official app.
    if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(encoded);
    const binary = atob(encoded), part = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) part[i] = binary.charCodeAt(i);
    return part;
  }
  const state = {
    get active() { return active; },
    status() {
      const fw = frame?.contentWindow, video = fw?.document?.querySelector('video');
      const time=fw?.__timelines?.['codex-launcher']?.time()||0;
      return { active, started, bytes, mediaReady, mediaReadyAt, playbackReadyAt, time,waitingForApp, videoTime: video?.currentTime || 0, videoEnded: Boolean(video?.ended), phase: !started ? 'loading' : video?.ended ? 'title' : video?.currentTime > 0 ? 'video' : time < 3.2 ? 'camera' : 'rotation' };
    },
    acceptChunk(encoded) {
      if (!active) return { active: false };
      if (encoded.length > 524288) throw new Error('Animation media chunk is too large');
      const part = decodeBase64(encoded);
      bytes += part.length;
      if (bytes > 24 * 1024 * 1024) { dispose('media-limit'); throw new Error('Animation media exceeds limit'); }
      parts.push(part);
      return { active, bytes };
    },
    async finishMedia(expected, encoded) {
      if (!active) return { active: false };
      // A retry must reuse the first decode, never prime/seek the live movie
      // again and flash the opening a second time.
      if(mediaReady)return {active,bytes,reused:true};
      if(bytes>0&&encoded!==undefined){await readyVideo;return {active,bytes,reused:true}}
      if (encoded !== undefined) {
        if (!Number.isSafeInteger(expected) || expected <= 0 || expected > 24 * 1024 * 1024 || typeof encoded !== 'string' || encoded.length > 32 * 1024 * 1024) throw new Error('Animation media exceeds limit');
        const part = decodeBase64(encoded);
        parts.push(part); bytes = part.length;
      }
      if (bytes !== expected) { dispose('incomplete-media'); throw new Error('Incomplete animation media'); }
      movieUrl = URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
      parts.length = 0;
      const video = frame.contentDocument.querySelector('video');
      let priming;
      await new Promise((resolve, reject) => {
        const done = () => { video.removeEventListener('loadeddata', ok); video.removeEventListener('error', bad); clearTimeout(deadline); };
        const ok = () => { done(); resolve(); };
        const bad = () => { done(); reject(new Error('Animation video decode failed')); };
        const deadline = setTimeout(bad, 10000);
        video.addEventListener('loadeddata', ok, { once: true }); video.addEventListener('error', bad, { once: true });
        video.src = movieUrl; video.load();
        // Force preparation even while the HWND is hidden. Passive loadeddata
        // alone may be deferred for invisible media in the official renderer.
        priming=video.play(); priming.catch(bad);
      }).catch(error => { dispose('video-error'); throw error; });
      await priming.catch(error=>{dispose('video-error');throw error;});
      video.pause();
      if(!active)return {active:false,bytes};
      if(video.currentTime>0)await new Promise((resolve,reject)=>{
        const done=()=>{clearTimeout(deadline);video.removeEventListener('seeked',done);resolve();};
        const deadline=setTimeout(()=>{video.removeEventListener('seeked',done);reject(new Error('Animation first frame seek timed out'));},3000);
        video.addEventListener('seeked',done,{once:true});video.currentTime=0;
      });
      if (active) { mediaReady = true; mediaReadyAt = performance.now() - startedAt; resolveVideo(); }
      return { active, bytes };
    },
    dispose,
    releaseApp:()=>{waitingForApp=false;releaseApp();return true},
  };
  function key(event) { if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); dispose('skipped'); } }
  function dispose(reason = 'skipped') {
    if (!active) return;
    active = false;
    clearTimeout(timer); rejectVideo(new Error('Animation stopped'));releaseApp();
    const fw = frame?.contentWindow;
    try {
      fw?.removeEventListener('keydown', key, true);
      fw?.__timelines?.['codex-launcher']?.kill();
      fw?.document?.getAnimations().forEach(animation=>animation.cancel());
      fw?.gsap?.globalTimeline?.clear(); fw?.gsap?.ticker?.sleep();
      const video = frame?.contentDocument?.querySelector('video');
      if (video) { video.pause(); video.removeAttribute('src'); video.querySelectorAll('source').forEach(node => node.remove()); video.load(); }
    } catch {}
    if (movieUrl) URL.revokeObjectURL(movieUrl);
    movieUrl = undefined; parts.length = 0; bytes = 0;
    frame?.remove(); skip?.remove(); dragBar?.remove(); surface?.remove();
    host.removeEventListener('resize', fitDragBar);
    host.navigator.windowControlsOverlay?.removeEventListener('geometrychange', fitDragBar);
    host.removeEventListener('keydown', key, true); host.removeEventListener('pagehide', onPageHide);
    if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
    host.__codexStartupAnimationLast = { reason, elapsed: Math.round(performance.now() - startedAt), cleaned: true };
    if (host.__codexStartupAnimation === state) delete host.__codexStartupAnimation;
    frame = undefined; skip = undefined; dragBar = undefined; surface = undefined;
  }
  function onPageHide() { dispose('navigation'); }
  function fitDragBar() {
    if (!dragBar) return;
    const controls = host.navigator.windowControlsOverlay;
    const rect = controls?.visible ? controls.getTitlebarAreaRect() : null;
    // Keep the real native caption buttons outside the draggable region.
    dragBar.style.left = `${rect?.x || 0}px`;
    dragBar.style.width = rect?.width > 0 ? `${rect.width}px` : 'max(0px, calc(100% - 138px))';
    dragBar.style.height = `${Math.max(36, rect?.height || 36)}px`;
  }
  function mount() {
    if (!active) return;
    // Anchor outside body: native startup transforms/containment on body must
    // never move or clip a fixed animation and expose the loading page edges.
    surface=doc.createElement('div');surface.id='codex-startup-surface';
    const isolated=(element,properties)=>{
      element.style.setProperty('all','initial','important');
      for(const [name,value]of Object.entries(properties))element.style.setProperty(name,value,'important');
    };
    isolated(surface,{position:'fixed',inset:'0',width:'100%',height:'100%',margin:'0',padding:'0',border:'0',outline:'0','border-radius':'0','box-shadow':'none',background:'#070b12',overflow:'hidden',isolation:'isolate','z-index':'2147483646',display:'block','box-sizing':'border-box','pointer-events':'auto'});
    // One opaque surface inside the native app, including its title-bar background.
    // Hit-test regions above it preserve dragging and the native caption buttons.
    dragBar = doc.createElement('div'); dragBar.id = 'codex-startup-drag'; dragBar.setAttribute('aria-hidden', 'true');
    Object.assign(dragBar.style, { position: 'fixed', top: '0', zIndex: '2147483647', background: 'transparent', webkitAppRegion: 'drag' });
    fitDragBar();
    host.addEventListener('resize', fitDragBar);
    host.navigator.windowControlsOverlay?.addEventListener('geometrychange', fitDragBar);
    skip = doc.createElement('button'); skip.id = 'codex-startup-skip'; skip.type = 'button'; skip.textContent = config.settings.uiLanguage === 'en' ? 'Skip' : '跳过'; skip.setAttribute('aria-label', skip.textContent);
    Object.assign(skip.style, { position: 'fixed', top: '64px', right: '32px', zIndex: '2147483647', padding: '8px', borderRadius: '0', border: '0', background: 'transparent', color: '#fff', mixBlendMode: 'difference', cursor: 'pointer', font: '14px "Segoe UI","Microsoft YaHei",sans-serif', pointerEvents: 'auto', webkitAppRegion: 'no-drag' });
    skip.addEventListener('click', () => dispose('skipped'));
    frame = doc.createElement('iframe'); frame.id = 'codex-startup-animation'; frame.title = 'ChatGPT 启动动画';
    isolated(frame,{position:'absolute',inset:'0',width:'100%',height:'100%','min-width':'0','min-height':'0','max-width':'none','max-height':'none',margin:'0',padding:'0',border:'0',outline:'0','border-radius':'0','box-shadow':'none',background:'#070b12',opacity:'0',display:'block','box-sizing':'border-box','pointer-events':'auto'});
    host.addEventListener('keydown', key, true); host.addEventListener('pagehide', onPageHide, { once: true });
    let initializeFrame, initialized = false;
    frameReady = new Promise((resolve, reject) => {
      initializeFrame = () => {
        if (initialized) return;
        if (!active) { resolve(); return; }
        try {
          const fw = frame.contentWindow, fd = fw.document;
          if (!fd.body) return;
          initialized = true;
          fd.documentElement.lang = 'zh-CN'; fd.title = 'ChatGPT 启动动画';
          const style = fd.createElement('style'); style.textContent = config.css; fd.head.appendChild(style);
          fd.body.innerHTML = config.html;
          fd.body.style.background = '#070b12';
          const nativeColor=getComputedStyle(doc.body).backgroundColor;
          fd.documentElement.style.setProperty('--native-surface-color',nativeColor==='rgba(0, 0, 0, 0)'?'#070b12':nativeColor);
          const bridge = {
            getMode: async () => 'splash', getSettings: async () => config.settings,
            compositorRotation:config.compositorRotation,
            waitForVideo: () => readyVideo,
            ...(config.waitForAppReady?{waitForAppReady:()=>{waitingForApp=true;return appReady.finally(()=>{waitingForApp=false})}}:{}),
            onOverlayReady: () => () => {},
            // Match the in-app preview: transport and decode before rotation.
            // No Base64 conversion or CDP video uploads compete with the icon.
            rendererReady: async () => { await readyVideo; return active; },
            beginPlayback:()=>{if(!active||started)return;playbackReadyAt=performance.now()-startedAt;started=true;frame.style.setProperty('opacity','1','important');},
            videoVisible: () => {},
            closeOverlay: () => dispose('playback-error'), animationComplete: () => dispose('completed'),
          };
          fw.codexLauncher = bridge;
          fw.addEventListener('keydown', key, true);
          runtime.call(fw, fw, fd);
          resolve();
        } catch (error) { dispose('initialization-error'); reject(error); }
      };
      frame.addEventListener('load', initializeFrame, { once: true });
    });
    // The initial same-origin about:blank document is available synchronously.
    // Relying only on its load event can stall in the official app's renderer.
    surface.append(frame,dragBar,skip);doc.documentElement.append(surface);
    if (frame.contentDocument?.body) initializeFrame();
    // Native UI remains usable even if the renderer, media transfer or playback fails.
    timer = setTimeout(() => dispose('timeout'), config.timeoutMs || 45000);
    return frameReady.then(() => state);
  }
  host.__codexStartupAnimation = state;
  if (doc.body) return mount();
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => { if (doc.body) { observer.disconnect(); clearTimeout(deadline); Promise.resolve(mount()).then(resolve, reject); } });
    const deadline = setTimeout(() => { observer.disconnect(); dispose('document-timeout'); reject(new Error('Native document unavailable')); }, 8000);
    observer.observe(doc.documentElement || doc, { childList: true, subtree: true });
  });
}

function buildNativePayload(root, settings, options = {}) {
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  const asset = name => 'data:image/' + (name.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(path.join(root, 'assets', name)).toString('base64');
  let html = read('index.html').match(/<main id="root"[\s\S]*?<\/main>/)[0];
  html = html.replaceAll('./assets/opening-clouds.png',asset('opening-clouds.png')).replaceAll('./assets/chatgpt-shortcut-icon.png', asset('chatgpt-shortcut-icon.png')).replaceAll('./assets/gpt6-stars-tail.jpg', asset('gpt6-stars-tail.jpg')).replaceAll('./assets/gpt6-stars-full-poster.jpg', asset('gpt6-stars-full-poster.jpg')).replace(/<source[^>]+>/, '').replace('preload="auto"', 'preload="none"');
  const script = read('script.js').replace("const queryMode = new URLSearchParams(window.location.search).get('mode');", "const queryMode = 'splash';");
  const globals = 'const self=window,globalThis=window; const requestAnimationFrame=window.requestAnimationFrame.bind(window),cancelAnimationFrame=window.cancelAnimationFrame.bind(window),getComputedStyle=window.getComputedStyle.bind(window); let gsap;';
  const runtime = `function(window,document){${globals}\n${read('assets/gsap.min.js')}\ngsap=window.gsap;\n${read('settings-model.js')}\n${script}\n}`;
  const config = { html, css: read('style.css') + '\n.settings-button,.settings-panel,.replay,.overlay-close,.startup-skip{display:none!important}', settings: Model.normalize(settings), timeoutMs: options.timeoutMs || 45000,waitForAppReady:options.waitForAppReady===true,compositorRotation:options.compositorRotation===true };
  return `(${installAnimation.toString()})(${JSON.stringify(config)},${runtime})`;
}

async function injectAnimation(client, root, settings, options = {}) {
  const continuing=()=>!options.shouldContinue || options.shouldContinue();
  if (!continuing()) return {skipped:true};
  const startedAt=Date.now();
  const media=options.preparedMedia || fs.readFileSync(path.join(root,'assets/gpt6-stars-full.mp4'));
  if(media.length > 24 * 1024 * 1024)throw new Error('Native animation media exceeds limit');
  const encoded=options.encodedMedia || media.toString('base64');
  let objectId, mountedMs;
  try {
    options.onProgress?.('renderer');
    const initial=await client.call('Runtime.evaluate',{expression:options.preparedPayload || buildNativePayload(root,settings,options),awaitPromise:true},15000);
    if(initial.exceptionDetails || !initial.result?.objectId)throw new Error(initial.exceptionDetails?.text || 'Native animation initialization failed');
    objectId=initial.result.objectId; mountedMs=Date.now()-startedAt;
    if(!continuing())return {skipped:true};
    options.onProgress?.('video-decode');
    // One bounded transfer. The old per-chunk commands competed with the cold
    // app's renderer dozens of times inside the remaining opening deadline.
    const answer=await client.call('Runtime.callFunctionOn',{
      objectId,functionDeclaration:'function(expected,encoded){return this.finishMedia(expected,encoded)}',
      arguments:[{value:media.length},{value:encoded}],returnByValue:true,awaitPromise:true
    },15000);
    if(answer.exceptionDetails)throw new Error(answer.exceptionDetails.text || 'Native animation failed');
    if(!continuing())return {skipped:true};
    return {installed:Boolean(answer.result?.value?.active),skipped:!answer.result?.value?.active,mediaTransport:'single-blob',mediaBytes:media.length,mountedMs,mediaMs:Date.now()-startedAt};
  } catch(error) {
    try{await client.call('Runtime.evaluate',{expression:"window.__codexStartupAnimation?.dispose('transfer-error')",returnByValue:true},1500);}catch{}
    throw error;
  } finally {
    if(!continuing())try{await client.call('Runtime.evaluate',{expression:"window.__codexStartupAnimation?.dispose('opening-cancelled')",returnByValue:true},1500);}catch{}
    if(objectId)try{await client.call('Runtime.releaseObject',{objectId});}catch{}
  }
}
module.exports = { buildNativePayload, injectAnimation };

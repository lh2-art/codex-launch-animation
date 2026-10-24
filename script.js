(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const launchButton = $('.launch-button');
  const replayButton = $('.replay');
  const videoShell = $('.video-shell');
  const officialVideo = $('#gpt6-official-video');
  const settingsButton = $('.settings-button');
  const settingsPanel = $('.settings-panel');
  const settingsClose = $('.settings-close');
  const autoPlayToggle = $('#auto-play-toggle');
  const previewButton = $('.preview-button');
  const closeButton = $('.overlay-close');
  const skipButton = $('.startup-skip');
  const status = $('.settings-status');

  const autoPlayKey = 'codex-launcher:autoPlay';
  const queryMode = new URLSearchParams(window.location.search).get('mode');
  const bridge = queryMode === 'editor' ? undefined : window.codexLauncher;
  let mode = queryMode || 'browser';
  let editorPlaying = false;
  document.body.dataset.mode = mode;

  /* ---------- 设置 ---------- */

  const applySavedSetting = async () => {
    if (bridge) {
      try {
        mode = await bridge.getMode();
        document.body.dataset.mode = mode;
        const settings = await bridge.getSettings();
        window.LauncherSettings?.apply(document, settings);
        configureRotation(settings.motion?.rotationSpeed ?? 1);
        configureTitle(settings.motion?.gatherSpeed ?? 1);
        if (autoPlayToggle) autoPlayToggle.checked = Boolean(settings.autoPlay);
        return Boolean(settings.autoPlay);
      } catch {
        return true;
      }
    }
    const savedAutoPlay = localStorage.getItem(autoPlayKey);
    if (savedAutoPlay !== null && autoPlayToggle) autoPlayToggle.checked = savedAutoPlay === 'true';
    return autoPlayToggle ? autoPlayToggle.checked : true;
  };

  if (autoPlayToggle) {
    autoPlayToggle.addEventListener('change', async () => {
      try {
        if (bridge) await bridge.setAutoPlay(autoPlayToggle.checked);
        else localStorage.setItem(autoPlayKey, String(autoPlayToggle.checked));
        if (status) status.textContent = autoPlayToggle.checked ? '已开启，下次从原快捷方式打开时自动播放。' : '已关闭，下次直接打开 ChatGPT。';
      } catch {
        autoPlayToggle.checked = !autoPlayToggle.checked;
        if (status) status.textContent = '设置未能保存，请重试。';
      }
    });
  }

  const setSettingsOpen = (open) => {
    if (!settingsPanel || !settingsButton) return;
    settingsPanel.classList.toggle('is-open', open);
    settingsPanel.setAttribute('aria-hidden', String(!open));
    settingsButton.setAttribute('aria-expanded', String(open));
  };
  if (settingsButton && settingsPanel) {
    settingsButton.addEventListener('click', () => {
      if (bridge?.openSettings) bridge.openSettings();
      else setSettingsOpen(!settingsPanel.classList.contains('is-open'));
    });
  }
  if (settingsClose) settingsClose.addEventListener('click', () => {
    if (bridge && mode === 'settings') bridge.closeOverlay();
    else setSettingsOpen(false);
  });
  if (closeButton) closeButton.addEventListener('click', () => bridge?.closeOverlay());
  if (skipButton) skipButton.addEventListener('click', () => {
    if (bridge) bridge.closeOverlay();
    else { officialVideo?.pause(); tl.pause().seek(window.__startupTiming.gatherEnd + .12, true); }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mode !== 'splash') bridge?.closeOverlay();
  });

  /* ---------- 无 GSAP 时的兜底 ---------- */

  if (!window.gsap) {
    bridge?.closeOverlay(); // Reveal the native app on failure rather than leave a stuck overlay.
    return;
  }

  /* ---------- 主时间轴 ---------- */

  const glyph = $('.codex-glyph');
  const CAMERA_END = 3.2;
  const ROTATION_DURATION = 5;
  // Continuously accelerate, with a 900deg/s peak between the two old versions.
  const rotationAngle = seconds => 12 * seconds ** 3;
  const OPENING_END = CAMERA_END + ROTATION_DURATION;
  const VIDEO_END = OPENING_END + 15.274667;
  let COMPLETE = VIDEO_END + 3.48;
  window.__startupTiming={cameraEnd:CAMERA_END,openingEnd:OPENING_END,videoEnd:VIDEO_END,complete:COMPLETE};

  const tl = gsap.timeline({ paused: true, defaults: { overwrite: 'auto' } });
  // The editor can rebuild the title while showing its settled pose. A master
  // reset must also cover a newly built child that has never rendered at zero.
  tl.set(['.brand-reveal','.brand-logo','.light-band','.white-flash'],{opacity:0},0);
  tl.set('.codex-glyph',{rotation:0,force3D:true},0);
  let openingColorTween, rotationTween, rotationSpeed=1,compositorRotation,compositorOpeningEffects=[];
  const useCompositorRotation=Boolean(bridge?.compositorRotation)&&typeof glyph?.animate==='function';
  // Keep the surrounding native timeline on the same wall clock as the
  // compositor when a long page task occurs, avoiding a hold at rotation end.
  if(useCompositorRotation)gsap.ticker.lagSmoothing(0);
  function configureRotation(value) {
    const speed=window.LauncherSettings.normalize({motion:{rotationSpeed:value}}).motion.rotationSpeed;
    if(speed!==rotationSpeed){rotationSpeed=speed;rotationTween?.invalidate();}
    window.__startupTiming.rotationSpeed=speed;
  }
  const brandLogo=$('.brand-logo');
  if(brandLogo){const mask=`url("${brandLogo.querySelector('img').src}")`;brandLogo.style.maskImage=mask;brandLogo.style.webkitMaskImage=mask;}

  if (glyph) {
    if(!useCompositorRotation){
      tl.fromTo('.opening-camera',{scale:.32,yPercent:6,rotationX:10,force3D:true},{scale:1,yPercent:0,rotationX:0,force3D:true,duration:CAMERA_END,ease:'power2.inOut'},0);
      tl.fromTo('.opening-backdrop',{scale:1,yPercent:1,force3D:true},{scale:1.16,yPercent:0,force3D:true,duration:CAMERA_END,ease:'power2.inOut'},0);
    }
    const maskSource = `url("${glyph.querySelector('img').src}")`;
    const colorMark = $('.codex-color');
    colorMark.style.maskImage = maskSource; colorMark.style.webkitMaskImage = maskSource;
    const baseMark=$('.codex-base');baseMark.style.maskImage=maskSource;baseMark.style.webkitMaskImage=maskSource;
    // Opening rotation uses and modifies Boot.Engine by Tom / Artemis (MIT).
    // https://github.com/yshuang722-spec/codex-startup-animation
    // Original reference: c64fee6a56217a85a668ae8825511c858d9ac1d9.
    // Preserve the fade/tint and opening duration; bound angular velocity.
    if(!useCompositorRotation)tl.fromTo(glyph, { opacity: 0, rotation: 0 }, { opacity: .84, duration: .462, ease: 'none' }, 0);
    if(!useCompositorRotation){
      tl.fromTo(glyph, { rotation: 0,force3D:true }, { rotation: () => -rotationAngle(ROTATION_DURATION)*rotationSpeed,force3D:true, duration: ROTATION_DURATION, ease: progress => rotationAngle(progress * ROTATION_DURATION) / rotationAngle(ROTATION_DURATION), immediateRender:false }, CAMERA_END);
      rotationTween=tl.recent();
    }
      // Keep the gradient/mask/shadow textures static. Composite the colored
      // texture over the black original instead of repainting colors per frame.
    if(!useCompositorRotation){
      tl.fromTo('.codex-color', { opacity:0 }, { opacity:1, duration: 1.25, ease: 'none', immediateRender: false }, CAMERA_END + .35);
      openingColorTween=tl.recent();
    }
    tl.fromTo('.launch-stage', { opacity: 1 }, { opacity: 0, duration: .3, ease: 'power2.out', immediateRender: false }, OPENING_END);
    const ns = 'http://www.w3.org/2000/svg';
    const ring = $('.opening-ring');
    if(!useCompositorRotation)tl.fromTo(ring,{opacity:0},{opacity:1,duration:.25,immediateRender:false},CAMERA_END);
    for (let i = 0; i < 36; i++) {
      const angle = (i * 10 - 90) * Math.PI / 180;
      const segment = document.createElementNS(ns, 'line');
      segment.setAttribute('x1', String(56 * Math.cos(angle))); segment.setAttribute('y1', String(56 * Math.sin(angle)));
      segment.setAttribute('x2', String(56 * Math.cos(angle + .10))); segment.setAttribute('y2', String(56 * Math.sin(angle + .10)));
      ring.appendChild(segment);
      tl.fromTo(segment, { opacity: .08 }, { opacity: .83, duration: 1 / 9, ease: 'none', immediateRender: false }, CAMERA_END + i / 9);
    }
    const flash = $('.opening-ignition');
    for (let k = 8; k >= 1; k--) {
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('r', String(k * 2.5)); circle.setAttribute('fill', 'rgb(170,255,244)'); circle.setAttribute('opacity', '.07'); flash.appendChild(circle);
    }
    tl.fromTo(flash,{opacity:0},{ opacity: 1, duration: .18, ease: 'none',immediateRender:false }, CAMERA_END+4.47).to(flash, { opacity: 0, duration: .18, ease: 'none' }, CAMERA_END+4.65);
  }

  if (videoShell) {
    tl.fromTo(videoShell, { opacity: 0 }, { opacity: 1, duration: .3, ease: 'power2.out', immediateRender: false }, OPENING_END);
    tl.call(() => {
      // Native reveal waits until the video layer is opaque and composited.
      if (bridge?.videoVisible) requestAnimationFrame(() => requestAnimationFrame(() => bridge.videoVisible()));
    }, [], OPENING_END + .3);
  }
  if (officialVideo) {
    tl.call(() => {
      if (bridge?.waitForVideo) {
        tl.pause();
        bridge.waitForVideo().then(() => officialVideo.play()).then(() => tl.play()).catch(() => bridge.closeOverlay());
      } else officialVideo.play().catch(() => bridge?.closeOverlay());
    }, [], OPENING_END);
    tl.call(() => { if (bridge) tl.pause(); }, [], OPENING_END + .3);
    if (bridge) officialVideo.addEventListener('ended', () => { tl.seek(VIDEO_END, true); tl.play(); });
    if (bridge) officialVideo.addEventListener('error', () => bridge.closeOverlay());
  }

  // Continue the exact final starfield instead of inserting a black title card.
  // Place an opaque starfield UNDER the video before playback. Chromium can
  // discard its video surface at ended; the background must already cover it.
  tl.set('.star-tail', { opacity: 1, immediateRender: false }, OPENING_END)
  ;

  const title = gsap.timeline({paused:true});
  let titleSpeed, replayTween;
  let gatherEnd = 0;
  const gather = (selector, start, reach, duration, speed) => {
    const chars = Array.from(document.querySelectorAll(selector));
    const center = (chars.length - 1) / 2;
    chars.forEach((char, index) => {
      const at = start + (center - Math.abs(index - center)) * .015 / speed;
      title.fromTo(char, { x: `${(index - center) * reach}em`, opacity: 0 }, {
        x: 0, opacity: 1, duration:duration / speed, ease: 'power3.out', immediateRender: false
      }, at);
      gatherEnd = Math.max(gatherEnd, at + duration / speed);
    });
  };
  const light = { x: -35 };
  const lightHost = $('.brand-light');
  const writeLight = () => lightHost?.style.setProperty('--light-x', light.x.toFixed(3));
  function configureTitle(value) {
    const speed=window.LauncherSettings.normalize({motion:{gatherSpeed:value}}).motion.gatherSpeed;
    if(speed===titleSpeed)return;
    titleSpeed=speed;gatherEnd=0;
    title.clear();
    title.fromTo('.brand-reveal',{opacity:0},{opacity:1,duration:.48,ease:'power2.out',immediateRender:false},.14)
      .fromTo('.brand-logo',{opacity:0},{opacity:1,duration:.46,ease:'power2.out',immediateRender:false},.14);
    gather('.brand-motto .brand-char',.18,.75,.58,speed);
    gather('.brand-name .brand-char',.22,1.35,.72,speed);
    gather('.brand-caption .brand-char',.28,.85,.64,speed);
    // Slow gathering extends the ending so the sweep/exit cannot cut it off.
    const sweep=Math.max(1.42,gatherEnd+.35);
    title.fromTo(light,{x:-35},{x:118,duration:.93,ease:'sine.inOut',onUpdate:writeLight,immediateRender:false},sweep)
      .fromTo('.light-band',{opacity:0},{opacity:1,duration:.12,ease:'power1.out',immediateRender:false},sweep)
      .to('.light-band',{opacity:0,duration:.12,ease:'power1.in'},sweep+.81)
      .to('.brand-reveal',{opacity:0,duration:.35,ease:'power2.in'},sweep+.98)
      .fromTo('.white-flash',{opacity:0},{opacity:1,duration:.25,ease:'power2.in',immediateRender:false},sweep+1.23)
      .set([videoShell,'.star-tail','.brand-reveal'],{opacity:0,immediateRender:false},sweep+1.48)
      .set('#root',{backgroundColor:'var(--native-surface-color, #070b12)',immediateRender:false},sweep+1.48)
      .to('.white-flash',{opacity:0,duration:.55,ease:'power2.out'},sweep+1.48);
    // Keep the settled stars/text visible until the parallel native launch is
    // ready. Preview and CDP injection have no handoff gate.
    title.call(()=>{
      if(mode==='splash'&&bridge?.waitForAppReady){tl.pause();bridge.waitForAppReady().then(()=>tl.play()).catch(()=>bridge.closeOverlay());}
    },[],sweep+.97);
    title.paused(false);tl.add(title,VIDEO_END);
    COMPLETE=VIDEO_END+sweep+2.06;
    window.__startupTiming={cameraEnd:CAMERA_END,openingEnd:OPENING_END,videoEnd:VIDEO_END,complete:COMPLETE,rotationSpeed,gatherSpeed:speed,gatherEnd:VIDEO_END+gatherEnd,sweepStart:VIDEO_END+sweep};
    tl.remove(completeAnimation);tl.call(completeAnimation,[],COMPLETE);
    replayTween?.kill();
    if(replayButton){tl.to(replayButton,{opacity:1,duration:.05},COMPLETE-.06);replayTween=tl.recent();}
  }
  configureTitle(1);

  window.__timelines = window.__timelines || {};
  window.__timelines['codex-launcher'] = tl;

  /* ---------- 重播 ---------- */

  const restart = () => {
    compositorRotation?.cancel();
    compositorOpeningEffects.forEach(animation=>animation.cancel());
    if (officialVideo) {
      try { officialVideo.pause(); officialVideo.currentTime = 0; } catch { /* ignore */ }
    }
    tl.restart();
    if(useCompositorRotation){
      // x(u)=u and y(u)=u^3 for this Bezier: exactly the existing cubic
      // acceleration, but Chromium can sample transform off the JS thread.
      compositorRotation=glyph.animate([
        {transform:'translateZ(0) rotate(0deg)'},
        {transform:`translateZ(0) rotate(${-rotationAngle(ROTATION_DURATION)*rotationSpeed}deg)`}
      ],{delay:CAMERA_END*1000,duration:ROTATION_DURATION*1000,easing:'cubic-bezier(0.3333333333, 0, 0.6666666667, 0)',fill:'both'});
      window.__openingCompositorRotation=compositorRotation;
      // Two cubic halves reproduce GSAP power2.inOut exactly. Keep the
      // camera, background and initial fade moving when the page thread is busy.
      const pushFrames=(start,middle,end)=>[
        {transform:start,offset:0,easing:'cubic-bezier(0.3333333333, 0, 0.6666666667, 0)'},
        {transform:middle,offset:.5,easing:'cubic-bezier(0.3333333333, 1, 0.6666666667, 1)'},
        {transform:end,offset:1}
      ];
      compositorOpeningEffects=[
        $('.opening-camera').animate(pushFrames(
          'translateY(6%) translateZ(0) rotateX(10deg) scale(.32)',
          'translateY(3%) translateZ(0) rotateX(5deg) scale(.66)',
          'translateY(0%) translateZ(0) rotateX(0deg) scale(1)'
        ),{duration:CAMERA_END*1000,fill:'both'}),
        $('.opening-backdrop').animate(pushFrames(
          'translateY(1%) translateZ(0) scale(1)',
          'translateY(.5%) translateZ(0) scale(1.08)',
          'translateY(0%) translateZ(0) scale(1.16)'
        ),{duration:CAMERA_END*1000,fill:'both'}),
        glyph.animate([{opacity:0},{opacity:.84}],{duration:462,fill:'both'}),
        $('.codex-color').animate([{opacity:0},{opacity:1}],{delay:(CAMERA_END+.35)*1000,duration:1250,easing:'linear',fill:'both'}),
        $('.opening-ring').animate([{opacity:0},{opacity:1}],{delay:CAMERA_END*1000,duration:250,easing:'cubic-bezier(0.3333333333, 0.6666666667, 0.6666666667, 1)',fill:'both'})
      ];
    }
  };
  if (launchButton) launchButton.addEventListener('click', restart);
  if (replayButton) replayButton.addEventListener('click', restart);
  if (previewButton) previewButton.addEventListener('click', () => {
    if (bridge?.openPreview) bridge.openPreview();
    else { setSettingsOpen(false); restart(); }
  });

  /* ---------- 自动播放 ---------- */

  // Start automatically once the native page and assets are ready.
  const beginPlay = () => {
    bridge?.beginPlayback?.();
    restart();
  };
  let started = false;
  const startOnce = () => {
    if (started) return;
    started = true;
    window.setTimeout(beginPlay, 60);
  };

  if (bridge && bridge.onOverlayReady) {
    bridge.onOverlayReady(startOnce);
  }

  applySavedSetting().then(async (autoPlay) => {
    if (mode === 'editor') { if(!editorPlaying)tl.pause().seek(window.__startupTiming.gatherEnd + .12, true); return; }
    if (mode === 'settings') { setSettingsOpen(true); return; }
    if (mode === 'splash' || mode === 'preview') {
      // Decode the still background before reporting ready, avoiding an empty
      // image surface when video playback hands off to the title sequence.
      try { await Promise.all([$('.star-tail img')?.decode(),$('.opening-backdrop')?.decode(),glyph?.querySelector('img')?.decode()]); } catch { bridge?.closeOverlay(); return; }
      if (mode === 'splash' && !autoPlay) return;
      // The bridge may already be ready before this listener was registered.
      if (bridge && bridge.rendererReady) {
        try {
          const already = await bridge.rendererReady();
          if (already) startOnce();
        } catch { /* ignore */ }
      }
      return;
    }
    if (mode === 'browser') window.setTimeout(restart, 180);
  });

  // Remove the animation on completion and expose the native application.
  function completeAnimation() {
    if (bridge && bridge.animationComplete) bridge.animationComplete();
    if (mode === 'editor') { editorPlaying=false; window.parent.postMessage({ type: 'editor:finished' }, '*'); }
  }

  if (mode === 'editor') {
    const reportPreview = () => {
      const rect = document.querySelector('.brand-lockup').getBoundingClientRect();
      const name = document.querySelector('.brand-name');
      window.parent.postMessage({ type: 'editor:state', state: {
        time: tl.time(), nameFont: getComputedStyle(name).fontFamily,
        nameSize: parseFloat(getComputedStyle(name).fontSize), nameSpacing: parseFloat(getComputedStyle(name).gap),
        iconSize: document.querySelector('.brand-logo').getBoundingClientRect().width,
        x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
        width: innerWidth, height: innerHeight
      } }, '*');
    };
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (message?.type === 'editor:settings') {
        window.LauncherSettings.apply(document, message.settings);
        configureRotation(message.settings.motion?.rotationSpeed ?? 1);
        configureTitle(message.settings.motion?.gatherSpeed ?? 1);
        // Re-evaluate only the color endpoints. Invalidating the entire timeline
        // captures the current editor frame as new start values for .to() tweens.
        openingColorTween?.invalidate();
        // Resize and control changes must not seek a running preview to a title.
        if (!editorPlaying) {
          if (message.phase === 'opening') tl.pause().seek(CAMERA_END+1.2, true);
          else tl.pause().seek(window.__startupTiming.gatherEnd + .12, true);
        }
        requestAnimationFrame(reportPreview);
      } else if (message?.type === 'editor:play') {
        editorPlaying=true;
        window.parent.postMessage({ type: 'editor:playing' }, '*');
        if (message.full) restart();
        else { tl.pause().seek(VIDEO_END, true); tl.play(); }
      } else if (message?.type === 'editor:stop') {
        editorPlaying=false;
        officialVideo?.pause(); tl.pause().seek(window.__startupTiming.gatherEnd + .12, true);
        window.parent.postMessage({ type: 'editor:finished' }, '*');
      }
    });
    window.parent.postMessage({ type: 'editor:ready' }, '*');
  }

  // Layout is entirely CSS driven. Resizing must never alter video opacity mid-animation.
})();

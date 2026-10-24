(() => {
  'use strict';
  const Model = window.LauncherSettings;
  const bridge = window.codexLauncher;
  const $ = (selector) => document.querySelector(selector);
  const tr = source => window.AnimationI18n.text(source);
  const setStatus = source => window.setAnimationStatus(source);
  const frame = $('#live-preview');
  const skipPreview = document.createElement('button');
  skipPreview.type = 'button'; skipPreview.className = 'preview-skip'; skipPreview.textContent = '跳过'; skipPreview.hidden = true;
  skipPreview.setAttribute('aria-label', '跳过启动动画预览');
  $('#preview-frame').appendChild(skipPreview);
  skipPreview.addEventListener('click', () => frame.contentWindow.postMessage({ type: 'editor:stop' }, '*'));
  let state = Model.normalize();
  let active = 'name';
  let phase = 'brand';
  let ready = false;
  let loaded = false;
  let saveTimer, revision = 0;
  let saveQueue = Promise.resolve();
  const storageKey = 'codex-launcher:settings';

  function sendPreview() {
    if (ready) frame.contentWindow.postMessage({ type: 'editor:settings', settings: state, phase }, '*');
  }
  function updatePluginButton() {
    $('#plugin-state').textContent = tr(state.autoPlay ? '插件已启用' : '插件已禁用');
    $('#plugin-state').classList.toggle('enabled', state.autoPlay);
    $('#plugin-toggle').textContent = tr(state.autoPlay ? '禁用插件' : '启用插件');
    $('#plugin-toggle').setAttribute('aria-pressed', String(state.autoPlay));
    $('#plugin-toggle').disabled = !loaded;
  }
  function save() {
    const version = revision;
    const snapshot = Model.normalize(state);
    setStatus('正在保存…');
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      try {
        if (bridge) await bridge.updateSettings(snapshot);
        else localStorage.setItem(storageKey, JSON.stringify(snapshot));
        if (version === revision) setStatus('已自动保存 · 下次启动生效');
      } catch {
        if (version === revision) setStatus('保存失败，请重新调整后重试');
      }
    });
    return saveQueue;
  }
  function changed() {
    state = Model.normalize(state);
    revision++;
    updatePluginButton(); sendPreview();
    clearTimeout(saveTimer);
    setStatus('预览已更新，等待保存…');
    saveTimer = setTimeout(save, 220);
  }
  function valueAt(scope, key) { return scope === 'layout' || scope === 'motion' ? state[scope][key] : state.text[scope][key]; }
  function setValue(scope, key, value) { if (scope === 'layout' || scope === 'motion') state[scope][key] = value; else state.text[scope][key] = value; }
  function addControl(parent, label, scope, key, range, unit, step = 1) {
    const id = `${scope}-${key}`;
    const wrapper = document.createElement('div'); wrapper.className = 'control';
    const top = document.createElement('div'); top.className = 'control-top';
    const caption = document.createElement('label'); caption.htmlFor = id; caption.textContent = tr(label);
    const numeric = document.createElement('div'); numeric.className = 'number-wrap';
    const input = document.createElement('input'); input.type = 'number'; input.id = id; input.min = range[0]; input.max = range[1]; input.step = step; input.value = valueAt(scope, key);
    const units = document.createElement('span'); units.textContent = unit;
    numeric.append(input, units); top.append(caption, numeric);
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = range[0]; slider.max = range[1]; slider.step = step; slider.value = input.value; slider.setAttribute('aria-label', tr(label)); slider.dataset.control = id;
    const edit = (source, other) => {
      if (source.value === '') return;
      const value = Math.min(range[1], Math.max(range[0], Number(source.value)));
      if (!Number.isFinite(value)) return;
      setValue(scope, key, value); other.value = value; changed();
    };
    input.addEventListener('input', () => edit(input, slider));
    input.addEventListener('blur', () => { input.value = valueAt(scope, key); });
    slider.addEventListener('input', () => edit(slider, input));
    wrapper.append(top, slider); parent.append(wrapper);
  }
  function addColor(parent,label,key) {
    const wrapper=document.createElement('div');wrapper.className='color-control';
    const caption=document.createElement('label');caption.htmlFor='color-'+key;caption.textContent=tr(label);
    const controls=document.createElement('div');controls.className='color-inputs';
    const picker=document.createElement('input');picker.type='color';picker.id='color-'+key;picker.value=state.colors[key];picker.setAttribute('aria-label',tr(label));
    const hex=document.createElement('input');hex.type='text';hex.id='hex-'+key;hex.value=state.colors[key];hex.maxLength=7;hex.spellcheck=false;hex.setAttribute('aria-label',tr(label)+' HEX');
    picker.addEventListener('input',()=>{state.colors[key]=picker.value;hex.value=picker.value;changed();});
    hex.addEventListener('input',()=>{const valid=/^#[0-9a-f]{6}$/i.test(hex.value);hex.setAttribute('aria-invalid',String(!valid));if(valid){state.colors[key]=hex.value.toLowerCase();picker.value=state.colors[key];changed();}});
    hex.addEventListener('blur',()=>{hex.value=state.colors[key];hex.removeAttribute('aria-invalid');});
    controls.append(picker,hex);wrapper.append(caption,controls);parent.append(wrapper);
  }
  function renderControls() {
    const container = $('#object-controls'); container.replaceChildren();
    for (const button of document.querySelectorAll('[data-object]')) button.classList.toggle('selected', button.dataset.object === active);
    if (active === 'layout') {
      addControl(container, '整体水平位置', 'layout', 'x', Model.limits.x, '%', .5);
      addControl(container, '整体垂直位置', 'layout', 'y', Model.limits.y, '%', .5);
    } else if (active === 'icon') {
      addColor(container,'结尾图标颜色','brandIcon');
      addControl(container, '图标大小', 'layout', 'iconSize', Model.limits.iconSize, 'px');
      addControl(container, '图标水平偏移', 'layout', 'iconX', Model.limits.iconX, 'px');
      addControl(container, '图标垂直偏移', 'layout', 'iconY', Model.limits.iconY, 'px');
    } else {
      addColor(container,'文字颜色',active);
      const label = document.createElement('label'); label.textContent = tr('字体'); label.htmlFor = 'text-font';
      const select = document.createElement('select'); select.id = 'text-font';
      for (const [value, name] of Model.fonts) { const option = document.createElement('option'); option.value = value; option.textContent = tr(name); select.append(option); }
      select.value = state.text[active].font;
      select.addEventListener('change', () => { state.text[active].font = select.value; changed(); });
      const font = document.createElement('div'); font.className = 'font-control'; font.append(label, select); container.append(font);
      addControl(container, '字号', active, 'fontSize', Model.limits.fontSize, 'px', .5);
      addControl(container, '字间距', active, 'spacing', Model.limits.spacing, 'px', .5);
      addControl(container, '水平偏移', active, 'x', Model.limits.textX, 'px');
      addControl(container, '垂直偏移', active, 'y', Model.limits.textY, 'px');
    }
  }
  function renderAll() {
    window.AnimationI18n.apply(state.uiLanguage);
    $('#ui-language').value = state.uiLanguage;
    skipPreview.textContent = tr('跳过'); skipPreview.setAttribute('aria-label', tr('跳过启动动画预览'));
    renderControls();
    $('#gap-controls').replaceChildren(); $('#opening-controls').replaceChildren();
    addControl($('#gap-controls'), '图标 → 中文', 'layout', 'iconGap', Model.limits.iconGap, 'px');
    addControl($('#gap-controls'), '中文 → ChatGPT', 'layout', 'nameGap', Model.limits.nameGap, 'px');
    addControl($('#gap-controls'), 'ChatGPT → Codex', 'layout', 'captionGap', Model.limits.captionGap, 'px');
    addControl($('#opening-controls'), '旋转图标大小', 'layout', 'openingIconSize', Model.limits.openingIconSize, '%', .5);
    addControl($('#opening-controls'), '旋转速度', 'motion', 'rotationSpeed', Model.limits.rotationSpeed, '×', .05);
    addColor($('#opening-controls'),'渐变起始色','openingStart');
    addColor($('#opening-controls'),'渐变结束色','openingEnd');
    addColor($('#opening-controls'),'外圈颜色','openingRing');
    $('#motion-controls').replaceChildren();
    addControl($('#motion-controls'), '汇聚速度', 'motion', 'gatherSpeed', Model.limits.gatherSpeed, '×', .05);
    updatePluginButton(); sendPreview();
  }
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === 'editor:ready') { ready = true; document.body.dataset.previewReady = 'true'; sendPreview(); }
    if (event.data?.type === 'editor:state') window.editorPreviewState = event.data.state;
    if (event.data?.type === 'editor:playing') skipPreview.hidden = false;
    if (event.data?.type === 'editor:finished') { skipPreview.hidden = true; setTimeout(sendPreview, 120); }
  });
  document.querySelectorAll('[data-object]').forEach(button => button.addEventListener('click', () => { active = button.dataset.object; renderControls(); }));
  $('#plugin-toggle').addEventListener('click', () => { state.autoPlay = !state.autoPlay; changed(); });
  $('#ui-language').addEventListener('change', event => {
    state.uiLanguage = event.target.value; renderAll(); changed();
  });
  $('#phase').addEventListener('change', (event) => { phase = event.target.value; sendPreview(); });
  function fitCanvas() {
    const area = document.querySelector('.canvas-area').getBoundingClientRect();
    const [numerator, denominator] = $('#aspect').value.split('/').map(Number);
    const ratio = numerator / denominator;
    const width = Math.max(1, Math.min(area.width, area.height * ratio));
    $('#preview-frame').style.width = width + 'px';
    $('#preview-frame').style.height = width / ratio + 'px';
    requestAnimationFrame(sendPreview);
  }
  $('#aspect').addEventListener('change', fitCanvas);
  new ResizeObserver(fitCanvas).observe(document.querySelector('.canvas-area'));
  $('#play-gather').addEventListener('click', () => frame.contentWindow.postMessage({ type: 'editor:play', full: false }, '*'));
  $('#play-full').addEventListener('click', () => frame.contentWindow.postMessage({ type: 'editor:play', full: true }, '*'));
  $('#reset-settings').addEventListener('click', () => { state = Model.normalize({ autoPlay: state.autoPlay, uiLanguage: state.uiLanguage }); renderAll(); changed(); });

  let drag;
  $('#drag-surface').addEventListener('pointerdown', (event) => {
    if (!loaded || phase === 'opening') return;
    const rect = $('#drag-surface').getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, rect, start: Model.normalize(state), active };
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  $('#drag-surface').addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    const scale = 1080 / Math.min(drag.rect.width, drag.rect.height);
    if (drag.active === 'layout') {
      state.layout.x = drag.start.layout.x + dx / drag.rect.width * 100;
      state.layout.y = drag.start.layout.y + dy / drag.rect.height * 100;
    } else if (drag.active === 'icon') {
      state.layout.iconX = drag.start.layout.iconX + dx * scale; state.layout.iconY = drag.start.layout.iconY + dy * scale;
    } else {
      state.text[drag.active].x = drag.start.text[drag.active].x + dx * scale; state.text[drag.active].y = drag.start.text[drag.active].y + dy * scale;
    }
    changed(); renderControls();
  });
  const stopDrag = () => { drag = undefined; };
  $('#drag-surface').addEventListener('pointerup', stopDrag);
  $('#drag-surface').addEventListener('lostpointercapture', stopDrag);
  window.addEventListener('resize', () => sendPreview());

  async function init() {
    try { state = Model.normalize(bridge ? await bridge.getSettings() : JSON.parse(localStorage.getItem(storageKey) || '{}')); }
    catch { state = Model.normalize(); }
    loaded = true; document.body.dataset.loaded = 'true'; renderAll();
    setStatus('配置已读取 · 修改会自动保存');
  }
  init();
})();

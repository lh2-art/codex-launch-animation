(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.LauncherSettings = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fonts = [
    ['Microsoft YaHei', '微软雅黑'], ['Microsoft YaHei UI', '微软雅黑 UI'], ['Segoe UI', 'Segoe UI'],
    ['Arial', 'Arial'], ['SimSun', '宋体'], ['SimHei', '黑体'], ['KaiTi', '楷体'], ['Consolas', 'Consolas']
  ];
  const defaults = {
    schemaVersion: 2, autoPlay: true, uiLanguage: 'zh-CN',
    motion: { gatherSpeed: 1, rotationSpeed: 1 },
    layout: { x: 50, y: 50, openingIconSize: 52, iconSize: 210.6, iconX: 0, iconY: 0, iconGap: 35.64, nameGap: 11.88, captionGap: 14.04 },
    colors: { openingStart: '#00d3ee', openingEnd: '#19ff9e', openingRing: '#24ffc9', brandIcon: '#ffffff', motto: '#ffffff', name: '#ffffff', caption: '#c5c5c5' },
    text: {
      motto: { font: 'Microsoft YaHei', fontSize: 46.44, spacing: 11.15, x: 0, y: 0 },
      name: { font: 'Arial', fontSize: 43.2, spacing: 10.37, x: 0, y: 0 },
      caption: { font: 'Arial', fontSize: 16.2, spacing: 7.78, x: 0, y: 0 }
    }
  };
  const limits = {
    gatherSpeed: [.25, 3],
    rotationSpeed: [.25, 2],
    x: [0, 100], y: [0, 100], openingIconSize: [10, 90], iconSize: [32, 540],
    iconX: [-500, 500], iconY: [-500, 500], iconGap: [0, 200], nameGap: [0, 160], captionGap: [0, 160],
    fontSize: [6, 140], spacing: [0, 50], textX: [-600, 600], textY: [-400, 400]
  };
  function number(value, fallback, range) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.round(Math.min(range[1], Math.max(range[0], value)) * 100) / 100;
  }
  function normalize(raw = {}) {
    if (!raw || typeof raw !== 'object') raw = {};
    const result = { schemaVersion: 2, autoPlay: typeof raw.autoPlay === 'boolean' ? raw.autoPlay : true, uiLanguage: raw.uiLanguage === 'en' ? 'en' : 'zh-CN', layout: {}, text: {}, colors: {} };
    result.motion = Object.fromEntries(Object.entries(defaults.motion).map(([key,fallback])=>[key,number(raw.motion?.[key],fallback,limits[key])]));
    for(const [key,fallback] of Object.entries(defaults.colors)) result.colors[key]=typeof raw.colors?.[key]==='string' && /^#[0-9a-f]{6}$/i.test(raw.colors[key]) ? raw.colors[key].toLowerCase() : fallback;
    for (const [key, fallback] of Object.entries(defaults.layout)) result.layout[key] = number(raw.layout?.[key], fallback, limits[key]);
    for (const [key, fallback] of Object.entries(defaults.text)) {
      const input = raw.text?.[key] || {};
      result.text[key] = {
        font: fonts.some(([font]) => font === input.font) ? input.font : fallback.font,
        fontSize: number(input.fontSize, fallback.fontSize, limits.fontSize),
        spacing: number(input.spacing, fallback.spacing, limits.spacing),
        x: number(input.x, fallback.x, limits.textX), y: number(input.y, fallback.y, limits.textY)
      };
    }
    return result;
  }
  function merge(current, patch) {
    return normalize({
      ...current, ...patch, layout: { ...current.layout, ...patch?.layout },
      motion: { ...current.motion, ...patch?.motion },
      colors: { ...current.colors, ...patch?.colors },
      text: Object.fromEntries(Object.keys(defaults.text).map(key => [key, { ...current.text[key], ...patch?.text?.[key] }]))
    });
  }
  function apply(document, input) {
    const settings = normalize(input);
    const style = document.documentElement.style;
    const layout = settings.layout;
    for(const [key,css] of Object.entries({openingStart:'--opening-start',openingEnd:'--opening-end',openingRing:'--opening-ring-color',brandIcon:'--brand-icon-color',motto:'--motto-color',name:'--name-color',caption:'--caption-color'})) style.setProperty(css,settings.colors[key]);
    style.setProperty('--brand-x', layout.x + '%'); style.setProperty('--brand-y', layout.y + '%');
    style.setProperty('--opening-icon-size', layout.openingIconSize + 'vmin');
    style.setProperty('--brand-icon-size', `clamp(${Math.min(96, layout.iconSize)}px, ${layout.iconSize / 10.8}vmin, ${layout.iconSize * 4 / 3}px)`);
    for (const [key, css] of Object.entries({ iconX: '--icon-x', iconY: '--icon-y', iconGap: '--icon-gap', nameGap: '--name-gap', captionGap: '--caption-gap' })) {
      style.setProperty(css, layout[key] / 10.8 + 'vmin');
    }
    for (const [key, item] of Object.entries(settings.text)) {
      const floor = Math.min(item.fontSize, { motto: 20, name: 19, caption: 11 }[key]);
      style.setProperty(`--${key}-font`, `"${item.font}", sans-serif`);
      style.setProperty(`--${key}-size`, `clamp(${floor}px, ${item.fontSize / 10.8}vmin, ${item.fontSize * 4 / 3}px)`);
      style.setProperty(`--${key}-spacing`, item.spacing / 10.8 + 'vmin');
      style.setProperty(`--${key}-x`, item.x / 10.8 + 'vmin'); style.setProperty(`--${key}-y`, item.y / 10.8 + 'vmin');
    }
    return settings;
  }
  return { fonts, defaults, limits, normalize, merge, apply };
});

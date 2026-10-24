import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.dirname(root);
const read = filename => fs.readFileSync(path.join(source, filename), 'utf8');
const js = text => `<script>${text.replaceAll('</script', '<\\/script')}</script>`;
const image = filename => `data:image/${filename.endsWith('.png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(path.join(source, 'assets', filename)).toString('base64')}`;

// PowerShell resolves the user-local runtime without author-specific paths.
const portableManifest={"mcpServers": {"launch_animation": {"command": "powershell.exe", "args": ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "& (Join-Path $env:LOCALAPPDATA 'CodexLaunchAnimation\\in-app-plugin\\launch-mcp.ps1')"], "startup_timeout_sec": 20, "default_tools_approval_mode": "approve"}}};
fs.writeFileSync(path.join(root,'.mcp.json'),JSON.stringify(portableManifest,null,2)+'\n');

await build({ entryPoints: [path.join(root, 'server.mjs')], outfile: path.join(root, 'server.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node20', banner: { js: 'const __pluginImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__pluginImportMetaUrl' }, supported: { 'top-level-await': false } }).catch(async error => { throw error; });
const bridge = await build({ entryPoints: [path.join(root, 'bridge.mjs')], bundle: true, platform: 'browser', format: 'iife', write: false, minify: true });

let preview = read('index.html').match(/<main id="root"[\s\S]*?<\/main>/)[0];
preview = preview.replaceAll('./assets/opening-clouds.png',image('opening-clouds.png')).replaceAll('./assets/chatgpt-shortcut-icon.png', image('chatgpt-shortcut-icon.png'))
  .replaceAll('./assets/gpt6-stars-full-poster.jpg', image('gpt6-stars-full-poster.jpg'))
  .replaceAll('./assets/gpt6-stars-tail.jpg', image('gpt6-stars-tail.jpg'))
  .replace(/<source[^>]+>/, '').replace('preload="auto"', 'preload="none"');

// Keep the shipped animation in one DOM tree: host widgets need no nested iframe or external origins.
let motion = read('script.js').replace("const queryMode = new URLSearchParams(window.location.search).get('mode');", "const queryMode = 'editor';")
  .replaceAll('document.body', 'previewRoot').replaceAll('document.querySelectorAll', 'previewRoot.querySelectorAll.bind(previewRoot)')
  .replaceAll('document.querySelector', 'previewRoot.querySelector.bind(previewRoot)')
  .replaceAll('window.LauncherSettings.apply(document,', 'window.LauncherSettings.apply(previewDocument,')
  .replaceAll("window.parent.postMessage(", 'report(')
  .replace("window.addEventListener('message',", "window.addEventListener('launcher-preview-command',")
  .replace('if (event.source !== window.parent) return;', '')
  .replace('const message = event.data;', 'const message = event.detail;')
  .replace('width: innerWidth, height: innerHeight', 'width: previewRoot.clientWidth, height: previewRoot.clientHeight')
  .replace("const savedAutoPlay = localStorage.getItem(autoPlayKey);", 'const savedAutoPlay = null;')
  .replace('const tl = gsap.timeline({ paused: true,', 'const tl = gsap.timeline({ paused: true,')
  .replace('if (bridge) tl.pause();', 'tl.pause();')
  .replace("if (bridge) officialVideo.addEventListener('ended'", "officialVideo.addEventListener('ended'")
  .replace("if (bridge) officialVideo.addEventListener('error', () => bridge.closeOverlay());", "officialVideo.addEventListener('error', () => { tl.pause(); window.setAnimationStatus('预览视频播放失败，请重试'); });");
motion = motion.replace("  'use strict';", `  'use strict';
  const previewRoot = document.getElementById('live-preview');
  const report = data => window.dispatchEvent(new CustomEvent('launcher-preview-report', { detail: data }));
  const previewDocument = { documentElement: { style: { setProperty: (name, value) => previewRoot.style.setProperty(name, value.replaceAll('vmin', 'cqmin')) } } };
`);

let controls = read('settings.js').replace("window.addEventListener('message',", "window.addEventListener('launcher-preview-report',")
  .replace('if (event.source !== frame.contentWindow) return;', '')
  .replaceAll('event.data', 'event.detail')
  .replace("$('#play-full').addEventListener('click', () => frame.contentWindow.postMessage({ type: 'editor:play', full: true }, '*'));", `$('#play-full').addEventListener('click', async () => {
    const button = $('#play-full'); if (button.disabled) return; button.disabled = true;
    try { await window.loadAnimationMedia(); frame.contentWindow.postMessage({ type: 'editor:play', full: true }, '*'); window.setAnimationStatus('正在预览完整启动动画'); }
    catch (error) { $('#save-status').textContent = error.message; }
    finally { button.disabled = false; }
  });`)
  .replace('catch { state = Model.normalize(); }', "catch { window.setAnimationStatus('配置读取失败，请重新打开控制页；尚未修改已保存配置'); return; }")
  .replace('loaded = true; document.body.dataset.loaded', "loaded = true; window.dispatchEvent(new Event('animation-control-loaded')); document.body.dataset.loaded");
const facade = `document.getElementById('live-preview').contentWindow = { postMessage: data => window.dispatchEvent(new CustomEvent('launcher-preview-command', { detail: data })) };`;
let css = read('style.css').replaceAll('vmin', 'cqmin');
css = css.replace(/(^|\})\s*([^@{}][^{}]*)\{/g, (_match, separator, selectors) => {
  return separator + selectors.split(',').map(selector => {
    selector = selector.trim();
    if ([':root','html','body'].includes(selector)) return '#live-preview';
    return '#live-preview ' + selector.replaceAll('body[data-mode=', '#live-preview[data-mode=');
  }).join(',') + '{';
});
css += '\n#live-preview{position:absolute;inset:0;width:100%;height:100%;container-type:size;overflow:hidden;background:#070b12;} #live-preview .settings-button,#live-preview .settings-panel,#live-preview .replay,#live-preview .overlay-close,#live-preview .startup-skip{display:none!important;}';
const responsive = '\n@media(max-width:700px){body{height:auto;min-height:100vh}.workspace{display:flex;flex-direction:column}.preview-column{min-height:440px}.canvas-area{height:250px;flex:none}.control-column{overflow:visible;border-left:0;border-top:1px solid var(--line)}.app-header{padding:14px;flex-wrap:wrap}.app-location{display:none}}';
let html = read('settings.html').replace(/<link[^>]+>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<iframe[^>]+><\/iframe>/, `<div id="live-preview">${preview}</div>`)
  .replace('<span class="app-location" data-i18n>控制台</span>', '<span class="app-location" data-i18n>应用内控制页</span>')
  .replace('</head>', () => `<style>${read('settings.css')}${responsive}</style><style>${css}</style></head>`)
  .replace('</body>', () => `${js(read('assets/gsap.min.js'))}${js(read('settings-model.js'))}${js(read('settings-i18n.js'))}${js(bridge.outputFiles[0].text)}${js(facade)}${js(controls)}${js(motion)}${js(read('skin-veil-controls.js'))}</body>`);
fs.writeFileSync(path.join(root, 'control.html'), html);
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.copyFileSync(path.join(source, 'assets/gpt6-stars-full.mp4'), path.join(root, 'assets/gpt6-stars-full.mp4'));
fs.copyFileSync(path.join(source, 'assets/chatgpt-shortcut-icon.png'), path.join(root, 'assets/icon.png'));
fs.mkdirSync(path.join(root, 'licenses'), { recursive: true });
fs.copyFileSync(path.join(source, 'licenses/artemis-startup-MIT.txt'), path.join(root, 'licenses/artemis-startup-MIT.txt'));
const distribution = path.join(root, 'dist');
fs.mkdirSync(path.join(distribution, '.codex-plugin'), { recursive: true });
fs.mkdirSync(path.join(distribution, 'assets'), { recursive: true });
fs.mkdirSync(path.join(distribution, 'licenses'), { recursive: true });
for (const file of ['server.cjs','launch-mcp.ps1','control.html','README.md','.mcp.json','.codex-plugin/plugin.json','assets/icon.png','assets/gpt6-stars-full.mp4','licenses/artemis-startup-MIT.txt']) {
  fs.copyFileSync(path.join(root, file), path.join(distribution, file));
}
console.log(`Built in-app plugin UI: ${Buffer.byteLength(html)} bytes; video stays outside the UI resource.`);

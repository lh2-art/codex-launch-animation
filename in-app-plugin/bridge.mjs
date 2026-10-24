import { App } from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'ChatGPT 启动动画', version: '2.7.0' }, {}, { autoResize: false });
const tr = source => window.AnimationI18n.text(source);
let connected;
let mediaPromise;
let mediaUrl;
let requestPreview = false;
const call = async (name, args = {}) => {
  await connected;
  const response = await app.callServerTool({ name, arguments: args });
  if (response.isError) throw new Error(response.content?.find(item => item.type === 'text')?.text || tr('插件请求失败'));
  return response.structuredContent;
};
window.codexLauncher = {
  getSkinVeil: async () => call('get_skin_veil'),
  setSkinVeil: async patch => call('set_skin_veil', patch),
  getSettings: async () => (await call('get_animation_configuration')).settings,
  updateSettings: async settings => (await call('update_animation_configuration', { settings })).settings
};
window.loadAnimationMedia = () => {
  if (mediaPromise) return mediaPromise;
  mediaPromise = (async () => {
    const pieces = [];
    let offset = 0, total = Infinity;
    while (offset < total) {
      const chunk = await call('read_animation_media', { offset, length: 524288 });
      if (!chunk || !Number.isSafeInteger(chunk.total) || chunk.total <= 0 || chunk.total > 24 * 1024 * 1024 || chunk.next <= offset || chunk.next > chunk.total || (Number.isFinite(total) && total !== chunk.total)) throw new Error(tr('预览视频数据不完整'));
      const raw = atob(chunk.data);
      if (raw.length !== chunk.next - offset) throw new Error(tr('预览视频数据不完整'));
      pieces.push(Uint8Array.from(raw, char => char.charCodeAt(0)));
      offset = chunk.next; total = chunk.total;
      document.querySelector('#save-status').textContent = `${tr('正在载入本地预览视频')} · ${Math.round(offset / total * 100)}%`;
    }
    mediaUrl = URL.createObjectURL(new Blob(pieces, { type: 'video/mp4' }));
    const video = document.querySelector('#gpt6-official-video');
    await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => { clearTimeout(timer); video.removeEventListener('loadeddata', ok); video.removeEventListener('error', failed); document.removeEventListener('securitypolicyviolation', blocked); };
      const ok = () => { if (settled) return; settled = true; cleanup(); resolve(); };
      const fail = reason => {
        if (settled) return; settled = true;
        window.animationMediaDiagnostics = { reason, code: video.error?.code || 0, bytes: offset };
        cleanup();
        reject(new Error(tr(reason === 'policy' ? '预览视频被安全策略拦截，请关闭控制台后重新打开' : reason === 'timeout' ? '预览视频加载超时，请重试' : '预览视频无法解码')));
      };
      const blocked = event => { if (event.effectiveDirective === 'media-src' && (event.blockedURI === 'blob' || event.blockedURI?.startsWith('blob:'))) fail('policy'); };
      const failed = () => setTimeout(() => fail('decode'), 0);
      const timer = setTimeout(() => fail('timeout'), 10000);
      video.addEventListener('loadeddata', ok, { once: true }); video.addEventListener('error', failed, { once: true });
      document.addEventListener('securitypolicyviolation', blocked);
      video.src = mediaUrl;
      video.load();
    });
    // Warm the decoder and compositor before the five-second opening starts.
    // loadeddata alone does not mean Chromium has submitted a video frame.
    await video.play();
    await new Promise(resolve => {
      let callback;
      const done = () => { clearTimeout(timer); if (callback !== undefined) video.cancelVideoFrameCallback(callback); resolve(); };
      const timer = setTimeout(done, 500);
      if (video.requestVideoFrameCallback) callback = video.requestVideoFrameCallback(done);
      else requestAnimationFrame(done);
    });
    video.pause();
    if (video.currentTime > 0) {
      await new Promise((resolve, reject) => {
        const done = () => { clearTimeout(timer); video.removeEventListener('seeked', done); resolve(); };
        const timer = setTimeout(() => { video.removeEventListener('seeked', done); reject(new Error(tr('预览视频加载超时，请重试'))); }, 3000);
        video.addEventListener('seeked', done, { once: true });
        video.currentTime = 0;
      });
    }
    return mediaUrl;
  })().catch(error => {
    mediaPromise = undefined;
    const video = document.querySelector('#gpt6-official-video');
    video.pause(); video.removeAttribute('src'); video.load();
    if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = undefined;
    throw error;
  });
  return mediaPromise;
};
app.ontoolresult = ({ structuredContent }) => {
  if (structuredContent?.preview) {
    if (document.body.dataset.loaded === 'true') document.querySelector('#play-full')?.click();
    else requestPreview = true;
  }
};
window.addEventListener('animation-control-loaded', () => {
  if (requestPreview) { requestPreview = false; document.querySelector('#play-full')?.click(); }
});
app.onhostcontextchanged = context => {
  if (context.theme) document.documentElement.dataset.hostTheme = context.theme;
};
connected = app.connect();
connected.catch(() => { window.setAnimationStatus('无法连接插件，请重新打开控制页'); });
window.addEventListener('pagehide', () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); });

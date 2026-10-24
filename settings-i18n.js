(() => {
  'use strict';
  const english = {
    '皮肤遮罩':'Wallpaper mask','黑色遮罩不透明度':'Dark mask opacity',
    '0% 完全透明，100% 最深；只调节当前皮肤，不影响启动动画。':'0% is transparent, 100% is darkest. Applies to the current wallpaper.',
    '拖动即自动保存，当前皮肤实时生效':'Changes save automatically and apply to the current wallpaper.',
    '尚未找到当前皮肤':'No active wallpaper found',
    '请在本机控制台调节皮肤遮罩':'Adjust the wallpaper mask in the local console.',
    '皮肤设置读取失败，请重新打开控制台':'Could not read wallpaper settings. Reopen the console.',
    '遮罩已保存，当前皮肤实时生效':'Mask saved and applied to the current wallpaper.',
    '遮罩保存失败，若已切换皮肤请重新打开控制台':'Could not save the mask. Reopen the console if the wallpaper changed.',
    '正在调整遮罩…':'Adjusting mask…',
    '旋转速度':'Rotation speed',
    '文字汇聚':'Text gathering','汇聚速度':'Gather speed',
    '1× 为原速，数值越大汇聚越快。调整后点击“播放文字汇聚”预览。':'1× is the original speed. Higher values gather faster. Use Preview title after adjusting.',
    '拖动预览可移动所选对象。全程在原生窗口内不透明播放，镜头推进固定后图标开始旋转。': 'Drag to reposition the selected object. The entire animation is opaque inside the native window. The icon rotates after the camera settles.',
    '结尾图标颜色':'Closing icon color','文字颜色':'Text color','渐变起始色':'Gradient start','渐变结束色':'Gradient end','外圈颜色':'Ring color',
    'ChatGPT 启动动画': 'ChatGPT startup animation', '控制台': 'Console', '应用内控制页': 'In-app console', '语言': 'Language',
    '预览画面': 'Preview', '结尾文字': 'Closing title', '开场图标': 'Opening icon', '窗口比例': 'Aspect ratio',
    '播放文字汇聚': 'Preview title', '播放完整动画': 'Play full animation', '恢复默认外观': 'Reset appearance',
    '拖动预览可移动所选对象。棋盘格仅表示素材透明，不代表应用窗口透明。': 'Drag to move the selected object. The checkerboard indicates asset transparency, not a transparent application window.',
    '选择对象': 'Select object', '整体': 'Layout', '图标': 'Icon', '上下间距': 'Vertical spacing',
    '启用后，从原桌面 ChatGPT 快捷方式打开时自动播放；禁用后直接进入原生应用。预览始终可用。': 'When enabled, the animation plays from your original desktop ChatGPT shortcut. When disabled, ChatGPT opens directly. Preview is always available.',
    '读取设置中': 'Loading settings', '插件已启用': 'Animation enabled', '插件已禁用': 'Animation disabled',
    '禁用插件': 'Disable animation', '启用插件': 'Enable animation', '跳过': 'Skip', '跳过启动动画预览': 'Skip animation preview',
    '正在读取保存的配置': 'Loading saved settings', '正在保存…': 'Saving…', '已自动保存 · 下次启动生效': 'Saved · Applies on next launch',
    '保存失败，请重新调整后重试': 'Could not save. Edit a setting to retry.', '预览已更新，等待保存…': 'Preview updated · Saving soon…',
    '配置已读取 · 修改会自动保存': 'Settings loaded · Changes save automatically',
    '整体水平位置': 'Layout horizontal position', '整体垂直位置': 'Layout vertical position', '图标大小': 'Icon size',
    '图标水平偏移': 'Icon horizontal offset', '图标垂直偏移': 'Icon vertical offset', '字体': 'Font', '字号': 'Font size',
    '字间距': 'Character spacing', '水平偏移': 'Horizontal offset', '垂直偏移': 'Vertical offset',
    '图标 → 中文': 'Icon → Motto', '中文 → ChatGPT': 'Motto → ChatGPT', 'ChatGPT → Codex': 'ChatGPT → Codex', '旋转图标大小': 'Opening icon size',
    '微软雅黑': 'Microsoft YaHei', '微软雅黑 UI': 'Microsoft YaHei UI', '宋体': 'SimSun', '黑体': 'SimHei', '楷体': 'KaiTi',
    '配置读取失败，请重新打开控制页；尚未修改已保存配置': 'Could not load settings. Reopen the console. Your saved settings are unchanged.',
    '正在预览完整启动动画': 'Playing the full startup animation', '预览视频播放失败，请重试': 'Preview playback failed. Try again.',
    '插件请求失败': 'Plugin request failed', '预览视频数据不完整': 'Incomplete preview video data', '预览视频无法解码': 'Could not decode the preview video',
    '预览视频被安全策略拦截，请关闭控制台后重新打开': 'Preview video was blocked by the security policy. Close and reopen the console.',
    '预览视频加载超时，请重试': 'Preview video loading timed out. Try again.',
    '无法连接插件，请重新打开控制页': 'Could not connect to the plugin. Reopen the console.', '正在载入本地预览视频': 'Loading local preview video',
    '动画预览': 'Animation preview', '动画外观控制': 'Animation appearance controls', '编辑对象': 'Edit object',
    '实时动画预览': 'Live animation preview', '拖动以调整所选对象的位置': 'Drag to adjust the selected object'
  };
  let language = 'zh-CN';
  const text = source => language === 'en' ? english[source] || source : source;
  const apply = value => {
    language = value === 'en' ? 'en' : 'zh-CN';
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach(node => {
      if (!node.dataset.i18n) node.dataset.i18n = node.textContent;
      node.textContent = text(node.dataset.i18n);
    });
    document.querySelectorAll('[aria-label],[title]').forEach(node => {
      for (const attr of ['aria-label', 'title']) {
        if (!node.hasAttribute(attr)) continue;
        const key = attr === 'title' ? 'i18nTitle' : 'i18nAria';
        if (!node.dataset[key]) node.dataset[key] = node.getAttribute(attr);
        node.setAttribute(attr, text(node.dataset[key]));
      }
    });
    document.title = text('ChatGPT 启动动画') + ' · ' + text('控制台');
  };
  window.AnimationI18n = { text, apply, get language() { return language; } };
  window.setAnimationStatus = source => {
    const status = document.getElementById('save-status');
    status.dataset.source = source;
    status.textContent = text(source);
  };
})();

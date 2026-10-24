# Codex Launch Animation · Windows 启动动画

在 **Codex 原生主窗口内**播放“镜头推进 → 图标旋转 → 群星视频 → 文字汇聚”，并提供中文 / English 控制台。支持可选的 Codex Dream Skin 皮肤衔接，保持原快捷方式入口。

> **开场图标旋转使用并修改了 [yshuang722-spec/codex-startup-animation](https://github.com/yshuang722-spec/codex-startup-animation) 的源码。原作者：Artemis / Tom，MIT 许可证。** 本项目在此基础上增加了原生窗口内播放、可调速度、文字汇聚、皮肤衔接和控制台；不把上游旋转实现声称为本项目独立原创。完整声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

![开场背景](assets/opening-clouds.png)

非 OpenAI 官方项目，与 OpenAI 无隶属、赞助或官方认可关系。仅支持 Windows 10/11 x64 的 Microsoft Store 版 Codex（部分版本的程序或窗口名称是 ChatGPT）；不保证适用于独立 ChatGPT 客户端、macOS、Linux 或未来修改了窗口结构的版本。

## 安装

1. 安装并正常登录官方 Codex 桌面客户端。
2. 从 [Releases](https://github.com/lh2-art/codex-launch-animation/releases/latest) 下载 Windows ZIP 并**完整解压**。可用随附 `SHA256SUMS.txt` 核对文件。
3. 在解压目录打开终端，运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install.ps1
```

安装到当前用户的 `%LOCALAPPDATA%\CodexLaunchAnimation`，不需要管理员权限。会备份并更新已有 `ChatGPT.lnk` 或 `Codex.lnk`，保留其名称和图标；若两者都存在，请用 `-ShortcutPath` 指定。两者都不存在时创建“Codex 启动动画”入口。安装不会关闭或重启正在运行的 Codex。

可以先加 `-WhatIf` 查看操作计划。不想注册应用内控制页时可加 `-SkipPluginRegistration`；此时仍可运行安装目录里的 `desktop-extension\CodexLaunchAnimation.exe --settings`。

应用内控制页入口：`codex://plugins/chatgpt-launch-animation@codex-launch-animation/app/open_animation_control`。修改或升级插件后，旧控制页可能需要关闭后重新打开；不要为了安装而强行结束 Codex。

## 使用

- 从安装时选择的原快捷方式启动。已有 Codex 实例时只恢复窗口，不重复播放动画。
- 控制台可调旋转速度、文字汇聚速度、字体、位置、间距、图标大小和颜色。
- “皮肤遮罩”滑块调节当前皮肤的深色遮罩：0% 完全透明，100% 最深，自动保存。无皮肤管理器时该项禁用。
- 播放时可点击“跳过”或按 Esc；结束、跳过或错误时清理自己的播放层，不结束 Codex。
- 关闭启动动画开关后仍保留已配置的皮肤加载流程。

## 可选皮肤

已适配本地 **Codex Dream Skin 1.7.3** 的后端约定。先用皮肤管理器设置一次主题；启动器随后自动查找 `%LOCALAPPDATA%\CodexDreamSkin` 中的安装和主题，管理器主窗口不必提前打开。没有检测到管理器时使用普通动画流程。

皮肤管理器、Wallpaper Engine 和 SceneViewer **不随本仓库分发**。视频皮肤可直接使用管理器的本地视频；场景皮肤需要兼容的 SceneViewer 和 Wallpaper Engine。自动推断失败时，设置 `WALLPAPER_ENGINE_ASSETS` 指向 Wallpaper Engine 的 `assets` 目录，或在 `%APPDATA%\codex-launcher\skin-integration.json` 配置 `wallpaperAssets`。不要把个人皮肤状态或视频库上传到仓库。

## 从源码构建

需要 Node.js 22+、npm、Git 和 Windows。运行时使用 PowerShell 7（若已安装），否则使用 Windows 自带 PowerShell 5.1。可用 `CODEX_PWSH` 指定 PowerShell 路径。

```powershell
git clone https://github.com/lh2-art/codex-launch-animation.git
cd codex-launch-animation
npm ci
npm ci --prefix in-app-plugin
npm test
node in-app-plugin/build.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-desktop.ps1
node in-app-plugin/tests/mcp-smoke.mjs --dist
node tests/portable-mcp-smoke.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1
```

构建后可运行 `Install.ps1`。仓库不包含 `node_modules`、Electron 二进制、个人设置、快捷方式备份或测试日志；Windows ZIP 则包含运行所需的 Electron，不要求使用者单独安装 Node.js。MCP 通过当前用户安装目录启动，不依赖作者的电脑路径。

CI 运行单元测试、MCP 检查和安装布局检查；`v*` 标签生成 Windows ZIP 和 SHA256 并发布到 Releases。发布包未进行商业代码签名，Windows 可能显示发布者未知；请仅从本仓库下载并核对散列。

## 卸载与排查

运行 `%LOCALAPPDATA%\CodexLaunchAnimation\Uninstall.ps1` 恢复入口，并移除能识别到的插件注册。若快捷方式被其他软件改过，自动恢复会停止。运行目录和用户配置保留，确认不再需要后可自行删除；卸载不会删除皮肤库或聊天记录。

动画设置和日志位于 `%APPDATA%\codex-launcher`；皮肤偏好由管理器自己保存。报告问题请提供应用版本、启动时间和脱敏日志，不要提交 `state.json`、登录数据、完整用户目录或视频库。调试端口仅绑定 `127.0.0.1`；不要向局域网或公网开放。

Windows 原生窗口 / CDP 接口依赖官方客户端实现，升级后可能需要兼容修正。独立测试不等于每个官方版本都经过冷启动验证；本仓库不承诺绕过所有第三方皮肤错误。

## 许可证与致谢

本项目新增代码使用 [MIT](LICENSE)。旋转源码沿用 Artemis / Tom 的 MIT 声明；本机调试接入参考 [chenyi380/baili-codex](https://github.com/chenyi380/baili-codex)。GSAP、Electron、依赖库和媒体分别保留其自身许可，见 [第三方声明](THIRD_PARTY_NOTICES.md) 与 [素材说明](ASSETS.md)。MIT 不授予 OpenAI 等品牌的商标权。

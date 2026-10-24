# 第三方源码、依赖与致谢

## 开场图标旋转：codex-startup-animation

**本项目开场图标旋转使用并修改了 https://github.com/yshuang722-spec/codex-startup-animation 的源码。**

- 原作者：Artemis / Tom。
- 原许可证：MIT，Copyright (c) 2026 Tom。
- 原许可证完整保留在 [licenses/artemis-startup-MIT.txt](licenses/artemis-startup-MIT.txt)。
- 最初参考版本：`c64fee6a56217a85a668ae8825511c858d9ac1d9`。
- 使用部分：图标逆时针加速旋转、渐变着色、分段圆环及点火视觉思路与实现移植。
- 本项目修改：移植到 Electron / GSAP / Web Animations；增加 3.2 秒镜头推进、5 秒可调旋转曲线、合成线程播放、用户设置和资源清理；随后衔接自定义群星视频和汇聚文字。

## 本机调试接入参考：baili-codex

- 来源：https://github.com/chenyi380/baili-codex 。
- Copyright (c) 2026 chenyi380，MIT；原文见 [licenses/baili-codex-MIT.txt](licenses/baili-codex-MIT.txt)。
- 本项目使用自己的签名、进程所属用户、loopback 端口、主文档和配置路径检查；不分发或执行上游安装器。

## 运行时与库

- **GSAP 3.14.2**：`assets/gsap.min.js` 保留原始版权和许可头，适用其 [Standard License](https://gsap.com/standard-license/)，不以本项目 MIT 重新授权；它不是 MIT 依赖。构建前请查看该版本适用条款。
- **Electron 39.x**：构建时由 npm 安装；其 MIT / Chromium / 第三方许可随 Electron 运行时一并进入 Windows 包。
- **MCP SDK、MCP Apps SDK、esbuild、zod 及其他 npm 依赖**：保留各自发布包中的许可。锁定版本与校验值记录在两份 `package-lock.json` 中。
- **Codex Dream Skin、Wallpaper Engine、SceneViewer**：可选外部组件，不随本仓库发布，分别适用其原作者的许可。

本仓库不声称上游代码、第三方库、标志或媒体由本项目原创。媒体见 [ASSETS.md](ASSETS.md)。

## Node.js

Windows 发布包附带来自 [nodejs.org](https://nodejs.org/dist/v22.23.4/) 的 Node.js 22.23.4 x64。构建时验证官方 ZIP 的 SHA-256；完整许可证及其第三方声明随包保存在 `desktop-extension/node-runtime/LICENSE`。

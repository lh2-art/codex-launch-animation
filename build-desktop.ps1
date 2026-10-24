param([switch]$ResourcesOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot 'node_modules\electron\dist'
$outputRoot = Join-Path $projectRoot 'desktop-extension'
if (!(Test-Path -LiteralPath (Join-Path $runtimeRoot 'electron.exe'))) { throw 'Electron runtime missing.' }
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
if (!$ResourcesOnly) { Get-ChildItem -LiteralPath $runtimeRoot | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $outputRoot -Recurse -Force } }
$appRoot = Join-Path $outputRoot 'resources\app'
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
foreach ($name in @('main.cjs','platform-runtime.cjs','skin-early.cjs','helper-client.cjs','native-launch.cjs','skin-launch.cjs','skin-scene.cjs','skin-scene-session.cjs','skin-integration.json','native-renderer.cjs','native-cdp.mjs','native-platform.ps1','native-windows.cs','native-icons.cs','skin-state.cjs','preload.cjs','skin-veil.cjs','skin-veil-controls.js','index.html','script.js','style.css','settings-model.js','settings-i18n.js','settings.html','settings.js','settings.css','package.json')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $appRoot -Force
}
$legacyHelper = Join-Path $appRoot 'bounds-helper.ps1'
if (Test-Path -LiteralPath $legacyHelper) { Remove-Item -LiteralPath $legacyHelper -Force }
foreach($oldName in @('opening-client.cjs','opening-window.exe')){
    $oldPath=[IO.Path]::GetFullPath((Join-Path $appRoot $oldName))
    if(!$oldPath.StartsWith([IO.Path]::GetFullPath($appRoot)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid obsolete runtime path'}
    if(Test-Path -LiteralPath $oldPath){Remove-Item -LiteralPath $oldPath -Force}
}
$desktopHtml = [IO.File]::ReadAllText((Join-Path $appRoot 'index.html'))
$policy = '<meta http-equiv="Content-Security-Policy" content="default-src ''self''; script-src ''self'' ''sha256-ZTFXAUYK5CTNORiaVa+5W+BWxthgeEv9MBXe2ju6W7k=''; style-src ''self'' ''unsafe-inline''; img-src ''self'' data:; media-src ''self''; connect-src ''none''" />'
$desktopHtml = $desktopHtml.Replace('<!-- Desktop build inserts CSP here; HyperFrames injects its own preview runtime. -->', $policy)
[IO.File]::WriteAllText((Join-Path $appRoot 'index.html'), $desktopHtml, [Text.UTF8Encoding]::new($false))
$controlHtml = [IO.File]::ReadAllText((Join-Path $appRoot 'settings.html')).Replace('<!-- Desktop build inserts CSP here; HyperFrames injects its own preview runtime. -->', $policy)
[IO.File]::WriteAllText((Join-Path $appRoot 'settings.html'), $controlHtml, [Text.UTF8Encoding]::new($false))
$assetsRoot = Join-Path $appRoot 'assets'
Copy-Item -LiteralPath (Join-Path $projectRoot 'licenses') -Destination $appRoot -Recurse -Force
New-Item -ItemType Directory -Path $assetsRoot -Force | Out-Null
foreach ($name in @('opening-clouds.png','chatgpt-taskbar.ico','chatgpt-shortcut-icon.png','gpt6-stars-full.mp4','gpt6-stars-full-poster.jpg','gpt6-stars-tail.jpg','gsap.min.js')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot ('assets\' + $name)) -Destination $assetsRoot -Force
}
if (!$ResourcesOnly) { Copy-Item -LiteralPath (Join-Path $outputRoot 'electron.exe') -Destination (Join-Path $outputRoot 'ChatGPT启动扩展.exe') -Force }
Write-Output (Join-Path $outputRoot 'ChatGPT启动扩展.exe')


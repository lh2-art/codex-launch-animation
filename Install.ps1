[CmdletBinding(SupportsShouldProcess)]
param([string]$ShortcutPath,[switch]$SkipPluginRegistration)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'Windows 10/11 is required.'}
$source=$PSScriptRoot
$target=Join-Path $env:LOCALAPPDATA 'CodexLaunchAnimation'
$desktopRuntime=Join-Path $source 'desktop-extension'
$executable=Join-Path $desktopRuntime 'ChatGPT启动扩展.exe'
$plugin=Join-Path $source 'in-app-plugin\dist'
if(!(Test-Path -LiteralPath (Join-Path $plugin 'server.cjs'))){$plugin=Join-Path $source 'in-app-plugin'}
if(!(Test-Path -LiteralPath $executable) -or !(Test-Path -LiteralPath (Join-Path $plugin 'server.cjs'))){throw 'Build the project first, or download and fully extract the Windows release ZIP.'}
$existing=@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT启动扩展.exe'" | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)})
if($existing.Count){throw 'Close the startup-animation console before updating. The Codex application can remain open.'}
$desktop=[Environment]::GetFolderPath('Desktop')
if(!$ShortcutPath){
 $candidates=@('ChatGPT.lnk','Codex.lnk') | ForEach-Object {Join-Path $desktop $_} | Where-Object {Test-Path -LiteralPath $_}
 if(@($candidates).Count -gt 1){throw 'Both ChatGPT.lnk and Codex.lnk exist. Specify -ShortcutPath to select the entry to update.'}
 if(@($candidates).Count -eq 1){$ShortcutPath=@($candidates)[0]}else{$ShortcutPath=Join-Path $desktop 'Codex 启动动画.lnk'}
}
$ShortcutPath=[IO.Path]::GetFullPath($ShortcutPath)
$runtimeTarget=Join-Path $target 'desktop-extension\ChatGPT启动扩展.exe'
$shell=New-Object -ComObject WScript.Shell
function Copy-InstallTree([string]$From,[string]$To){
 foreach($item in Get-ChildItem -LiteralPath $From -File -Recurse -Force){
  $relative=$item.FullName.Substring($From.TrimEnd('\').Length).TrimStart('\')
  $destination=Join-Path $To $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force|Out-Null
  if((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $item.FullName).Hash -eq (Get-FileHash -LiteralPath $destination).Hash){continue}
  Copy-Item -LiteralPath $item.FullName -Destination $destination -Force
 }
}
$shortcut=$shell.CreateShortcut($ShortcutPath)
$stateFile=Join-Path $target 'install-state.json'
if($PSCmdlet.ShouldProcess($target,'Install animation runtime and preserve existing settings')){
 New-Item -ItemType Directory -Path $target -Force | Out-Null
 if(!(Test-Path -LiteralPath $stateFile)){
  $existed=Test-Path -LiteralPath $ShortcutPath
  if($existed){Copy-Item -LiteralPath $ShortcutPath -Destination (Join-Path $target 'original-shortcut.lnk')}
  @{shortcut=$ShortcutPath;existed=[bool]$existed;expectedTarget=$runtimeTarget}|ConvertTo-Json|Set-Content -LiteralPath $stateFile -Encoding UTF8
 }else{
  $previous=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json
  if($previous.shortcut -ne $ShortcutPath){throw 'This installation already manages another shortcut. Uninstall it before selecting a different shortcut.'}
 }
 New-Item -ItemType Directory -Path (Join-Path $target 'desktop-extension') -Force | Out-Null
 Copy-InstallTree $desktopRuntime (Join-Path $target 'desktop-extension')
 New-Item -ItemType Directory -Path (Join-Path $target 'in-app-plugin') -Force | Out-Null
 Copy-InstallTree $plugin (Join-Path $target 'in-app-plugin')
 Copy-Item -LiteralPath (Join-Path $source 'Uninstall.ps1') -Destination $target -Force
 $shortcut.TargetPath=$runtimeTarget;$shortcut.Arguments='';$shortcut.WorkingDirectory=Split-Path -Parent $runtimeTarget
 if(!$shortcut.IconLocation -or $shortcut.IconLocation -eq ',0'){$shortcut.IconLocation=(Join-Path $target 'desktop-extension\resources\app\assets\chatgpt-taskbar.ico')+',0'}
 $shortcut.Save()
 $market=@{name='codex-launch-animation';interface=@{displayName='Codex Launch Animation'};plugins=@(@{name='chatgpt-launch-animation';source=@{source='local';path='./in-app-plugin'};policy=@{installation='AVAILABLE';authentication='ON_INSTALL'};category='Productivity'})}
 $marketDir=Join-Path $target '.agents\plugins';New-Item -ItemType Directory -Path $marketDir -Force|Out-Null
 $market|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $marketDir 'marketplace.json') -Encoding UTF8
 if(!$SkipPluginRegistration){
  $cliPath=$null
  $package=Get-AppxPackage -Name OpenAI.Codex|Select-Object -First 1
  if($package){$candidate=Join-Path $package.InstallLocation 'app\resources\codex.exe';if(Test-Path -LiteralPath $candidate){$cliPath=$candidate}}
  if(!$cliPath){$cli=Get-Command codex -ErrorAction SilentlyContinue|Select-Object -First 1;if($cli){$cliPath=$cli.Source}}
  if($cliPath){& $cliPath plugin marketplace add $target --json;if($LASTEXITCODE -ne 0){throw 'Runtime installed, but marketplace registration failed.'};& $cliPath plugin add chatgpt-launch-animation@codex-launch-animation --json;if($LASTEXITCODE -ne 0){throw 'Runtime installed, but plugin registration failed.'}}
  else{Write-Warning 'Codex CLI was not found. The desktop launcher is installed; register the local marketplace later.'}
 }
 Write-Host ('Installed: '+$target)
 Write-Host ('Shortcut: '+$ShortcutPath)
 Write-Host 'Codex was not started or stopped. Settings and wallpapers were preserved.'
}

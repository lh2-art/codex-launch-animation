[CmdletBinding(SupportsShouldProcess)]
param([switch]$SkipPluginRegistration)
$ErrorActionPreference='Stop'
$target=Join-Path $env:LOCALAPPDATA 'CodexLaunchAnimation'
$file=Join-Path $target 'install-state.json'
if(!(Test-Path -LiteralPath $file)){throw 'Installation record is missing; no shortcut was changed.'}
$state=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
$shell=New-Object -ComObject WScript.Shell
if(Test-Path -LiteralPath $state.shortcut){
 $link=$shell.CreateShortcut($state.shortcut)
 if($link.TargetPath -ne $state.expectedTarget){throw 'The shortcut was changed outside this plugin; automatic restore stopped.'}
 if($PSCmdlet.ShouldProcess($state.shortcut,'Restore original shortcut')){
  if($state.existed){Copy-Item -LiteralPath (Join-Path $target 'original-shortcut.lnk') -Destination $state.shortcut -Force}
  else{Remove-Item -LiteralPath $state.shortcut}
 }
}
$cli=Get-Command codex -ErrorAction SilentlyContinue|Select-Object -First 1
if(!$SkipPluginRegistration -and $cli -and $PSCmdlet.ShouldProcess('chatgpt-launch-animation@codex-launch-animation','Remove plugin registration')){& $cli.Source plugin remove chatgpt-launch-animation@codex-launch-animation}
Write-Host 'The original entry was restored. Codex, skin preferences and animation settings were preserved.'
Write-Host ('Runtime files remain at '+$target+' and can be deleted manually after closing its settings console.')

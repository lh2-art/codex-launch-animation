param([string]$Root,[string]$Profile,[int]$Port)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$source=[IO.File]::ReadAllText((Join-Path $Root 'native-platform.ps1'))
$match=[regex]::Match($source,"Add-Type -TypeDefinition @'\r?\n([\s\S]*?)\r?\n'@")
if(!$match.Success){throw 'Native launcher source missing'}
Add-Type -TypeDefinition $match.Groups[1].Value
Add-Type -Path (Join-Path $Root 'native-windows.cs')
Add-Type -Path (Join-Path $Root 'native-icons.cs')
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class FixtureWindow{[DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr window,int cmd);[DllImport("user32.dll")]public static extern bool IsIconic(IntPtr window);}'
$fixturePid=[StartupPackage]::LaunchExecutable((Join-Path $Root 'node_modules\electron\dist\electron.exe'),$Port,$Profile)
[Console]::Out.WriteLine((@{pid=$fixturePid}|ConvertTo-Json -Compress))
try {
 while($true){
  $command=[Console]::In.ReadLine();if($null -eq $command -or $command -eq 'q'){break}
  $window=[StartupWindows]::Find($fixturePid)
  if($command -eq 'hide'){$null=[FixtureWindow]::ShowWindowAsync($window,0)}
  if($command -eq 'minimize'){$null=[FixtureWindow]::ShowWindowAsync($window,6)}
  if($command -eq 'restore'){$null=[StartupWindows]::Reveal($window,$fixturePid)}
  if($command -eq 'icon'){
   $original=[StartupIcons]::ReadProperty($window,5)
   [StartupIcons]::Repair($window,(Join-Path $Root 'assets\chatgpt-taskbar.ico')+',0','launcher.icon.fixture')
   if($original -and [StartupIcons]::ReadProperty($window,5) -ne $original){throw 'Existing AppID changed'}
   [Console]::Out.WriteLine((@{appId=[StartupIcons]::ReadProperty($window,5);iconResource=[StartupIcons]::ReadProperty($window,3)}|ConvertTo-Json -Compress))
   continue
  }
  Start-Sleep -Milliseconds 120
  [Console]::Out.WriteLine((@{found=$window -ne [IntPtr]::Zero;visible=[StartupWindows]::IsWindowVisible($window);minimized=[FixtureWindow]::IsIconic($window)}|ConvertTo-Json -Compress))
 }
} finally {
 # This PID came only from the isolated Electron executable above, not Codex.
 $fixture=Get-Process -Id $fixturePid -ErrorAction SilentlyContinue
 if($fixture -and $fixture.Path -eq (Join-Path $Root 'node_modules\electron\dist\electron.exe')){Stop-Process -InputObject $fixture -ErrorAction SilentlyContinue}
}

# One fixed-protocol process for inspect, package activation, verification and recovery.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$nativeExe = $null
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($true) {
    $command = [Console]::In.ReadLine()
    if ($null -eq $command -or $command -eq 'q') { break }
    try {
        if ($command -eq 's') {
            $apps = @()
            foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'")) {
                if ($process.ExecutablePath -notmatch '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\ChatGPT\.exe$' -or $process.CommandLine -match '(?:^|\s)--type=') { continue }
                $port = 0; $profile = $null
                if ($process.CommandLine -match '--remote-debugging-port(?:=|\s+)([0-9]+)') { $port = [int]$Matches[1] }
                if ($process.CommandLine -match '--user-data-dir(?:=|\s+)(?:"([^"]+)"|(\S+))') {
                    $profile = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
                    $profile = [IO.Path]::GetFullPath($profile)
                }
                $apps += @{ pid=[int]$process.ProcessId; exe=$process.ExecutablePath; port=$port; profile=$profile; startedAt=$process.CreationDate.ToUniversalTime().ToString('o') }
            }
            $response = @{ ok=$true; apps=$apps }
        } elseif ($command -match '^f ([0-9]+)$') {
            $focusPid = [int]$Matches[1]
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$focusPid"
            if ($process.ExecutablePath -notmatch '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\ChatGPT\.exe$' -or $process.CommandLine -match '(?:^|\s)--type=') { throw 'Focus target is not the native main process' }
            $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
            if ($owner.ReturnValue -ne 0 -or $owner.Sid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Focus target belongs to another account' }
            if (!('StartupWindows' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'native-windows.cs') }
            $window = [StartupWindows]::Find($focusPid)
            $reactivated = $false
            if ($window -eq [IntPtr]::Zero) {
                # Re-send a launch to the same Electron profile. Its single-instance
                # handler can recreate a closed main window without stopping it.
                $signature = Get-AuthenticodeSignature -LiteralPath $process.ExecutablePath
                if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'OpenAI') { throw 'Existing application signature could not be verified' }
                $arguments = ''
                if ($process.CommandLine -match '--user-data-dir(?:=|\s+)(?:"([^"]+)"|(\S+))') {
                    $profile = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
                    $expected = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\cdp-profile'
                    if (![string]::Equals([IO.Path]::GetFullPath($profile),$expected,[StringComparison]::OrdinalIgnoreCase)) { throw 'Cannot reactivate an unexpected profile' }
                    $arguments = '--user-data-dir="' + $expected + '"'
                    if ($process.CommandLine -match '--remote-debugging-port(?:=|\s+)([0-9]+)') {
                        $debugPort = [int]$Matches[1]
                        if ($debugPort -lt 1024 -or $debugPort -gt 65535) { throw 'Invalid existing debug port' }
                        $arguments += ' --remote-debugging-address=127.0.0.1 --remote-debugging-port=' + $debugPort
                    }
                }
                $start = [Diagnostics.ProcessStartInfo]::new($process.ExecutablePath,$arguments)
                $start.UseShellExecute = $false
                $activation = [Diagnostics.Process]::Start($start)
                $activation.Dispose()
                $reactivated = $true
                $deadline = [DateTime]::UtcNow.AddSeconds(5)
                do { Start-Sleep -Milliseconds 100; $window = [StartupWindows]::Find($focusPid) } while ($window -eq [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline)
            }
            $focused = [StartupWindows]::Reveal($window,$focusPid)
            if ($window -ne [IntPtr]::Zero) { Start-Sleep -Milliseconds 100 }
            $visible = $window -ne [IntPtr]::Zero -and [StartupWindows]::IsWindowVisible($window)
            $response = @{ ok=$true; focused=$focused; visible=$visible; reactivated=$reactivated }
        } elseif ($command -match '^k ([0-9]+)$') {
            $iconPid = [int]$Matches[1]
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$iconPid"
            if ($process.ExecutablePath -notmatch '\\WindowsApps\\OpenAI\.Codex_[^\\]+__2p2nqsd0c76g0\\app\\ChatGPT\.exe$' -or $process.CommandLine -match '(?:^|\s)--type=') { throw 'Icon target is not the official main process' }
            $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
            if ($owner.ReturnValue -ne 0 -or $owner.Sid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Icon target belongs to another account' }
            if (!('StartupWindows' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'native-windows.cs') }
            if (!('StartupIcons' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'native-icons.cs') }
            $window = [StartupWindows]::Find($iconPid)
            if ($window -eq [IntPtr]::Zero) { throw 'No native window for icon repair' }
            $icon = Join-Path $PSScriptRoot 'assets\chatgpt-taskbar.ico'
            if (!(Test-Path -LiteralPath $icon -PathType Leaf)) { throw 'Taskbar icon is unavailable' }
            [StartupIcons]::Repair($window,$icon+',0','OpenAI.Codex_2p2nqsd0c76g0!App')
            $response = @{ok=$true;appId=[StartupIcons]::ReadProperty($window,5);iconResource=[StartupIcons]::ReadProperty($window,3)}
        } elseif ($command -match '^t ([0-9]+)$') {
            $recordedPid = [int]$Matches[1]
            $recorded = Get-CimInstance Win32_Process -Filter "ProcessId=$recordedPid"
            $response = if ($null -eq $recorded) { @{ok=$true;exists=$false} } else { @{ok=$true;exists=$true;startedAt=$recorded.CreationDate.ToUniversalTime().ToString('o')} }
        } elseif ($command -eq 'e') {
            # Focusing an existing app needs no signature/COM/compiler setup.
            # Never attach or inject through this fast path; activate the AUMID.
            $existing = @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object {
                $_.Path -match '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\ChatGPT\.exe$'
            } | Select-Object -ExpandProperty Id)
            $response = @{ ok=$true; running=$existing }
        } elseif ($command -eq 'i') {
            $package = Get-AppxPackage -Name OpenAI.Codex | Where-Object { $_.PackageFamilyName -eq 'OpenAI.Codex_2p2nqsd0c76g0' } | Select-Object -First 1
            if (!$package) { throw 'Official ChatGPT/Codex package not found' }
            $nativeExe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
            $signature = Get-AuthenticodeSignature -LiteralPath $nativeExe
            if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'OpenAI') { throw 'Native application signature could not be verified' }
            $running = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object { [string]::Equals($_.ExecutablePath,$nativeExe,[StringComparison]::OrdinalIgnoreCase) } | Select-Object -ExpandProperty ProcessId)
            # Compile once, before the opening clock starts. Get-NetTCPConnection
            # initializes a slow CIM provider on its first use during handoff.
            if (!('StartupTcp' -as [type])) {
                Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class StartupTcp {
 [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
 public static int[] DesktopBounds() { return new int[]{GetSystemMetrics(76),GetSystemMetrics(77),GetSystemMetrics(78),GetSystemMetrics(79)}; }
 [DllImport("iphlpapi.dll")] static extern uint GetExtendedTcpTable(IntPtr table,ref int size,bool order,int family,int tableClass,uint reserved);
 public static int[] Owners(int port) {
  int size=0; uint result=GetExtendedTcpTable(IntPtr.Zero,ref size,false,2,5,0);
  if(result!=122) throw new InvalidOperationException("Cannot size native TCP table");
  for(int attempt=0;attempt<3;attempt++) {
   IntPtr data=Marshal.AllocHGlobal(size);
   try {
    result=GetExtendedTcpTable(data,ref size,false,2,5,0);
    if(result==122) continue;
    if(result!=0) throw new InvalidOperationException("Cannot read native TCP table");
    var owners=new HashSet<int>(); int count=Marshal.ReadInt32(data);
    for(int i=0;i<count;i++) {
     IntPtr row=IntPtr.Add(data,4+i*24);
     int encoded=Marshal.ReadInt32(row,8);
     int localPort=((encoded&255)<<8)|((encoded>>8)&255);
     if(Marshal.ReadInt32(row)!=2||localPort!=port) continue;
     if(Marshal.ReadInt32(row,4)!=0x0100007f) throw new InvalidOperationException("Debug listener is not loopback only");
     owners.Add(Marshal.ReadInt32(row,20));
    }
    if(owners.Count==0) throw new InvalidOperationException("Native debug listener not found");
    int[] output=new int[owners.Count]; owners.CopyTo(output); return output;
   } finally { Marshal.FreeHGlobal(data); }
  }
  throw new InvalidOperationException("Native TCP table changed repeatedly");
 }
}
[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IStartupActivation {
 [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appId,[MarshalAs(UnmanagedType.LPWStr)] string arguments,uint options,out uint processId);
}
public static class StartupPackage {
 public static bool Available() {
  try {
  object manager=Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c")));
  try { return manager is IStartupActivation; } finally { Marshal.FinalReleaseComObject(manager); }
  } catch { return false; }
 }
 public static uint Launch(int port) {
  return LaunchProfile(port,null);
 }
 public static uint LaunchProfile(int port,string profile) {
  object manager=Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c")));
  try {
   string args="--remote-debugging-address=127.0.0.1 --remote-debugging-port="+port+" --disable-renderer-backgrounding --disable-background-timer-throttling";
   if(profile!=null) args+=" --user-data-dir=\""+profile+"\"";
   uint pid; int result=((IStartupActivation)manager).ActivateApplication("OpenAI.Codex_2p2nqsd0c76g0!App",args,2,out pid);
   Marshal.ThrowExceptionForHR(result); return pid;
  } finally { Marshal.FinalReleaseComObject(manager); }
 }
 public static uint LaunchExecutable(string executable,int port,string profile) {
  string args="--remote-debugging-address=127.0.0.1 --remote-debugging-port="+port+" --disable-renderer-backgrounding --disable-background-timer-throttling";
  if(profile!=null)args+=" --user-data-dir=\""+profile+"\"";
  var start=new System.Diagnostics.ProcessStartInfo(executable,args);start.UseShellExecute=false;
  using(var process=System.Diagnostics.Process.Start(start)){return (uint)process.Id;}
 }
}
'@
            }
            $response = @{ ok=$true; exe=$nativeExe; version=[string]$package.Version; running=$running; packageActivationReady=[StartupPackage]::Available(); desktopBounds=[StartupTcp]::DesktopBounds() }
        } elseif ($command -match '^(l|ls) ([0-9]+)$' -and $nativeExe) {
            $skinProfileLaunch = $Matches[1] -eq 'ls'
            $port = [int]$Matches[2]
            if ($port -lt 1024 -or $port -gt 65535) { throw 'Invalid local port' }
            $alreadyRunning = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object { [string]::Equals($_.ExecutablePath,$nativeExe,[StringComparison]::OrdinalIgnoreCase) })
            if ($alreadyRunning.Count) { throw 'Native application is already running; package activation was not attempted' }
            if($skinProfileLaunch){
                $profilePath = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\cdp-profile'
                if(!(Test-Path -LiteralPath $profilePath -PathType Container) -or $profilePath.Contains('"')){throw 'Existing Dream Skin profile unavailable'}
                $launchPid = [StartupPackage]::LaunchExecutable($nativeExe,$port,$profilePath)
            } else { $launchPid = [StartupPackage]::LaunchExecutable($nativeExe,$port,$null) }
            if ($launchPid -eq 0) { throw 'Package activation did not return a process ID' }
            $startedAt=$null
            try { $startedAt=[Diagnostics.Process]::GetProcessById($launchPid).StartTime.ToUniversalTime().ToString('o') } catch {}
            $response = @{ ok=$true; pid=$launchPid; activation='verified-executable'; startedAt=$startedAt }
        } elseif ($command -match '^v ([0-9]+)(?: ([0-9]+))?$' -and $nativeExe) {
            $port = [int]$Matches[1]
            $expectedPid = if ($Matches[2]) { [int]$Matches[2] } else { 0 }
            if ($port -lt 1024 -or $port -gt 65535) { throw 'Invalid local port' }
            foreach ($listenerPid in [StartupTcp]::Owners($port)) {
                if ($expectedPid -and $listenerPid -ne $expectedPid) { throw 'Debug listener process changed' }
                $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerPid"
                if (![string]::Equals($owner.ExecutablePath,$nativeExe,[StringComparison]::OrdinalIgnoreCase)) { throw 'Debug listener belongs to a different application' }
                $sid = Invoke-CimMethod -InputObject $owner -MethodName GetOwnerSid
                if ($sid.ReturnValue -ne 0 -or $sid.Sid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Debug listener belongs to another account' }
            }
            $response = @{ ok=$true; verified=$true }
        } elseif ($command -match '^r ([0-9]+) ([0-9]+)$' -and $nativeExe) {
            $restorePid = [int]$Matches[1]
            $restoreHandle = [IntPtr][long]$Matches[2]
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$restorePid"
            if (![string]::Equals($owner.ExecutablePath,$nativeExe,[StringComparison]::OrdinalIgnoreCase)) { throw 'Restore target is not the verified native application' }
            if (!('StartupRestore' -as [type])) {
                Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class StartupRestore {
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int cx,int cy,uint flags);
}
'@
            }
            [uint32]$windowOwner = 0
            [void][StartupRestore]::GetWindowThreadProcessId($restoreHandle,[ref]$windowOwner)
            if ($windowOwner -ne $restorePid) { throw 'Restore window ownership changed' }
            [void][StartupRestore]::SetWindowPos($restoreHandle,[IntPtr]::Zero,0,0,0,0,0x57)
            $response = @{ ok=$true; restored=$true }
        } else { throw 'Unexpected platform request' }
    } catch { $response = @{ ok=$false; message=$_.Exception.Message } }
    [Console]::Out.WriteLine(($response | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
}

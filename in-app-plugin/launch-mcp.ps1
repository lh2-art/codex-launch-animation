$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System.IO;
using System.Threading.Tasks;
public static class AnimationMcpRelay {
 public static Task StartCopy(Stream input,Stream output){
  // Console pipe ReadAsync can block before returning on .NET Framework.
  // Start every direction on a worker so stdin cannot prevent stdout setup.
  return Task.Run(()=>Copy(input,output));
 }
 public static async Task Copy(Stream input,Stream output){
  var bytes=new byte[8192];int count;
  while((count=await input.ReadAsync(bytes,0,bytes.Length).ConfigureAwait(false))>0){
   await output.WriteAsync(bytes,0,count).ConfigureAwait(false);
   await output.FlushAsync().ConfigureAwait(false);
  }
 }
}
'@
$root=Join-Path $env:LOCALAPPDATA 'CodexLaunchAnimation'
$executable=Join-Path $root 'desktop-extension\electron.exe'
$server=Join-Path $root 'in-app-plugin\server.cjs'
if(!(Test-Path -LiteralPath $executable) -or !(Test-Path -LiteralPath $server)){throw 'Install the Codex Launch Animation Windows runtime before enabling this plugin.'}
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=$executable
$start.Arguments='"'+$server+'"'
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardInput=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1'
$process=[Diagnostics.Process]::Start($start)
try {
 # Relay raw bytes; PowerShell's native pipeline otherwise consumes MCP stdin
 # or recodes Chinese JSON on systems using a non-UTF-8 console code page.
 $inputTask=[AnimationMcpRelay]::StartCopy([Console]::OpenStandardInput(),$process.StandardInput.BaseStream)
 $outputTask=[AnimationMcpRelay]::StartCopy($process.StandardOutput.BaseStream,[Console]::OpenStandardOutput())
 $errorTask=[AnimationMcpRelay]::StartCopy($process.StandardError.BaseStream,[Console]::OpenStandardError())
 $inputClosed=$false
 while(!$process.WaitForExit(100)){
  if(!$inputClosed -and $inputTask.IsCompleted){$process.StandardInput.Close();$inputClosed=$true}
 }
 $outputTask.GetAwaiter().GetResult()
 $errorTask.GetAwaiter().GetResult()
 $exitCode=$process.ExitCode
} finally {$process.Dispose()}
exit $exitCode

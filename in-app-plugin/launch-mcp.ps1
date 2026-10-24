$ErrorActionPreference='Stop'
function Trace-Mcp([string]$Message){if($env:CODEX_ANIMATION_MCP_DEBUG -eq '1'){[Console]::Error.WriteLine('[animation-mcp] '+$Message)}}
# Process.StandardInput uses Console.InputEncoding on .NET Framework.
# UTF-8 with a BOM writes EF BB BF before MCP JSON, preventing initialization.
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
Trace-Mcp 'Compiling byte relay'
Add-Type -TypeDefinition @'
using System.IO;
using System.Threading.Tasks;
public static class AnimationMcpRelay {
 public static Task StartCopy(Stream input,Stream output){
  return Task.Run(()=>{
   var bytes=new byte[8192];int count;
   while((count=input.Read(bytes,0,bytes.Length))>0){
    output.Write(bytes,0,count);
    output.Flush();
    if(System.Environment.GetEnvironmentVariable("CODEX_ANIMATION_MCP_DEBUG")=="1")System.Console.Error.WriteLine("[animation-mcp] Forwarded "+count+" bytes");
   }
  });
 }
}
'@
$root=Join-Path $env:LOCALAPPDATA 'CodexLaunchAnimation'
$executable=Join-Path $root 'desktop-extension\node-runtime\node.exe'
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
$process=[Diagnostics.Process]::Start($start)
Trace-Mcp ('Server started: '+$process.Id)
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

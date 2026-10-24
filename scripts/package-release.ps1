$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$version=(Get-Content (Join-Path $root 'package.json') -Raw|ConvertFrom-Json).version
$release=Join-Path $root 'release'
$stage=Join-Path $release ('codex-launch-animation-'+$version+'-windows-x64')
if(Test-Path -LiteralPath $stage){throw 'Release staging directory already exists. Move it aside before rebuilding.'}
New-Item -ItemType Directory -Path $stage -Force|Out-Null
Copy-Item -LiteralPath (Join-Path $root 'desktop-extension') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $root 'in-app-plugin\dist') -Destination (Join-Path $stage 'in-app-plugin') -Recurse
foreach($name in @('Install.ps1','Uninstall.ps1','README.md','LICENSE','THIRD_PARTY_NOTICES.md','ASSETS.md','licenses')){Copy-Item -LiteralPath (Join-Path $root $name) -Destination $stage -Recurse}
$zip=$stage+'.zip'
Compress-Archive -LiteralPath $stage -DestinationPath $zip -CompressionLevel Optimal
$hash=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $release 'SHA256SUMS.txt'),$hash+'  '+[IO.Path]::GetFileName($zip)+"`n",[Text.UTF8Encoding]::new($false))
Write-Output $zip

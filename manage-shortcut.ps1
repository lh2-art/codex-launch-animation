param([ValidateSet('Install','Restore','Inspect')][string]$Action = 'Inspect')
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ChatGPT.lnk'
$executable = Join-Path $projectRoot 'desktop-extension\ChatGPT启动扩展.exe'
$backupDirectory = Join-Path $projectRoot 'integration-backup'
$backup = Join-Path $backupDirectory 'ChatGPT.original.lnk'
$shell = New-Object -ComObject WScript.Shell
if (!(Test-Path -LiteralPath $shortcutPath)) { throw 'The original ChatGPT desktop shortcut is missing.' }
$shortcut = $shell.CreateShortcut($shortcutPath)
if ($Action -eq 'Inspect') {
    [pscustomobject]@{ Path=$shortcutPath; Target=$shortcut.TargetPath; Arguments=$shortcut.Arguments; Icon=$shortcut.IconLocation }
    exit
}
if ($Action -eq 'Restore') {
    if (!(Test-Path -LiteralPath $backup)) { throw 'Original shortcut backup missing.' }
    if ($shortcut.TargetPath -ne $executable) { throw 'The shortcut was changed outside this extension. Restore stopped to preserve that change.' }
    Copy-Item -LiteralPath $backup -Destination $shortcutPath -Force
    Write-Output 'Restored the original ChatGPT shortcut.'
    exit
}
if (!(Test-Path -LiteralPath $executable)) { throw 'Build the desktop extension first.' }
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
if (!(Test-Path -LiteralPath $backup)) {
    if ($shortcut.TargetPath -like ($projectRoot + '*')) { throw 'Shortcut already points at a launcher; original backup required.' }
    Copy-Item -LiteralPath $shortcutPath -Destination $backup
}
# Edit this same shortcut; preserve its name and official icon. No new desktop entry.
$shortcut.TargetPath = $executable
$shortcut.Arguments = ''
$shortcut.WorkingDirectory = Split-Path -Parent $executable
$shortcut.Save()
Write-Output 'Connected the existing ChatGPT shortcut. Official icon and name preserved.'

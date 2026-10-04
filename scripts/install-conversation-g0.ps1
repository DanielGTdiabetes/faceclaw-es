param(
    [Parameter(Mandatory=$true)][string]$InputApk,
    [string]$SigningDirectory = '.tools/signing',
    [string]$AndroidSdk = $env:ANDROID_HOME,
    [string]$JavaDirectory = $env:JAVA_HOME,
    [string]$Serial = '',
    [ValidateSet('0.8.1-es.5-conversation.g0.1', '0.8.1-es.5-conversation.g0.2', '0.8.1-es.5-conversation.g2.1', '0.8.1-es.5-conversation.g2.2', '0.8.1-es.5-conversation.g2.3', '0.8.1-es.5-conversation.g3.0', '0.8.1-es.5-conversation.g3.1', '0.8.1-es.5-conversation.g3.2', '0.8.1-es.5-conversation.g3.3', '0.8.2-es.5-conversation.g3.3', '0.8.2-es.5-conversation.g3.4', '0.8.2-es.5-conversation.g3.4.1', '0.8.2-es.5-conversation.g3.4.2', '0.8.2-es.5-conversation.c1')]
    [string]$ExpectedVersion = '0.8.2-es.5-conversation.c1',
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskSigning = [IO.Path]::GetFullPath((Join-Path $taskRoot $SigningDirectory))
$taskKey = Join-Path $taskSigning 'faceclaw-es.jks'
$taskPassword = Join-Path $taskSigning 'store.password'
# Fail before making directories, running any signing helper or touching the device.
if (!(Test-Path -LiteralPath $taskKey) -or !(Test-Path -LiteralPath $taskPassword)) {
    throw 'Falta la firma original: se requieren faceclaw-es.jks y store.password juntos. No se genera ninguna clave.'
}
if (!(Test-Path -LiteralPath $InputApk)) { throw 'No existe la APK de entrada.' }
if (!$AndroidSdk) { $AndroidSdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if ($JavaDirectory) { $env:JAVA_HOME = $JavaDirectory }
$taskTools = Get-ChildItem -LiteralPath (Join-Path $AndroidSdk 'build-tools') -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'apksigner.bat') } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$taskTools) { throw 'Faltan Android SDK build-tools y apksigner.' }
$taskSigner = Join-Path $taskTools.FullName 'apksigner.bat'
$taskAlign = Join-Path $taskTools.FullName 'zipalign.exe'
$taskAapt = Join-Path $taskTools.FullName 'aapt.exe'
$taskExpected = '57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435'
function Assert-OriginalSignature([string]$Apk) {
    $taskCert = & $taskSigner verify --print-certs $Apk 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'La APK no tiene una firma válida.' }
    $taskDigest = $taskCert | Select-String 'certificate SHA-256 digest:' | Select-Object -First 1
    if (!$taskDigest -or (($taskDigest.Line -split 'digest:')[1].Trim() -ne $taskExpected)) {
        throw 'La firma no coincide con la original instalada. No instalar.'
    }
}
$taskBadging = & $taskAapt dump badging $InputApk 2>&1
$taskExpectedPackage = "^package: name='com.faceclaw.app' versionCode='805' versionName='" + [regex]::Escape($ExpectedVersion) + "'"
if ($LASTEXITCODE -ne 0 -or !($taskBadging | Select-String $taskExpectedPackage)) {
    throw "Identidad o versión inesperada: se requiere com.faceclaw.app / 805 / $ExpectedVersion."
}
$taskOutput = Join-Path $taskRoot "dist/conversation-g0/faceclaw-$ExpectedVersion.apk"
New-Item -ItemType Directory -Force (Split-Path -Parent $taskOutput) | Out-Null
$taskAligned = $taskOutput + '.aligned'
& $taskAlign -f -P 16 4 $InputApk $taskAligned
if ($LASTEXITCODE -ne 0) { throw 'Falló zipalign.' }
& $taskSigner sign --ks $taskKey --ks-key-alias faceclaw-es --ks-pass "file:$taskPassword" --out $taskOutput $taskAligned
if ($LASTEXITCODE -ne 0) { throw 'Falló la firma.' }
Assert-OriginalSignature $taskOutput
Remove-Item -LiteralPath $taskAligned
Write-Output "APK firmada con la identidad original: $taskOutput"
if (!$Install) { Write-Output 'No instalada. Usar -Install para actualizar conservando datos.'; return }
$taskAdb = Join-Path $AndroidSdk 'platform-tools/adb.exe'
$taskDevices = @(& $taskAdb devices | Select-String '^\S+\s+device$' | ForEach-Object { ($_.Line -split '\s+')[0] })
if (!$Serial) {
    if ($taskDevices.Count -ne 1) { throw 'Se requiere exactamente un dispositivo autorizado o -Serial explícito.' }
    $Serial = $taskDevices[0]
}
if ($Serial -notin $taskDevices) { throw 'El dispositivo seleccionado no está autorizado/conectado.' }
$taskPaths = @(& $taskAdb -s $Serial shell pm path com.faceclaw.app)
if ($LASTEXITCODE -ne 0 -or $taskPaths.Count -ne 1 -or !$taskPaths[0].StartsWith('package:')) {
    throw 'No se puede respaldar la APK actual (paquete ausente o dividido). No instalar.'
}
$taskBackup = Join-Path $taskRoot ('dist/conversation-g0/before-install-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.apk')
& $taskAdb -s $Serial pull $taskPaths[0].Trim().Substring(8) $taskBackup
if ($LASTEXITCODE -ne 0) { throw 'Falló el respaldo; no instalar.' }
Assert-OriginalSignature $taskBackup
Get-FileHash -LiteralPath $taskBackup -Algorithm SHA256
& $taskAdb -s $Serial install -r $taskOutput
if ($LASTEXITCODE -ne 0) { throw 'La actualización falló. No desinstalar ni regenerar la firma.' }
Write-Output "Instalada conservando datos. Reversión: adb -s $Serial install -r $taskBackup"

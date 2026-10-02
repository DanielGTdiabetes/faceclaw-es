param(
    [Parameter(Mandatory=$true)][string]$InputApk,
    [string]$OutputApk = 'dist/faceclaw-0.8.1-es.3.apk',
    [string]$SigningDirectory = '.tools/signing'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
. "$PSScriptRoot/build-environment.ps1"
$signingRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot $SigningDirectory))
New-Item -ItemType Directory -Force $signingRoot | Out-Null
$keystore = Join-Path $signingRoot 'faceclaw-es.jks'
$passwordFile = Join-Path $signingRoot 'store.password'
if (Test-Path -LiteralPath $keystore) {
    if (-not (Test-Path -LiteralPath $passwordFile)) { throw 'Falta la contraseña de la firma existente. No crear otra clave.' }
} else {
    if (Test-Path -LiteralPath $passwordFile) { throw 'Existe la contraseña pero falta la clave. Restaurar el keystore antes de continuar.' }
    $bytes = [byte[]]::new(32)
    [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    [IO.File]::WriteAllText($passwordFile, [Convert]::ToBase64String($bytes))
    & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore $keystore -storetype JKS -storepass:file $passwordFile -keypass:file $passwordFile -alias faceclaw-es -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Faceclaw Espanol'
    if ($LASTEXITCODE -ne 0) { throw 'No se ha podido crear la clave de firma.' }
}
$buildTools = Join-Path $env:ANDROID_HOME 'build-tools/35.0.0'
$output = [IO.Path]::GetFullPath((Join-Path $projectRoot $OutputApk))
New-Item -ItemType Directory -Force (Split-Path -Parent $output) | Out-Null
$aligned = $output + '.aligned'
& "$buildTools/zipalign.exe" -f -P 16 4 $InputApk $aligned
if ($LASTEXITCODE -ne 0) { throw 'Falló zipalign.' }
& "$buildTools/apksigner.bat" sign --ks $keystore --ks-key-alias faceclaw-es --ks-pass "file:$passwordFile" --out $output $aligned
if ($LASTEXITCODE -ne 0) { throw 'Falló la firma de la APK.' }
& "$buildTools/apksigner.bat" verify --verbose --print-certs $output
if ($LASTEXITCODE -ne 0) { throw 'La firma de la APK no es válida.' }
Remove-Item -LiteralPath $aligned
Write-Output "APK firmada: $output"

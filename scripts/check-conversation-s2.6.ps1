param(
  [string]$Candidate='dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.6.2-manual-context.apk',
  [ValidateSet('0.8.2-es.5-conversation.s2.6-manual-context','0.8.2-es.5-conversation.s2.6.1-manual-context','0.8.2-es.5-conversation.s2.6.2-manual-context')]
  [string]$ExpectedVersion='0.8.2-es.5-conversation.s2.6.2-manual-context'
)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME=Join-Path $taskRoot '.tools/jdk-21.0.12.1+1'
$taskTools=Join-Path $taskRoot '.tools/android-sdk/build-tools/35.0.0'
$taskCandidate=Join-Path $taskRoot $Candidate
$taskBadging=@(& "$taskTools/aapt.exe" dump badging $taskCandidate 2>&1)
$taskVersionPattern=[regex]::Escape($ExpectedVersion)
if($LASTEXITCODE -ne 0 -or !($taskBadging -match "^package: name='com.faceclaw.app' versionCode='805' versionName='$taskVersionPattern'")){throw 'Identidad inesperada en la candidata.'}
$taskCert=@(& "$taskTools/apksigner.bat" verify --verbose --print-certs $taskCandidate 2>&1)
if($LASTEXITCODE -ne 0 -or !($taskCert -match 'certificate SHA-256 digest: 57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435')){throw 'Firma inesperada o inválida.'}
& "$taskTools/zipalign.exe" -c -P 16 4 $taskCandidate
if($LASTEXITCODE -ne 0){throw 'Alineación inválida.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Entry-Hash($Zip,[string]$Name){
  $taskEntry=$Zip.GetEntry($Name)
  if(!$taskEntry){throw "Falta componente APK: $Name"}
  $taskStream=$taskEntry.Open(); $taskHash=[Security.Cryptography.SHA256]::Create()
  try { return [Convert]::ToHexString($taskHash.ComputeHash($taskStream)) } finally {$taskStream.Dispose(); $taskHash.Dispose()}
}
$taskOld=[IO.Compression.ZipFile]::OpenRead((Join-Path $taskRoot 'dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.5-manual.apk'))
$taskNew=[IO.Compression.ZipFile]::OpenRead($taskCandidate)
try {
  $taskLibs=@($taskOld.Entries | Where-Object {$_.FullName -match '^lib/.*\.so$'} | ForEach-Object {$_.FullName})
  $taskNewLibs=@($taskNew.Entries | Where-Object {$_.FullName -match '^lib/.*\.so$'} | ForEach-Object {$_.FullName})
  if($taskLibs.Count -ne 7 -or @(Compare-Object $taskLibs $taskNewLibs).Count){throw 'Conjunto de bibliotecas nativas inesperado.'}
  foreach($taskName in $taskLibs){if((Entry-Hash $taskOld $taskName) -ne (Entry-Hash $taskNew $taskName)){throw "Biblioteca nativa modificada: $taskName"}}
  Write-Output 'BIBLIOTECAS_NATIVAS_IDENTICAS=7/7'
  $taskReader=[IO.StreamReader]::new($taskNew.GetEntry('assets/app/bundle.mjs').Open())
  try{$taskBundle=$taskReader.ReadToEnd()}finally{$taskReader.Dispose()}
  foreach($taskMarker in @('Hermes en conversaci','conv/1','conv/2','identidad-opcional','reconocer tu voz es opcional','blankForIndependentListening','releaseHermesUi')){
    if(!$taskBundle.Contains($taskMarker)){throw "No se acredita nueva integración en el bundle: $taskMarker"}
  }
  Write-Output 'BUNDLE_HERMES_INTEGRADO=TRUE'
  $taskPackageSame=(Entry-Hash $taskOld 'assets/app/package.json') -eq (Entry-Hash $taskNew 'assets/app/package.json')
  Write-Output "RUNTIME_PACKAGE_IDENTICO=$taskPackageSame"
} finally {$taskOld.Dispose(); $taskNew.Dispose()}
$taskBadging | Select-String '^package:' | ForEach-Object {$_.Line}
Get-FileHash $taskCandidate -Algorithm SHA256

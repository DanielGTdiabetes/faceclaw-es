$ErrorActionPreference = 'Stop'
# Load only the backup function: no signing credentials, ADB or device access.
$taskSource = Join-Path $PSScriptRoot 'install-conversation-g0.ps1'
$taskTokens = $null
$taskErrors = $null
$taskAst = [System.Management.Automation.Language.Parser]::ParseFile($taskSource, [ref]$taskTokens, [ref]$taskErrors)
if ($taskErrors.Count) { throw 'Installer syntax error.' }
$taskFunction = $taskAst.Find({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Copy-InstalledApk'
}, $true)
if (!$taskFunction) { throw 'Backup function missing.' }
. ([scriptblock]::Create($taskFunction.Extent.Text))
$taskDirectory = Join-Path ([IO.Path]::GetTempPath()) ('faceclaw-backup-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskDirectory | Out-Null
try {
    $taskFakeAdb = Join-Path $taskDirectory 'fake-adb.cmd'
    $taskBackup = Join-Path $taskDirectory 'backup.apk'
    $taskCases = @(
        @{ Exit = 0; Write = $true; Pass = $true },
        @{ Exit = 7; Write = $true; Pass = $false },
        @{ Exit = 0; Write = $false; Pass = $false }
    )
    foreach ($taskCase in $taskCases) {
        if (Test-Path -LiteralPath $taskBackup) { Remove-Item -LiteralPath $taskBackup }
        $taskWrite = if ($taskCase.Write) { 'echo backup>"%~5"' } else { 'type nul>"%~5"' }
        [IO.File]::WriteAllText($taskFakeAdb, "@echo off`r`necho adb progress 1>&2`r`n$taskWrite`r`nexit /b $($taskCase.Exit)`r`n")
        $taskPassed = $true
        try { Copy-InstalledApk $taskFakeAdb 'mock-device' '/mock/base.apk' $taskBackup }
        catch { $taskPassed = $false }
        if ($taskPassed -ne $taskCase.Pass) { throw "Wrong result for exit=$($taskCase.Exit), write=$($taskCase.Write)" }
        if ($ErrorActionPreference -ne 'Stop') { throw 'ErrorActionPreference was not restored.' }
    }
    Write-Output '3/3 backup cases passed: stderr success, nonzero failure, empty backup.'
} finally {
    # Remove only these known files; never perform a recursive cleanup.
    foreach ($taskFile in @($taskFakeAdb, $taskBackup)) {
        if (Test-Path -LiteralPath $taskFile) { Remove-Item -LiteralPath $taskFile }
    }
    Remove-Item -LiteralPath $taskDirectory
}

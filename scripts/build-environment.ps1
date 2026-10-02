$projectRoot = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = Join-Path $projectRoot '.tools/jdk-21.0.12.1+1'
$env:ANDROID_HOME = Join-Path $projectRoot '.tools/android-sdk'
$env:ANDROID_USER_HOME = Join-Path $projectRoot '.tools/android-home'
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.gradle-local'
$env:USERPROFILE = Join-Path $projectRoot '.tools/android-home'
$env:HOME = $env:USERPROFILE
$env:APPDATA = Join-Path $projectRoot '.tools/appdata'
$env:LOCALAPPDATA = Join-Path $projectRoot '.tools/localappdata'
$env:HOMEDRIVE = [IO.Path]::GetPathRoot($env:HOME).TrimEnd('\')
$env:HOMEPATH = $env:HOME.Substring($env:HOMEDRIVE.Length)
$env:JAVA_TOOL_OPTIONS = '-Duser.home=' + $env:USERPROFILE
$env:npm_config_cache = Join-Path $projectRoot '.npm-cache'
$env:PATH = "$env:JAVA_HOME\bin;$(Join-Path $projectRoot '.tools/bin');$env:ANDROID_HOME\platform-tools;$env:PATH"
$env:NS_SKIP_ENV_CHECK = '1'

Set-Location $PSScriptRoot

# Dev workflow: Express (API + SSR) on :4000, Angular HMR dev server on :4400
# The Angular dev server proxies /api and /media to localhost:4000 via proxy.conf.json.
#
# Usage: .\start-dev.ps1

$env:NODE_OPTIONS = '--openssl-legacy-provider'

$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
            $name = $Matches[1].Trim()
            if (-not [Environment]::GetEnvironmentVariable($name)) {
                [Environment]::SetEnvironmentVariable($name, $Matches[2])
                Set-Item "Env:$name" $Matches[2]
            }
        }
    }
}

# Start the Express server (API + SSR) as a supervised child process.
$env:PORT = '4000'
$env:NODE_ENV = 'development'
$serverEntry = Join-Path $PSScriptRoot 'dist\frame-screen-saver\server\main.js'

if (-not (Test-Path $serverEntry)) {
    Write-Host 'SSR server bundle is missing; compiling the API directly with TypeScript...'
    Remove-Item (Join-Path $PSScriptRoot 'out-tsc\server') -Recurse -Force -ErrorAction SilentlyContinue
    & (Join-Path $PSScriptRoot 'node_modules\.bin\tsc.cmd') -p (Join-Path $PSScriptRoot 'tsconfig.server.json') `
        --outDir (Join-Path $PSScriptRoot 'out-tsc\server') --noEmitOnError false
    $serverEntry = Join-Path $PSScriptRoot 'out-tsc\server\server.js'
    $env:SCREENSAVER_CONFIG_FILE = Join-Path $PSScriptRoot 'dist\frame-screen-saver\browser\screensaver.config.json'
    $env:DISABLE_SSR = 'true'
    $env:MEDIA_DIR = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\media'))
    $fallbackBrowserDir = Join-Path $PSScriptRoot 'out-tsc\browser'
    Remove-Item $fallbackBrowserDir -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $PSScriptRoot 'dist\frame-screen-saver\browser') $fallbackBrowserDir -Recurse
}

if (-not (Test-Path $serverEntry)) {
    throw 'Unable to produce a server entry point.'
}

if (-not $env:ALLOW_INSECURE_TLS) {
    $env:ALLOW_INSECURE_TLS = 'true'
}

$apiProcess = Start-Process -FilePath 'node' -ArgumentList $serverEntry `
    -WorkingDirectory $PSScriptRoot -NoNewWindow -PassThru

Write-Host 'Express API server starting on http://localhost:4000 (process id: ' $apiProcess.Id ')'
Write-Host 'Waiting 2s for Express to be ready...'
Start-Sleep -Seconds 2

if ($apiProcess.HasExited) {
    throw "Express API server exited during startup with code $($apiProcess.ExitCode)."
}

# Start the Angular dev server on port 4400 (proxies /api -> :4000)
try {
    node node_modules/@angular/cli/bin/ng serve --host 0.0.0.0 --port 4400 --proxy-config proxy.conf.json
} finally {
    Write-Host 'Stopping Express API server...'
    if (-not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id
    }
}

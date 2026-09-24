Set-Location $PSScriptRoot

# Dev workflow: Express (API + SSR) on :4000, Angular HMR dev server on :4400
# The Angular dev server proxies /api and /media to localhost:4000 via proxy.conf.json.
#
# Usage: .\start-dev.ps1
# Requirements: run `npm run build` at least once so dist/frame-screen-saver/server/main.js exists.

$env:NODE_OPTIONS = '--openssl-legacy-provider'

# Start the Express server (API + SSR) as a supervised child process.
$env:PORT = '4000'
$env:NODE_ENV = 'development'
$apiProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/frame-screen-saver/server/main.js' `
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

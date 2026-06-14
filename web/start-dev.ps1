Set-Location $PSScriptRoot

# Dev workflow: Express (API + SSR) on :4000, Angular HMR dev server on :4200
# The Angular dev server proxies /api and /media to localhost:4000 via proxy.conf.json.
#
# Usage: .\start-dev.ps1
# Requirements: run `npm run build` at least once so dist/frame-screen-saver/server/main.js exists.

$env:NODE_OPTIONS = '--openssl-legacy-provider'

# Start the Express server (API + SSR) in the background on port 4000
$apiJob = Start-Job -ScriptBlock {
    Set-Location $using:PSScriptRoot
    $env:PORT = '4000'
    $env:NODE_ENV = 'development'
    node dist/frame-screen-saver/server/main.js
}

Write-Host 'Express API server starting on http://localhost:4000 (job id: ' $apiJob.Id ')'
Write-Host 'Waiting 2s for Express to be ready...'
Start-Sleep -Seconds 2

# Start the Angular dev server on port 4200 (proxies /api -> :4000)
try {
    node node_modules/@angular/cli/bin/ng serve --host 0.0.0.0 --port 4200 --proxy-config proxy.conf.json
} finally {
    Write-Host 'Stopping Express API server...'
    Stop-Job $apiJob
    Remove-Job $apiJob
}

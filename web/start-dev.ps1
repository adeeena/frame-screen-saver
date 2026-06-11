Set-Location $PSScriptRoot
$env:NODE_OPTIONS = '--openssl-legacy-provider'
node node_modules/@angular/cli/bin/ng serve --host 0.0.0.0

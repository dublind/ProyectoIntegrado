$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'node_modules')) { npm install; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
if (-not (Test-Path -LiteralPath 'frontend/node_modules')) { npm --prefix frontend ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
npm run dev

# Deploy Rep (worker + D1 + static assets) to rep.anirudhgoel.xyz
# Requires: wrangler auth (CLOUDFLARE_API_TOKEN or `npx wrangler login`)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Host 'No CLOUDFLARE_API_TOKEN - trying wrangler OAuth (browser may open)...' -ForegroundColor Yellow
  npx wrangler login
}

Write-Host 'Deploying (wrangler.toml: worker + assets)...' -ForegroundColor Cyan
npm run deploy

Start-Sleep -Seconds 4
$health = curl.exe -s 'https://rep.anirudhgoel.xyz/api/health'
if ($health -match '"ok"\s*:\s*true') {
  Write-Host "Smoke OK: $health" -ForegroundColor Green
} else {
  Write-Host "Smoke WARN: /api/health returned: $health" -ForegroundColor Yellow
}

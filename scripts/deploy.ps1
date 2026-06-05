# Deploy Rep static assets (90-artist data + v5 UI) to rep.anirudhgoel.xyz
# Requires: wrangler auth (CLOUDFLARE_API_TOKEN or `npx wrangler login`)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Host 'No CLOUDFLARE_API_TOKEN — trying wrangler OAuth (browser may open)...' -ForegroundColor Yellow
  npx wrangler login
}

Write-Host 'Deploying static assets (wrangler.toml)...' -ForegroundColor Cyan
npm run deploy

Start-Sleep -Seconds 4
$json = curl.exe -s 'https://rep.anirudhgoel.xyz/data/artists.json'
if ($json -match '"total_artists"\s*:\s*90') {
  Write-Host 'Smoke OK: production artists.json reports 90' -ForegroundColor Green
} else {
  Write-Host 'Smoke WARN: total_artists not 90 yet — hard-refresh or wait for CDN' -ForegroundColor Yellow
  Write-Host ($json.Substring(0, [Math]::Min(200, $json.Length)))
}

Write-Host 'Done. API/D1 (votes) still optional — set database_id in wrangler.toml then npm run deploy:api && npm run db:remote' -ForegroundColor DarkGray

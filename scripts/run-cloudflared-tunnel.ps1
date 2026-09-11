# Cua so rieng: giu cloudflared song. Tat cua so nay = link trycloudflare chet.
# ASCII banner + UTF-8 console. File phai UTF-8 BOM (Windows PowerShell 5.1).
# Child powershell.exe window: ASCII Vietnamese (no diacritics) so raster fonts never mojibake.
param(
    [Parameter(Mandatory = $true)][string]$CloudflaredPath,
    [Parameter(Mandatory = $true)][string]$LogPath
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
try { chcp 65001 | Out-Null } catch {}

. (Join-Path $PSScriptRoot 'fly-term.ps1')

Write-FlyBanner 'CLOUDFLARE TUNNEL' @(
    'Giu cua so nay mo.',
    'Dong cua so = link chet, phai chay lai npm run start:zalopay.'
)
Write-FlyOk $CloudflaredPath
Write-FlyInfo 'cloudflared tunnel --url http://localhost:3000'
Write-Host ''

$parent = Split-Path -Parent $LogPath
if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

& $CloudflaredPath tunnel --url http://localhost:3000 --logfile $LogPath
$code = $LASTEXITCODE

Write-Host ''
Write-FlyWarn 'Duong ham da tat. Link cu khong dung duoc nua.'
Write-FlyInfo 'Chay lai npm run start:zalopay (link moi + ghi .env + start).'
if ($null -eq $code) { $code = 1 }
exit $code

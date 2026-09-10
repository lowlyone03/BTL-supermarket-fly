# Cua so rieng: giu cloudflared song. Tat cua so nay = link trycloudflare chet.
param(
    [Parameter(Mandatory = $true)][string]$CloudflaredPath,
    [Parameter(Mandatory = $true)][string]$LogPath
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ''
Write-Host '=============================================='
Write-Host 'CLOUDFLARE TUNNEL - GIU CUA SO NAY MO'
Write-Host 'Tat cua so nay = link chet, phai chay lai file 7'
Write-Host '=============================================='
Write-Host ''
Write-Host ("Dung file: " + $CloudflaredPath)
Write-Host 'Lenh: cloudflared tunnel --url http://localhost:3000 --logfile ...'
Write-Host ''

$parent = Split-Path -Parent $LogPath
if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

& $CloudflaredPath tunnel --url http://localhost:3000 --logfile $LogPath
$code = $LASTEXITCODE

Write-Host ''
Write-Host 'Duong ham da tat. Link cu khong dung duoc nua.'
Write-Host 'Chay lai 7_CHAY_APP_VA_TUNNEL_MOMO.bat (link moi + ghi .env + start).'
if ($null -eq $code) { $code = 1 }
exit $code

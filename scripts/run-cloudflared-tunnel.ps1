# Cua so rieng: giu cloudflared song. Tat cua so nay = link trycloudflare chet.
# ASCII banner + UTF-8 console. File phai UTF-8 BOM (Windows PowerShell 5.1).
# Child powershell.exe window: ASCII Vietnamese (no diacritics) so raster fonts never mojibake.
param(
    [Parameter(Mandatory = $true)][string]$CloudflaredPath,
    [Parameter(Mandatory = $true)][string]$LogPath,
    [int]$MaxAttempts = 4
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
try { chcp 65001 | Out-Null } catch {}

. (Join-Path $PSScriptRoot 'fly-term.ps1')

$UrlPattern = 'https://[A-Za-z0-9-]+\.trycloudflare\.com'
$BackoffSeconds = @(5, 10, 20)
if ($MaxAttempts -lt 1) { $MaxAttempts = 1 }

function Get-TunnelOriginFromText {
    param([string]$Text)
    if (-not $Text) { return $null }
    $match = [regex]::Match($Text, $UrlPattern)
    if (-not $match.Success) { return $null }
    return $match.Value.TrimEnd('/')
}

function Test-QuickTunnelTimeoutText {
    param([string]$Text)
    if (-not $Text) { return $false }
    if ($Text -match 'context deadline exceeded') { return $true }
    if ($Text -match 'failed to request quick Tunnel') { return $true }
    if ($Text -match 'Client\.Timeout exceeded') { return $true }
    if ($Text -match 'i/o timeout') { return $true }
    if ($Text -match 'failed to parse quick Tunnel ID') { return $true }
    if ($Text -match 'invalid UUID') { return $true }
    if ($Text -match 'connection reset') { return $true }
    if ($Text -match 'tls handshake timeout') { return $true }
    return $false
}

function Read-SharedText {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    try {
        return [System.IO.File]::ReadAllText($Path)
    } catch {
        return ''
    }
}

function Write-TunnelState {
    param(
        [string]$Status,
        [int]$Attempt,
        [string]$Detail,
        [string]$Url
    )
    $statePath = $LogPath + '.state'
    $parent = Split-Path -Parent $statePath
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $lines = @(
        ('status=' + $Status),
        ('attempt=' + $Attempt),
        ('detail=' + $Detail),
        ('url=' + $Url),
        ('updated=' + (Get-Date -Format 'o'))
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines($statePath, $lines, $utf8NoBom)
}

function Show-FinalTimeoutHelp {
    Write-Host ''
    Write-FlyErr 'Quick tunnel trycloudflare.com that bai (timeout hoac Cloudflare tra ve rong).'
    Write-FlyInfo 'Day la loi mang / Cloudflare, KHONG phai loi app SuperMarket Fly hay ZaloPay.'
    Write-FlyInfo 'Khong can tat-mo cua so ban hang (Electron).'
    Write-Host ''
    Write-FlyInfo 'Lam gi:'
    Write-FlyInfo '  1. Doi 1-2 phut, chay lai: npm run start:zalopay'
    Write-FlyInfo '  2. Tat VPN; thu mang khac (4G) neu mang truong chan Cloudflare.'
    Write-FlyInfo '  3. Van fail: named Cloudflare Tunnel (tai khoan + domain) hoac ngrok.'
    Write-FlyInfo '     Tailscale khong thay duoc cho ZaloPay IPN (khong phai HTTPS public).'
    Write-FlyInfo '  Xem docs/HUONG_DAN_CLOUDFLARE_TUNNEL.md phan E + F.'
}

Write-FlyBanner 'CLOUDFLARE TUNNEL' @(
    'Giu cua so nay mo.',
    'Dong cua so = link chet, phai chay lai npm run start:zalopay.',
    ('Quick tunnel: thu toi da {0} lan neu timeout.' -f $MaxAttempts)
)
Write-FlyOk $CloudflaredPath
Write-FlyInfo 'cloudflared tunnel --url http://localhost:3000'
Write-Host ''

$parent = Split-Path -Parent $LogPath
if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

$code = 1
$gotUrlThenDied = $false

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Write-TunnelState -Status 'starting' -Attempt $attempt -Detail '' -Url ''
    Write-FlyInfo ('Thu ket noi trycloudflare.com (lan {0}/{1})' -f $attempt, $MaxAttempts)

    try {
        & $CloudflaredPath tunnel --url http://localhost:3000 --logfile $LogPath
        $code = $LASTEXITCODE
    } catch {
        Write-TunnelState -Status 'failed' -Attempt $attempt -Detail 'never-started' -Url ''
        Write-Host ''
        Write-FlyErr 'Khong chay duoc cloudflared.exe (SmartScreen / Windows chan file?).'
        Write-FlyInfo 'More info -> Run anyway. Xem docs/HUONG_DAN_CLOUDFLARE_TUNNEL.md phan A1.'
        Write-FlyInfo 'Khong phai loi app. Khong ghi .env tu cua so nay.'
        if ($null -eq $code) { $code = 1 }
        exit $code
    }

    if ($null -eq $code) { $code = 1 }
    $logText = Read-SharedText $LogPath
    $origin = Get-TunnelOriginFromText $logText
    if ($origin) {
        $gotUrlThenDied = $true
        Write-TunnelState -Status 'dead' -Attempt $attempt -Detail 'url-then-exit' -Url $origin
        Write-Host ''
        Write-FlyWarn 'Tunnel da co URL nhung process da tat. Link cu khong dung duoc nua.'
        break
    }

    $isTimeout = Test-QuickTunnelTimeoutText $logText
    if ($isTimeout -and $attempt -lt $MaxAttempts) {
        $waitFor = $BackoffSeconds[[Math]::Min($attempt, $BackoffSeconds.Count) - 1]
        Write-TunnelState -Status 'retrying' -Attempt $attempt -Detail 'timeout' -Url ''
        Write-FlyWarn ('Quick tunnel Cloudflare loi. Thu lai sau {0}s...' -f $waitFor)
        Start-Sleep -Seconds $waitFor
        continue
    }

    if ($isTimeout) {
        Write-TunnelState -Status 'failed' -Attempt $attempt -Detail 'timeout' -Url ''
        Show-FinalTimeoutHelp
    } else {
        Write-TunnelState -Status 'failed' -Attempt $attempt -Detail 'exited' -Url ''
        Write-Host ''
        Write-FlyWarn 'Duong ham da tat truoc khi co URL.'
        Write-FlyInfo 'Xem log phia tren (SmartScreen / mang / DNS). Khong phai loi app.'
        Write-FlyInfo 'Khong can tat-mo cua so ban hang. Chay lai npm run start:zalopay.'
    }
    break
}

if ($gotUrlThenDied) {
    Write-FlyInfo 'Chay lai npm run start:zalopay (link moi + ghi .env + start).'
} elseif ($code -eq 0) {
    Write-Host ''
    Write-FlyWarn 'Duong ham da tat. Link cu khong dung duoc nua.'
    Write-FlyInfo 'Chay lai npm run start:zalopay (link moi + ghi .env + start).'
}

if ($null -eq $code) { $code = 1 }
exit $code

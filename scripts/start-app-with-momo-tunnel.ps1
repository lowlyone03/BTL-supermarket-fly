# Tunnel truoc -> ghi PAYMENT_* vao server/.env -> moi npm start.
# Node chi nap .env luc process start (loadEnv), khong doc lai moi request.
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'package.json'))) {
    Write-Host '[LOI] Khong thay package.json. Chay tu thu muc supermarket-fly.'
    exit 1
}
Set-Location -LiteralPath $RepoRoot

$DownloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
$UrlPattern = 'https://[A-Za-z0-9-]+\.trycloudflare\.com'
$WaitSeconds = 90

function Find-Cloudflared {
    $homeDir = $env:USERPROFILE
    $candidates = @(
        (Join-Path $RepoRoot 'cloudflared.exe'),
        (Join-Path $RepoRoot 'cloudflared-windows-amd64.exe')
    )
    if ($homeDir) {
        $candidates += @(
            (Join-Path $homeDir 'Desktop\cloudflared.exe'),
            (Join-Path $homeDir 'Downloads\cloudflared.exe'),
            (Join-Path $homeDir 'Downloads\cloudflared-windows-amd64.exe')
        )
    }
    foreach ($path in $candidates) {
        if ($path -and (Test-Path -LiteralPath $path)) {
            return (Resolve-Path -LiteralPath $path).Path
        }
    }
    return $null
}

function Show-CloudflaredHelp {
    Write-Host '[LOI] Khong thay cloudflared.exe'
    Write-Host ''
    Write-Host 'Tai file nay bang trinh duyet:'
    Write-Host $DownloadUrl
    Write-Host ''
    Write-Host 'Doi ten thanh cloudflared.exe'
    Write-Host ('Dat vao: ' + $RepoRoot)
    Write-Host 'Xem docs/HUONG_DAN_CLOUDFLARE_TUNNEL.md phan A1.'
    Write-Host ''
    Write-Host 'May thanh vien / khong test MoMo: dung npm start hoac 2_CHAY_SUPERMARKET_FLY.bat'
}

function Test-LocalPortOpen {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(400, $false)
        if (-not $ok) { return $false }
        $client.EndConnect($async) | Out-Null
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Update-DotEnvKey {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Value
    )
    $lines = @()
    if (Test-Path -LiteralPath $Path) {
        $lines = [System.IO.File]::ReadAllLines($Path)
    }
    $pattern = '^\s*' + [regex]::Escape($Key) + '\s*='
    $replaced = $false
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($line in $lines) {
        if (-not $replaced -and $line -match $pattern) {
            $out.Add("$Key=$Value")
            $replaced = $true
        } else {
            $out.Add($line)
        }
    }
    if (-not $replaced) {
        if ($out.Count -gt 0 -and $out[$out.Count - 1] -ne '') {
            $out.Add('')
        }
        $out.Add("$Key=$Value")
    }
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines($Path, $out.ToArray(), $utf8NoBom)
}

function Get-TunnelOriginFromText {
    param([string]$Text)
    if (-not $Text) { return $null }
    $match = [regex]::Match($Text, $UrlPattern)
    if (-not $match.Success) { return $null }
    return $match.Value.TrimEnd('/')
}

function Read-SharedText {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    $stream = $null
    $reader = $null
    try {
        $stream = [System.IO.File]::Open(
            $Path,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite
        )
        $reader = New-Object System.IO.StreamReader($stream)
        return $reader.ReadToEnd()
    } catch {
        return ''
    } finally {
        if ($reader) { $reader.Dispose() }
        elseif ($stream) { $stream.Dispose() }
    }
}

Write-Host '=============================================='
Write-Host 'SUPERMARKET FLY - APP + TUNNEL MOMO'
Write-Host '1) Mo tunnel   2) Ghi server/.env   3) npm start'
Write-Host 'Giu CUA SO TUNNEL mo trong luc test.'
Write-Host '=============================================='
Write-Host ''

$cf = Find-Cloudflared
if (-not $cf) {
    Show-CloudflaredHelp
    exit 1
}

Write-Host ('Dung file: ' + $cf)
Write-Host ''

$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $env:TEMP ("supermarket-fly-cloudflare-tunnel-" + $runId + ".log")
$urlStamp = Join-Path $env:TEMP ("supermarket-fly-cloudflare-tunnel-" + $runId + ".url")
$runner = Join-Path $PSScriptRoot 'run-cloudflared-tunnel.ps1'
if (-not (Test-Path -LiteralPath $runner)) {
    Write-Host ('[LOI] Thieu file: ' + $runner)
    exit 1
}

$existingTunnel = Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($existingTunnel) {
    Write-Host '[CANH BAO] Da co cloudflared dang chay. Dong cua so tunnel cu neu khong dung.'
    Write-Host ''
}

$arg = "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$runner`" -CloudflaredPath `"$cf`" -LogPath `"$logFile`""
Start-Process -FilePath 'powershell.exe' -ArgumentList $arg -WorkingDirectory $RepoRoot | Out-Null

Write-Host 'Da mo cua so tunnel. Dang doi https://....trycloudflare.com'
Write-Host '(thuong 5-15 giay, toi da 90 giay)'
Write-Host ''

$origin = $null
$startedAt = Get-Date
$deadline = $startedAt.AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
    $origin = Get-TunnelOriginFromText (Read-SharedText $logFile)
    if ($origin) { break }
    $alive = Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue
    $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
    if (-not $alive -and $elapsed -gt 8) {
        Write-Host ''
        Write-Host '[LOI] cloudflared da tat truoc khi in URL.'
        Write-Host 'Xem cua so tunnel (SmartScreen / mang bi chan).'
        Write-Host 'Tai lai: docs/HUONG_DAN_CLOUDFLARE_TUNNEL.md phan A + E.'
        exit 1
    }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 1
}
Write-Host ''

if (-not $origin) {
    Write-Host '[LOI] Het gio, chua thay https://....trycloudflare.com'
    Write-Host 'De cua so tunnel mo, doi them, hoac tat VPN roi chay lai file 7.'
    exit 1
}

Set-Content -LiteralPath $urlStamp -Value $origin -Encoding ascii

$ipnUrl = $origin + '/api/payments/gateway/ipn'
$returnUrl = $origin + '/api/payments/gateway/return'
$envPath = Join-Path $RepoRoot 'server\.env'

Update-DotEnvKey -Path $envPath -Key 'PAYMENT_IPN_URL' -Value $ipnUrl
Update-DotEnvKey -Path $envPath -Key 'PAYMENT_RETURN_URL' -Value $returnUrl

Write-Host ''
Write-Host '=============================================='
Write-Host 'LINK TUNNEL (copy gui nhom neu can):'
Write-Host ('  ' + $origin)
Write-Host ''
Write-Host 'Da ghi server/.env (khong query string):'
Write-Host ('  PAYMENT_IPN_URL=' + $ipnUrl)
Write-Host ('  PAYMENT_RETURN_URL=' + $returnUrl)
Write-Host '=============================================='
Write-Host ''

if (Test-LocalPortOpen 3000) {
    Write-Host '[CANH BAO] Cong 3000 dang mo. Node CU khong doc .env vua ghi.'
    Write-Host 'Dong cua so API/app cu (file 2 / file 4 / npm start).'
    Write-Host 'Dang doi toi da 2 phut de cong 3000 trong...'
    $freeDeadline = (Get-Date).AddMinutes(2)
    while ((Test-LocalPortOpen 3000) -and ((Get-Date) -lt $freeDeadline)) {
        Write-Host -NoNewline '.'
        Start-Sleep -Seconds 2
    }
    Write-Host ''
    if (Test-LocalPortOpen 3000) {
        Write-Host '[LOI] Cong 3000 van mo - khong start app thu hai.'
        Write-Host 'Giu cua so tunnel. Dong API cu, roi chay: npm start'
        Write-Host '(.env da co URL moi; chi can start lai Node.)'
        exit 1
    }
}

Write-Host 'Dang npm start (API + Electron) de Node nap URL moi...'
Write-Host 'Khong dong cua so nay. Khong dong cua so tunnel.'
Write-Host ''

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) {
    Write-Host '[LOI] Khong thay npm. Cai Node.js 22+ roi chay lai.'
    exit 1
}

& $npm.Source start
exit $LASTEXITCODE

# Tunnel truoc -> ghi PAYMENT_* vao server/.env -> moi npm start.
# Node chi nap .env luc process start (loadEnv), khong doc lai moi request.
# Restart: tu tat node Fly dang LISTEN 3000 (khong cho 2 phut, khong dung cloudflared).
$ErrorActionPreference = 'Stop'
try {
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

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

function Get-ProcessCommandLine {
    param([int]$ProcessId)
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if ($cim -and $cim.CommandLine) { return [string]$cim.CommandLine }
    return ''
}

function Get-ListeningPids {
    param([int]$Port)
    $ids = New-Object System.Collections.Generic.List[int]
    try {
        $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
        foreach ($c in $conns) {
            $owning = [int]$c.OwningProcess
            if ($owning -gt 4) { $ids.Add($owning) }
        }
    } catch {
        $lines = @()
        try { $lines = @(netstat -ano -p TCP) } catch { $lines = @() }
        $pattern = '^\s*TCP\s+\S+:' + [regex]::Escape([string]$Port) + '\s+\S+\s+LISTENING\s+(\d+)\s*$'
        foreach ($line in $lines) {
            $m = [regex]::Match([string]$line, $pattern)
            if ($m.Success) {
                $owning = [int]$m.Groups[1].Value
                if ($owning -gt 4) { $ids.Add($owning) }
            }
        }
    }
    return @($ids | Sort-Object -Unique)
}

function Test-IsFlyNodePid {
    param([int]$ProcessId)
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ([string]$proc.ProcessName -notmatch '^(?i:node|nodejs)$') { return $false }
    $cmd = Get-ProcessCommandLine -ProcessId $ProcessId
    if (-not $cmd) { return $false }
    if ($cmd -match '(?i)supermarket-fly') { return $true }
    if ($cmd -match '(?i)src[/\\]app\.js') { return $true }
    return $false
}

function Test-FlyHealthOnPort {
    param([int]$Port)
    foreach ($name in @('127.0.0.1', 'localhost')) {
        try {
            $r = Invoke-RestMethod -Uri ("http://{0}:{1}/api/health" -f $name, $Port) -TimeoutSec 2
            if ($r -and $r.status -eq 'ok' -and ([string]$r.message -match 'Supermarket Fly')) {
                return $true
            }
        } catch {
        }
    }
    return $false
}

function Test-ShouldStopListener {
    param(
        [int]$ProcessId,
        [bool]$HealthLooksFly
    )
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ([string]$proc.ProcessName -notmatch '^(?i:node|nodejs)$') { return $false }
    if (Test-IsFlyNodePid -ProcessId $ProcessId) { return $true }
    if ($HealthLooksFly) { return $true }
    return $false
}

function Stop-FlyNodeTree {
    param([int]$ProcessId)
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue)
    foreach ($ch in $children) {
        if ([string]$ch.Name -notmatch '(?i)^node(\.exe)?$') { continue }
        try {
            Stop-Process -Id ([int]$ch.ProcessId) -Force -ErrorAction Stop
            Write-Host ("Đã tắt process con Node (PID {0})." -f $ch.ProcessId)
        } catch {
        }
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
}

function Stop-StaleFlyListeners {
    param([int]$Port)
    if (-not (Test-LocalPortOpen $Port)) { return $true }

    $pids = @(Get-ListeningPids -Port $Port)
    if ($pids.Count -eq 0) {
        if (Test-FlyHealthOnPort -Port $Port) {
            Write-Host ("[LỖI] Cổng {0} còn API Fly nhưng không lấy được PID. Đóng cửa sổ npm start / file 2 cũ rồi chạy lại." -f $Port)
            return $false
        }
        $waitUntil = (Get-Date).AddSeconds(5)
        while ((Test-LocalPortOpen $Port) -and ((Get-Date) -lt $waitUntil)) {
            Start-Sleep -Milliseconds 200
        }
        return -not (Test-LocalPortOpen $Port)
    }

    $healthLooksFly = Test-FlyHealthOnPort -Port $Port
    $toStop = New-Object System.Collections.Generic.List[int]
    $unknown = New-Object System.Collections.Generic.List[string]
    foreach ($listenPid in $pids) {
        $proc = Get-Process -Id $listenPid -ErrorAction SilentlyContinue
        $label = if ($proc) { '{0} ({1})' -f $listenPid, $proc.ProcessName } else { [string]$listenPid }
        if (Test-ShouldStopListener -ProcessId $listenPid -HealthLooksFly $healthLooksFly) {
            $toStop.Add($listenPid)
        } else {
            $unknown.Add($label)
        }
    }

    if ($toStop.Count -eq 0) {
        Write-Host ("[LỖI] Cổng {0} đang bị process khác giữ (PID {1}). Không tắt vì không chắc là Node của Fly." -f $Port, ($unknown -join ', '))
        return $false
    }

    foreach ($procId in $toStop) {
        try {
            Stop-FlyNodeTree -ProcessId $procId
            Write-Host ("Cổng {0} còn process cũ (PID {1}). Đã tắt để đọc .env mới." -f $Port, $procId)
        } catch {
            Write-Host ("[LỖI] Không tắt được PID {0}: {1}" -f $procId, $_.Exception.Message)
            return $false
        }
    }

    $waitUntil = (Get-Date).AddSeconds(8)
    while ((Test-LocalPortOpen $Port) -and ((Get-Date) -lt $waitUntil)) {
        Start-Sleep -Milliseconds 200
    }
    if (Test-LocalPortOpen $Port) {
        Write-Host ("[LỖI] Cổng {0} vẫn bận sau khi tắt PID {1}." -f $Port, ($toStop -join ', '))
        return $false
    }
    return $true
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

if (-not (Stop-StaleFlyListeners -Port 3000)) {
    Write-Host 'Giữ cửa sổ tunnel. Đóng process lạ trên cổng 3000, rồi chạy: npm start'
    Write-Host '(.env đã có URL mới; chỉ cần start lại Node.)'
    exit 1
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

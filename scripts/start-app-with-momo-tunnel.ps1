# Tunnel truoc -> ghi PAYMENT_* + TELEGRAM webhook (tunnel hien tai) vao server/.env -> moi npm start.
# Node chi nap .env luc process start (loadEnv), khong doc lai moi request.
# Restart: tu tat node Fly dang LISTEN 3000 (khong cho 2 phut, khong dung cloudflared).
# ASCII-only strings: Windows PowerShell 5.1 reads no-BOM files as ANSI (CP1252/1258).
# UTF-8 bytes of o/o/o/o/d (0x91-0x94) become smart quotes and break the parser.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
try { chcp 65001 | Out-Null } catch {}

. (Join-Path $PSScriptRoot 'fly-term.ps1')

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'package.json'))) {
    Write-FlyErr 'Khong thay package.json. Chay tu thu muc supermarket-fly.'
    exit 1
}
Set-Location -LiteralPath $RepoRoot

$DownloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
$UrlPattern = 'https://[A-Za-z0-9-]+\.trycloudflare\.com'
$WaitSeconds = 240
$MaxTunnelAttempts = 4
$TunnelLogMarker = 'supermarket-fly-cloudflare-tunnel'
$LocalTunnelTarget = 'http://localhost:3000'

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
    Write-FlyErr 'Khong thay cloudflared.exe'
    Write-Host ''
    Write-FlyInfo 'Tai file nay bang trinh duyet:'
    Write-FlyColor ("  $DownloadUrl") White
    Write-Host ''
    Write-FlyInfo 'Doi ten thanh cloudflared.exe'
    Write-FlyInfo ("Dat vao: $RepoRoot")
    Write-FlyInfo 'Xem docs/HUONG_DAN_CLOUDFLARE_TUNNEL.md phan A1.'
    Write-Host ''
    Write-FlyInfo 'May thanh vien / khong test ZaloPay: npm start hoac 2_CHAY_SUPERMARKET_FLY.bat'
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
    $ids | Sort-Object -Unique
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
            Write-FlyOk ("Da tat process con Node (PID {0})." -f $ch.ProcessId)
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
            Write-FlyErr ("Cong {0} con API Fly nhung khong lay duoc PID. Dong cua so npm start / file 2 cu roi chay lai." -f $Port)
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
        Write-FlyErr ("Cong {0} dang bi process khac giu (PID {1}). Khong tat vi khong chac la Node cua Fly." -f $Port, ($unknown -join ', '))
        return $false
    }

    foreach ($procId in $toStop) {
        try {
            Stop-FlyNodeTree -ProcessId $procId
            Write-FlyOk ("Cong {0} con process cu (PID {1}). Da tat de doc .env moi." -f $Port, $procId)
        } catch {
            Write-FlyErr ("Khong tat duoc PID {0}: {1}" -f $procId, $_.Exception.Message)
            return $false
        }
    }

    $waitUntil = (Get-Date).AddSeconds(8)
    while ((Test-LocalPortOpen $Port) -and ((Get-Date) -lt $waitUntil)) {
        Start-Sleep -Milliseconds 200
    }
    if (Test-LocalPortOpen $Port) {
        Write-FlyErr ("Cong {0} van ban sau khi tat PID {1}." -f $Port, ($toStop -join ', '))
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

function Get-TunnelStatePath {
    param([string]$LogPath)
    return ($LogPath + '.state')
}

function Read-TunnelStateMap {
    param([string]$LogPath)
    $map = @{
        status  = ''
        attempt = ''
        detail  = ''
        url     = ''
    }
    $text = Read-SharedText (Get-TunnelStatePath $LogPath)
    if (-not $text) { return $map }
    foreach ($line in ($text -split "`r?`n")) {
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { continue }
        $k = $line.Substring(0, $eq).Trim().ToLowerInvariant()
        $v = $line.Substring($eq + 1).Trim()
        if ($map.ContainsKey($k)) { $map[$k] = $v }
    }
    return $map
}

function Get-LogPathFromCommandLine {
    param([string]$CommandLine)
    if (-not $CommandLine) { return '' }
    $m = [regex]::Match($CommandLine, '(?i)--logfile\s+"?([^\s"]+)')
    if ($m.Success) { return $m.Groups[1].Value }
    $m2 = [regex]::Match($CommandLine, '(?i)-LogPath\s+"?([^\s"]+)')
    if ($m2.Success) { return $m2.Groups[1].Value }
    return ''
}

function Test-IsProjectCloudflared {
    param(
        [int]$ProcessId,
        [string]$CloudflaredPath
    )
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ([string]$proc.ProcessName -notmatch '(?i)^cloudflared$') { return $false }
    $cmd = Get-ProcessCommandLine -ProcessId $ProcessId
    $exeOurs = $false
    try {
        if ($CloudflaredPath -and $proc.Path -and (
                [string]::Equals($proc.Path, $CloudflaredPath, [StringComparison]::OrdinalIgnoreCase)
            )) {
            $exeOurs = $true
        }
    } catch {
    }
    if (-not $cmd) { return $exeOurs }
    if ($cmd -match '(?i)(\s|^)service(\s|$)') { return $false }
    if ($cmd -match '(?i)tunnel\s+run\b' -and $cmd -notmatch [regex]::Escape($LocalTunnelTarget)) {
        return $false
    }
    if ($cmd -match [regex]::Escape($TunnelLogMarker)) { return $true }
    if ($CloudflaredPath -and $cmd -match [regex]::Escape($CloudflaredPath)) { $exeOurs = $true }
    $hasLocalUrl = $cmd -match [regex]::Escape($LocalTunnelTarget)
    $inRepo = $cmd -match [regex]::Escape($RepoRoot)
    if ($hasLocalUrl -and ($exeOurs -or $inRepo)) { return $true }
    return $false
}

function Test-IsProjectTunnelRunner {
    param([int]$ProcessId)
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ([string]$proc.ProcessName -notmatch '(?i)^(powershell|pwsh)$') { return $false }
    $cmd = Get-ProcessCommandLine -ProcessId $ProcessId
    if (-not $cmd) { return $false }
    if ($cmd -notmatch '(?i)run-cloudflared-tunnel\.ps1') { return $false }
    if ($cmd -match [regex]::Escape($TunnelLogMarker)) { return $true }
    if ($cmd -match [regex]::Escape($RepoRoot)) { return $true }
    return $false
}

function Get-ProjectCloudflaredProcesses {
    param([string]$CloudflaredPath)
    foreach ($p in @(Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue)) {
        if (Test-IsProjectCloudflared -ProcessId $p.Id -CloudflaredPath $CloudflaredPath) {
            Write-Output $p
        }
    }
}

function Get-ProjectTunnelRunnerProcesses {
    foreach ($name in @('powershell', 'pwsh')) {
        foreach ($p in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
            if (Test-IsProjectTunnelRunner -ProcessId $p.Id) {
                Write-Output $p
            }
        }
    }
}

function Get-TunnelOriginFromProcess {
    param([int]$ProcessId)
    $cmd = Get-ProcessCommandLine -ProcessId $ProcessId
    $log = Get-LogPathFromCommandLine $cmd
    if (-not $log) { return $null }
    $origin = Get-TunnelOriginFromText (Read-SharedText $log)
    if ($origin) { return $origin }
    $state = Read-TunnelStateMap $log
    if ($state.url) {
        return (Get-TunnelOriginFromText $state.url)
    }
    return $null
}

function Stop-PidQuiet {
    param(
        [int]$ProcessId,
        [string]$Label
    )
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return $true }
    try {
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
        Write-FlyOk ("Da tat {0} (PID {1})." -f $Label, $ProcessId)
        return $true
    } catch {
        Write-FlyWarn ("Khong tat duoc {0} PID {1}: {2}" -f $Label, $ProcessId, $_.Exception.Message)
        return $false
    }
}

function Stop-StaleProjectTunnels {
    param(
        [string]$CloudflaredPath,
        [int[]]$KeepPids
    )
    $keep = @{}
    foreach ($id in @($KeepPids)) {
        if ($id -gt 0) { $keep[$id] = $true }
    }

    foreach ($p in @(Get-ProjectCloudflaredProcesses -CloudflaredPath $CloudflaredPath)) {
        if ($keep.ContainsKey([int]$p.Id)) { continue }
        Stop-PidQuiet -ProcessId $p.Id -Label 'cloudflared cu (project)' | Out-Null
    }

    foreach ($p in @(Get-ProjectTunnelRunnerProcesses)) {
        if ($keep.ContainsKey([int]$p.Id)) { continue }
        Stop-PidQuiet -ProcessId $p.Id -Label 'cua so tunnel cu' | Out-Null
    }

    $waitUntil = (Get-Date).AddSeconds(6)
    while ((Get-Date) -lt $waitUntil) {
        $left = @(
            Get-ProjectCloudflaredProcesses -CloudflaredPath $CloudflaredPath |
                Where-Object { -not $keep.ContainsKey([int]$_.Id) }
        )
        if ($left.Count -eq 0) { break }
        Start-Sleep -Milliseconds 250
    }
}

function Resolve-ExistingProjectTunnel {
    param([string]$CloudflaredPath)

    $cfList = @(Get-ProjectCloudflaredProcesses -CloudflaredPath $CloudflaredPath)
    $healthy = @()
    $zombies = @()
    foreach ($p in $cfList) {
        $found = Get-TunnelOriginFromProcess -ProcessId $p.Id
        if ($found) {
            $healthy += , @{ Proc = $p; Origin = $found }
        } else {
            $zombies += , $p
        }
    }

    foreach ($z in $zombies) {
        Write-FlyWarn ("Tunnel cu khong co URL (PID {0}). Dang tat zombie." -f $z.Id)
        Stop-PidQuiet -ProcessId $z.Id -Label 'cloudflared zombie' | Out-Null
    }

    $keepIds = @()
    $origin = $null
    if ($healthy.Count -gt 0) {
        $chosen = $healthy[0]
        $origin = [string]$chosen.Origin
        $keepIds += [int]$chosen.Proc.Id
        Write-FlyOk ("Dung lai tunnel dang chay (co URL): {0}" -f $origin)
        if ($healthy.Count -gt 1) {
            Write-FlyWarn 'Co nhieu tunnel project. Giu cai dau, tat cai du.'
            for ($i = 1; $i -lt $healthy.Count; $i++) {
                Stop-PidQuiet -ProcessId ([int]$healthy[$i].Proc.Id) -Label 'cloudflared du' | Out-Null
            }
        }
        foreach ($r in @(Get-ProjectTunnelRunnerProcesses)) {
            $children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId={0}" -f $r.Id) -ErrorAction SilentlyContinue)
            $hasCf = $false
            foreach ($ch in $children) {
                if ([string]$ch.Name -match '(?i)cloudflared') { $hasCf = $true; break }
            }
            if ($hasCf) { $keepIds += [int]$r.Id }
        }
    }

    Stop-StaleProjectTunnels -CloudflaredPath $CloudflaredPath -KeepPids $keepIds
    Start-Sleep -Milliseconds 400

    if ($origin) {
        $still = Get-Process -Id $keepIds[0] -ErrorAction SilentlyContinue
        if ($still) { return $origin }
        Write-FlyWarn 'Tunnel vua dung lai da tat. Se mo tunnel moi.'
        return $null
    }
    return $null
}

function Show-TunnelFailureHelp {
    param(
        [string]$LogText,
        [string]$Reason
    )
    Write-FlyWaitDone
    $timeout = Test-QuickTunnelTimeoutText $LogText
    if ($timeout -or $Reason -eq 'timeout') {
        Write-FlyErr 'Quick tunnel trycloudflare.com that bai (timeout hoac Cloudflare tra ve rong).'
        Write-FlyInfo 'Day la loi mang / Cloudflare, KHONG phai loi app SuperMarket Fly hay ZaloPay.'
        Write-FlyInfo 'Khong can tat-mo cua so ban hang (Electron).'
        Write-Host ''
        Write-FlyInfo 'Lam gi tiep:'
        Write-FlyInfo '  1. Doi 1-2 phut, chay lai: npm run start:zalopay'
        Write-FlyInfo '     Script tu tat tunnel cu CUA PROJECT nay, thu 4 lan neu timeout.'
        Write-FlyInfo '  2. Tat VPN. Neu mang truong chan Cloudflare, doi mang (4G).'
        Write-FlyInfo '  3. Van fail: named Cloudflare Tunnel (can tai khoan + domain) hoac ngrok.'
        Write-FlyInfo '     Tailscale khong thay cho ZaloPay IPN (khong phai HTTPS public).'
        Write-FlyInfo '  Xem docs/HUONG_DAN_CLOUDFLARE_TUNNEL.md phan E + F.'
        Write-FlyWarn 'Khong ghi server/.env (tranh URL do). URL trycloudflare cu da chet.'
        return
    }
    if ($Reason -eq 'smartscreen' -or $Reason -eq 'never-started') {
        Write-FlyErr 'cloudflared khong chay duoc (SmartScreen / Windows chan .exe?).'
        Write-FlyInfo 'Cua so tunnel: More info -> Run anyway. Xem docs phan A1.'
        Write-FlyInfo 'Khong phai loi app. Khong ghi server/.env.'
        return
    }
    if ($Reason -eq 'closed') {
        Write-FlyErr 'Cua so tunnel da dong truoc khi co URL.'
        Write-FlyInfo 'Giu cua so Cloudflare mo. Chay lai npm run start:zalopay.'
        Write-FlyInfo 'Khong ghi server/.env.'
        return
    }
    Write-FlyErr 'Khong lay duoc URL trycloudflare.com.'
    Write-FlyInfo 'Xem cua so tunnel. Khong phai loi app. Khong ghi server/.env.'
    Write-FlyInfo 'Tai: docs/HUONG_DAN_CLOUDFLARE_TUNNEL.md phan E + F.'
}

Write-FlyBanner 'SUPERMARKET FLY - ZaloPay tunnel' @(
    '1  Mo Cloudflare tunnel',
    '2  Ghi URL vao server/.env',
    '3  Chay API + cua so ban hang',
    '',
    'Giu cua so tunnel mo khi test QR / Telegram.'
)

$cf = Find-Cloudflared
if (-not $cf) {
    Show-CloudflaredHelp
    exit 1
}

Write-FlyOk ('Dung ' + $cf)
Write-Host ''

$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $env:TEMP ("supermarket-fly-cloudflare-tunnel-" + $runId + ".log")
$urlStamp = Join-Path $env:TEMP ("supermarket-fly-cloudflare-tunnel-" + $runId + ".url")
$runner = Join-Path $PSScriptRoot 'run-cloudflared-tunnel.ps1'
if (-not (Test-Path -LiteralPath $runner)) {
    Write-FlyErr ('Thieu file: ' + $runner)
    exit 1
}

$otherCloudflared = @(Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue)
$projectCloudflared = @(Get-ProjectCloudflaredProcesses -CloudflaredPath $cf)
if ($otherCloudflared.Count -gt $projectCloudflared.Count) {
    Write-FlyWarn 'Co cloudflared khong thuoc project nay. Script khong tat chung.'
}

$origin = Resolve-ExistingProjectTunnel -CloudflaredPath $cf
$runnerProc = $null

if (-not $origin) {
    $arg = "-NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File `"$runner`" -CloudflaredPath `"$cf`" -LogPath `"$logFile`" -MaxAttempts $MaxTunnelAttempts"
    $runnerProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $arg -WorkingDirectory $RepoRoot -PassThru

    Write-FlyInfo 'Da mo cua so tunnel. Dang lay https://....trycloudflare.com'
    Write-FlyInfo ('Thu toi da {0} lan neu Cloudflare timeout (doi toi {1}s).' -f $MaxTunnelAttempts, $WaitSeconds)
    Write-Host ''

    $startedAt = Get-Date
    $deadline = $startedAt.AddSeconds($WaitSeconds)
    $sawTimeoutHint = $false
    $sawCloudflared = $false
    while ((Get-Date) -lt $deadline) {
        $logText = Read-SharedText $logFile
        $origin = Get-TunnelOriginFromText $logText
        $state = Read-TunnelStateMap $logFile
        if (-not $origin -and $state.url) {
            $origin = Get-TunnelOriginFromText $state.url
        }

        $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
        $runnerAlive = $false
        if ($runnerProc) {
            $runnerAlive = [bool](Get-Process -Id $runnerProc.Id -ErrorAction SilentlyContinue)
        }
        $cfAlive = @(Get-ProjectCloudflaredProcesses -CloudflaredPath $cf)
        if ($cfAlive.Count -gt 0) { $sawCloudflared = $true }

        if ($origin -and $cfAlive.Count -gt 0) { break }

        if ((Test-QuickTunnelTimeoutText $logText) -and -not $sawTimeoutHint) {
            $sawTimeoutHint = $true
            Write-FlyWaitDone
            Write-FlyWarn 'Quick tunnel Cloudflare loi. Dang thu lai (khong phai loi app)...'
        }

        if ($state.status -eq 'failed') {
            $why = $state.detail
            if (-not $why) { $why = 'timeout' }
            Show-TunnelFailureHelp -LogText $logText -Reason $why
            exit 1
        }

        if (-not $runnerAlive -and $elapsed -gt 8) {
            $why = 'closed'
            if (-not $sawCloudflared) { $why = 'never-started' }
            elseif (Test-QuickTunnelTimeoutText $logText) { $why = 'timeout' }
            Show-TunnelFailureHelp -LogText $logText -Reason $why
            exit 1
        }

        Write-FlyWait -Elapsed $elapsed -MaxSeconds $WaitSeconds
        Start-Sleep -Seconds 1
    }
    Write-FlyWaitDone

    if (-not $origin) {
        $logText = Read-SharedText $logFile
        $why = 'timeout'
        if (-not (Test-QuickTunnelTimeoutText $logText) -and -not $sawCloudflared) {
            $why = 'never-started'
        }
        Show-TunnelFailureHelp -LogText $logText -Reason $why
        exit 1
    }

    $cfAlive = @(Get-ProjectCloudflaredProcesses -CloudflaredPath $cf)
    if ($cfAlive.Count -eq 0) {
        Show-TunnelFailureHelp -LogText (Read-SharedText $logFile) -Reason 'closed'
        exit 1
    }
}

if (-not $origin -or $origin -notmatch ('^' + $UrlPattern + '$')) {
    Show-TunnelFailureHelp -LogText (Read-SharedText $logFile) -Reason 'timeout'
    exit 1
}

$stillUp = @(Get-ProjectCloudflaredProcesses -CloudflaredPath $cf)
if ($stillUp.Count -eq 0) {
    Show-TunnelFailureHelp -LogText (Read-SharedText $logFile) -Reason 'closed'
    exit 1
}

Set-Content -LiteralPath $urlStamp -Value $origin -Encoding ascii

$ipnUrl = $origin + '/api/payments/gateway/ipn'
$returnUrl = $origin + '/api/payments/gateway/return'
$telegramWebhook = $origin + '/api/telegram/webhook'
$envPath = Join-Path $RepoRoot 'server\.env'

# Chi ghi .env khi tunnel con song va URL hop le. Fail o tren khong dung ham nay.
Update-DotEnvKey -Path $envPath -Key 'PAYMENT_IPN_URL' -Value $ipnUrl
Update-DotEnvKey -Path $envPath -Key 'PAYMENT_RETURN_URL' -Value $returnUrl
Update-DotEnvKey -Path $envPath -Key 'TELEGRAM_WEBHOOK_URL' -Value $telegramWebhook
Update-DotEnvKey -Path $envPath -Key 'TELEGRAM_PUBLIC_BASE_URL' -Value $origin

Write-Host ''
Write-FlyRule
Write-FlyColor '  Tunnel san sang' Green
Write-Host ''
Write-FlyKeyValue 'Link' $origin Cyan
Write-Host ''
Write-FlyOk 'Da ghi server/.env'
Write-FlyKeyValue 'IPN' $ipnUrl DarkGray
Write-FlyKeyValue 'Return' $returnUrl DarkGray
Write-FlyKeyValue 'Telegram' $telegramWebhook DarkGray
Write-FlyRule
Write-Host ''

if (-not (Stop-StaleFlyListeners -Port 3000)) {
    Write-FlyWarn 'Giu cua so tunnel. Dong process la tren cong 3000, roi chay: npm start'
    Write-FlyInfo '(.env da co URL moi; chi can start lai Node.)'
    exit 1
}

Write-FlyInfo 'Dang mo API + cua so ban hang...'
Write-FlyInfo 'Dung dong cua so nay. Dung dong cua so tunnel.'
Write-Host ''

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) {
    Write-FlyErr 'Khong thay npm. Cai Node.js 22+ roi chay lai.'
    exit 1
}

& $npm.Source start
exit $LASTEXITCODE

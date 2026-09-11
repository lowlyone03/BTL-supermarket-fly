# Mau chu terminal Fly. Cham . fly-term.ps1 tu script start.
# ASCII banners + UTF-8 BOM (Windows PowerShell 5.1 ANSI-decodes no-BOM files).
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
try { chcp 65001 | Out-Null } catch {}

$script:FlyUseColor = $true
try {
    if ($Host.UI.RawUI) { $null = $Host.UI.RawUI }
} catch {
    $script:FlyUseColor = $false
}

function Write-FlyColor {
    param(
        [string]$Text,
        [ConsoleColor]$Color = [ConsoleColor]::Gray,
        [switch]$NoNewline
    )
    if ($script:FlyUseColor) {
        if ($NoNewline) { Write-Host -NoNewline $Text -ForegroundColor $Color }
        else { Write-Host $Text -ForegroundColor $Color }
    } else {
        if ($NoNewline) { Write-Host -NoNewline $Text }
        else { Write-Host $Text }
    }
}

function Write-FlyRule {
    Write-FlyColor ('  ' + ('-' * 58)) DarkGray
}

function Write-FlyBanner {
    param(
        [string]$Title,
        [string[]]$Lines
    )
    Write-Host ''
    Write-FlyRule
    Write-FlyColor ("  $Title") Cyan
    foreach ($line in $Lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { Write-Host ''; continue }
        Write-FlyColor ("  $line") DarkGray
    }
    Write-FlyRule
    Write-Host ''
}

function Write-FlyOk {
    param([string]$Text)
    Write-Host -NoNewline '  '
    Write-FlyColor '[ok]  ' Green -NoNewline
    Write-Host $Text
}

function Write-FlyWarn {
    param([string]$Text)
    Write-Host -NoNewline '  '
    Write-FlyColor '[!]  ' Yellow -NoNewline
    Write-Host $Text
}

function Write-FlyErr {
    param([string]$Text)
    Write-Host -NoNewline '  '
    Write-FlyColor '[x]  ' Red -NoNewline
    Write-Host $Text
}

function Write-FlyInfo {
    param([string]$Text)
    Write-FlyColor ("  *  $Text") DarkGray
}

function Write-FlyKeyValue {
    param(
        [string]$Key,
        [string]$Value,
        [ConsoleColor]$ValueColor = [ConsoleColor]::White
    )
    Write-Host -NoNewline ('  ' + $Key.PadRight(12))
    Write-FlyColor $Value $ValueColor
}

function Write-FlyWait {
    param(
        [int]$Elapsed,
        [int]$MaxSeconds
    )
    $frames = @('|', '/', '-', '\')
    $frame = $frames[$Elapsed % $frames.Length]
    $msg = "  $frame  Dang cho tunnel... ${Elapsed}s / ${MaxSeconds}s"
    Write-Host -NoNewline ("`r" + $msg.PadRight(62))
}

function Write-FlyWaitDone {
    Write-Host -NoNewline ("`r" + (' ' * 62) + "`r")
}

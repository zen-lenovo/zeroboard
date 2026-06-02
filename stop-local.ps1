$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runStateDir = Join-Path $rootDir '.local-run'
$pidFiles = @(
    @{ Name = 'backend'; Path = (Join-Path $runStateDir 'backend.pid') },
    @{ Name = 'frontend'; Path = (Join-Path $runStateDir 'frontend.pid') }
)

foreach ($entry in $pidFiles) {
    if (-not (Test-Path $entry.Path)) {
        Write-Host "$($entry.Name) is not recorded as running."
        continue
    }

    $recordedPids = @(Get-Content $entry.Path -ErrorAction SilentlyContinue | Where-Object { $_ } | Select-Object -Unique)
    $stoppedAny = $false

    foreach ($recordedPid in $recordedPids) {
        $process = Get-Process -Id $recordedPid -ErrorAction SilentlyContinue
        if ($process) {
            taskkill /PID $recordedPid /T /F *> $null
            Write-Host "Stopped $($entry.Name) (PID $recordedPid)."
            $stoppedAny = $true
        }
    }

    if (-not $stoppedAny) {
        Write-Host "$($entry.Name) was not running."
    }

    Remove-Item $entry.Path -Force -ErrorAction SilentlyContinue
}

$listeners = Get-NetTCPConnection -State Listen -LocalPort 8000,5173 -ErrorAction SilentlyContinue |
    Select-Object LocalPort, OwningProcess -Unique |
    Sort-Object LocalPort

if ($listeners) {
    Write-Host 'Ports still in use after stop attempt:'
    $listeners | ForEach-Object {
        Write-Host "  Port $($_.LocalPort) -> PID $($_.OwningProcess)"
    }
}
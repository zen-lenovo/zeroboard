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

    $recordedPid = Get-Content $entry.Path -ErrorAction SilentlyContinue
    $process = Get-Process -Id $recordedPid -ErrorAction SilentlyContinue

    if ($process) {
        Stop-Process -Id $recordedPid -Force
        Write-Host "Stopped $($entry.Name) (PID $recordedPid)."
    } else {
        Write-Host "$($entry.Name) was not running."
    }

    Remove-Item $entry.Path -Force -ErrorAction SilentlyContinue
}
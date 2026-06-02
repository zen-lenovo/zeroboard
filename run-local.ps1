param(
    [switch]$Install
)

$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $rootDir 'backend'
$frontendDir = Join-Path $rootDir 'frontend'
$runStateDir = Join-Path $rootDir '.local-run'
$venvDir = Join-Path $backendDir '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$backendPidFile = Join-Path $runStateDir 'backend.pid'
$frontendPidFile = Join-Path $runStateDir 'frontend.pid'

function Get-RequiredCommand {
    param([string[]]$Names)

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }

    throw "Required command not found. Tried: $($Names -join ', ')"
}

$pythonBootstrap = Get-RequiredCommand -Names @('py', 'python')
$npmCommand = Get-RequiredCommand -Names @('npm.cmd', 'npm')

New-Item -ItemType Directory -Path $runStateDir -Force | Out-Null

function Remove-StalePidFile {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return
    }

    $recordedPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if (-not $recordedPid) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        return
    }

    $process = Get-Process -Id $recordedPid -ErrorAction SilentlyContinue
    if (-not $process) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

function Start-ManagedProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string]$WorkingDirectory,
        [string[]]$Arguments,
        [string]$PidFile
    )

    Remove-StalePidFile -PidFile $PidFile

    if (Test-Path $PidFile) {
        $existingPid = Get-Content $PidFile
        $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        if ($existingProcess) {
            Write-Host "$Name is already running (PID $existingPid)."
            return $existingProcess
        }
    }

    $process = Start-Process -FilePath $FilePath -WorkingDirectory $WorkingDirectory -ArgumentList $Arguments -PassThru
    Set-Content -Path $PidFile -Value $process.Id
    Write-Host "Started $Name (PID $($process.Id))."
    return $process
}

if (-not (Test-Path $venvPython)) {
    Write-Host 'Creating backend virtual environment...'
    & $pythonBootstrap -m venv $venvDir
    $Install = $true
}

if ($Install) {
    Write-Host 'Installing backend dependencies...'
    & $venvPython -m pip install -r (Join-Path $backendDir 'requirements.txt')
}

if ($Install -or -not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Write-Host 'Installing frontend dependencies...'
    Push-Location $frontendDir
    try {
        if (Test-Path (Join-Path $frontendDir 'package-lock.json')) {
            & $npmCommand ci
        } else {
            & $npmCommand install
        }
    }
    finally {
        Pop-Location
    }
}

Start-ManagedProcess -Name 'backend' -FilePath $venvPython -WorkingDirectory $backendDir -Arguments @(
    '-m',
    'uvicorn',
    'app.main:app',
    '--host',
    '127.0.0.1',
    '--port',
    '8000'
) -PidFile $backendPidFile | Out-Null

Start-ManagedProcess -Name 'frontend' -FilePath $npmCommand -WorkingDirectory $frontendDir -Arguments @(
    'run',
    'dev',
    '--',
    '--host=127.0.0.1',
    '--port=5173'
) -PidFile $frontendPidFile | Out-Null

Write-Host ''
Write-Host 'Started local development servers:'
Write-Host '  Frontend: http://127.0.0.1:5173'
Write-Host '  Backend:  http://127.0.0.1:8000'
Write-Host '  Docs:     http://127.0.0.1:8000/docs'
Write-Host ''
Write-Host 'Run .\stop-local.ps1 to stop both services.'
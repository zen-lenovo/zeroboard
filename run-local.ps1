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
$viteCli = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
$backendPidFile = Join-Path $runStateDir 'backend.pid'
$frontendPidFile = Join-Path $runStateDir 'frontend.pid'
$backendOutLogFile = Join-Path $runStateDir 'backend.out.log'
$backendErrLogFile = Join-Path $runStateDir 'backend.err.log'
$frontendOutLogFile = Join-Path $runStateDir 'frontend.out.log'
$frontendErrLogFile = Join-Path $runStateDir 'frontend.err.log'

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
$nodeCommand = Get-RequiredCommand -Names @('node.exe', 'node')

New-Item -ItemType Directory -Path $runStateDir -Force | Out-Null

function Remove-StalePidFile {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return
    }

    $recordedPids = @(Get-Content $PidFile -ErrorAction SilentlyContinue | Where-Object { $_ })
    if (-not $recordedPids.Count) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        return
    }

    $activePids = @($recordedPids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    if (-not $activePids.Count) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

function Stop-RecordedProcess {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return
    }

    $recordedPids = @(Get-Content $PidFile -ErrorAction SilentlyContinue | Where-Object { $_ } | Select-Object -Unique)
    foreach ($recordedPid in $recordedPids) {
        taskkill /PID $recordedPid /T /F *> $null
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Write-PortOwnerPids {
    param(
        [int]$Port,
        [string]$PidFile
    )

    $pids = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { "$($_)" })

    if ($pids.Count) {
        Set-Content -Path $PidFile -Value $pids
        return
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Assert-PortFree {
    param(
        [int]$Port,
        [string]$Name
    )

    $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listeners) {
        $pids = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
        throw "$Name could not start because port $Port is already in use by PID(s): $pids. Stop the conflicting process or run .\stop-local.ps1 if it belongs to this app."
    }
}

function Start-ManagedProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string]$WorkingDirectory,
        [string[]]$Arguments,
        [string]$PidFile,
        [string]$OutLogFile,
        [string]$ErrLogFile
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

    if (Test-Path $OutLogFile) {
        Remove-Item $OutLogFile -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $ErrLogFile) {
        Remove-Item $ErrLogFile -Force -ErrorAction SilentlyContinue
    }

    $process = Start-Process -FilePath $FilePath -WorkingDirectory $WorkingDirectory -ArgumentList $Arguments -RedirectStandardOutput $OutLogFile -RedirectStandardError $ErrLogFile -PassThru
    Set-Content -Path $PidFile -Value $process.Id
    Write-Host "Started $Name (PID $($process.Id))."
    return $process
}

function Wait-ForHttpEndpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$PidFile,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        }
        catch {
            $recordedPids = if (Test-Path $PidFile) { @(Get-Content $PidFile -ErrorAction SilentlyContinue | Where-Object { $_ }) } else { @() }
            $activePids = @($recordedPids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
            if ($recordedPids.Count -and -not $activePids.Count) {
                throw "$Name stopped before becoming ready."
            }
        }

        Start-Sleep -Milliseconds 500
    }

    throw "$Name did not become ready at $Url within $TimeoutSeconds seconds."
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

if (-not (Test-Path $viteCli)) {
    throw "Vite CLI not found at $viteCli. Run .\run-local.ps1 -Install to install frontend dependencies."
}

Stop-RecordedProcess -PidFile $backendPidFile
Stop-RecordedProcess -PidFile $frontendPidFile

Assert-PortFree -Port 8000 -Name 'backend'
Assert-PortFree -Port 5173 -Name 'frontend'

Start-ManagedProcess -Name 'backend' -FilePath $venvPython -WorkingDirectory $backendDir -Arguments @(
    '-m',
    'uvicorn',
    'app.main:app',
    '--host',
    '127.0.0.1',
    '--port',
    '8000'
) -PidFile $backendPidFile -OutLogFile $backendOutLogFile -ErrLogFile $backendErrLogFile | Out-Null

Start-ManagedProcess -Name 'frontend' -FilePath $nodeCommand -WorkingDirectory $frontendDir -Arguments @(
    $viteCli,
    '--host',
    '127.0.0.1',
    '--port',
    '5173'
) -PidFile $frontendPidFile -OutLogFile $frontendOutLogFile -ErrLogFile $frontendErrLogFile | Out-Null

Wait-ForHttpEndpoint -Name 'backend' -Url 'http://127.0.0.1:8000/health' -PidFile $backendPidFile
Wait-ForHttpEndpoint -Name 'frontend' -Url 'http://127.0.0.1:5173' -PidFile $frontendPidFile

Write-PortOwnerPids -Port 8000 -PidFile $backendPidFile
Write-PortOwnerPids -Port 5173 -PidFile $frontendPidFile

Write-Host ''
Write-Host 'Started local development servers:'
Write-Host '  Frontend: http://127.0.0.1:5173'
Write-Host '  Backend:  http://127.0.0.1:8000'
Write-Host '  Docs:     http://127.0.0.1:8000/docs'
Write-Host '  Logs:     .local-run/*.out.log and .local-run/*.err.log'
Write-Host ''
Write-Host 'Run .\stop-local.ps1 to stop both services.'
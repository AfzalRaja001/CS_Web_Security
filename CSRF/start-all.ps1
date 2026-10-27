$ErrorActionPreference = 'Stop'

$services = @(
  [pscustomobject]@{
    Name = 'Vulnerable victim'
    Port = 4310
    Url = 'http://127.0.0.1:4310'
    RequiredCommand = 'npm'
    Command = 'npm start'
    WorkingDirectory = Join-Path $PSScriptRoot 'victim-site\vulnerable'
  }
  [pscustomobject]@{
    Name = 'Protected victim'
    Port = 4312
    Url = 'http://127.0.0.1:4312'
    RequiredCommand = 'npm'
    Command = 'npm start'
    WorkingDirectory = Join-Path $PSScriptRoot 'victim-site\protected'
  }
  [pscustomobject]@{
    Name = 'Attacker website'
    Port = 4311
    Url = 'http://localhost:4311'
    RequiredCommand = 'py'
    Command = 'py -m http.server 4311 --bind 127.0.0.1'
    WorkingDirectory = Join-Path $PSScriptRoot 'attacker-site'
  }
)

foreach ($service in $services) {
  if (-not (Get-Command $service.RequiredCommand -ErrorAction SilentlyContinue)) {
    throw "Required command '$($service.RequiredCommand)' was not found on PATH."
  }
  if (-not (Test-Path $service.WorkingDirectory)) {
    throw "Service directory not found: $($service.WorkingDirectory)"
  }
}

foreach ($service in $services) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue
  if ($listener) {
    Write-Host "$($service.Name) already has a listener on port $($service.Port); leaving it alone."
    continue
  }

  Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoExit', '-Command', $service.Command) `
    -WorkingDirectory $service.WorkingDirectory
  Write-Host "Started $($service.Name) on port $($service.Port)."
}

Write-Host ''
Write-Host 'Local URLs:'
foreach ($service in $services) {
  Write-Host "  $($service.Name): $($service.Url)"
}
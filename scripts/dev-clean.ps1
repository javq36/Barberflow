$ErrorActionPreference = "SilentlyContinue"

$ports = @(3000, 3001, 5164, 7095)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen
    foreach ($connection in $connections) {
        Stop-Process -Id $connection.OwningProcess -Force
    }
}

$nextLockPath = Join-Path $PSScriptRoot "..\src\barberflow-web\.next\dev\lock"
if (Test-Path $nextLockPath) {
    Remove-Item -Path $nextLockPath -Force
}

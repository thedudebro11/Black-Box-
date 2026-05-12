# get-processes.ps1 — Return running process list as JSON
#
# Called by src/collectors/processes.ts via PowerShell runner.
# Returns Name, Id, cpu_pct, memory_mb for all running processes.
# Privacy: Name only — no arguments, file paths, or user information.

# Stop on any unhandled error so the caller receives a non-zero exit code
$ErrorActionPreference = 'Stop'

try {
    $processes = Get-Process | Select-Object `
        Name, `
        Id, `
        @{N='cpu_pct';  E={ [math]::Round($_.CPU, 1) }}, `
        @{N='memory_mb'; E={ [math]::Round($_.WorkingSet64 / 1MB, 1) }}

    # ConvertTo-Json wraps a single object in an array for consistency
    $processes | ConvertTo-Json -Compress
}
catch {
    # Return empty array on error so the TypeScript caller receives parseable JSON
    Write-Output '[]'
    exit 1
}

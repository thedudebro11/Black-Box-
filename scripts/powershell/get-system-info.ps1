# get-system-info.ps1 — Return hardware profile as JSON
#
# Called by src/collectors/drivers.ts via PowerShell runner.
# Returns GPU model, driver version, OS version, and total RAM.
# Privacy: hardware specs only — no user info, no file paths.
#
# Uses Get-CimInstance (modern, fast) instead of Get-WmiObject which can
# silently hang for minutes on systems with WMI repository issues.

$ErrorActionPreference = 'SilentlyContinue'

$timeout = 8  # seconds per CIM query

try {
    $gpu = Get-CimInstance -ClassName Win32_VideoController -OperationTimeoutSec $timeout |
           Select-Object -First 1
    $os  = Get-CimInstance -ClassName Win32_OperatingSystem  -OperationTimeoutSec $timeout |
           Select-Object -First 1
    $cs  = Get-CimInstance -ClassName Win32_ComputerSystem   -OperationTimeoutSec $timeout |
           Select-Object -First 1

    $ramMb = if ($cs -and $cs.TotalPhysicalMemory) {
        [math]::Round($cs.TotalPhysicalMemory / 1MB)
    } else { 0 }

    @{
        gpu_model          = if ($gpu -and $gpu.Caption)       { $gpu.Caption }       else { 'unknown' }
        gpu_driver_version = if ($gpu -and $gpu.DriverVersion) { $gpu.DriverVersion } else { 'unknown' }
        os_version         = if ($os)  { "$($os.Caption) $($os.BuildNumber)" }        else { 'unknown' }
        ram_total_mb       = $ramMb
    } | ConvertTo-Json -Compress
}
catch {
    @{
        gpu_model          = 'unknown'
        gpu_driver_version = 'unknown'
        os_version         = 'unknown'
        ram_total_mb       = 0
    } | ConvertTo-Json -Compress
}

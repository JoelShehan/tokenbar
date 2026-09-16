param([switch]$Unsigned)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$config = Join-Path $env:TEMP ('tokenbar-signing-' + [guid]::NewGuid() + '.json')
try {
    $arguments = @('run', 'tauri', 'build', '--', '--bundles', 'nsis')
    if (-not $Unsigned) {
        if (-not $env:WINDOWS_CERTIFICATE_THUMBPRINT) {
            throw 'Set WINDOWS_CERTIFICATE_THUMBPRINT to a trusted code-signing certificate installed in the Windows certificate store, or explicitly use -Unsigned for testing.'
        }
        @{ bundle = @{ windows = @{
            certificateThumbprint = $env:WINDOWS_CERTIFICATE_THUMBPRINT
            digestAlgorithm = 'sha256'
            timestampUrl = 'http://timestamp.digicert.com'
            tsp = $true
        } } } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $config -Encoding utf8
        $arguments += @('--config', $config)
    }
    & npm @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' }
    $installer = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $installer) { throw 'Installer missing.' }
    foreach ($path in @('src-tauri/target/release/tokenbar.exe', $installer.FullName)) {
        $signature = Get-AuthenticodeSignature -LiteralPath $path
        if (-not $Unsigned -and ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate)) {
            throw "Missing valid timestamped signature: $path"
        }
    }
    $hash = Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256
    "$($hash.Hash.ToLower())  $($installer.Name)" | Set-Content -LiteralPath ($installer.FullName + '.sha256') -Encoding ascii
    if ($Unsigned) { Write-Warning 'UNSIGNED TEST BUILD. Not production-ready.' }
    Write-Output $installer.FullName
} finally {
    if (Test-Path -LiteralPath $config) { Remove-Item -LiteralPath $config }
}

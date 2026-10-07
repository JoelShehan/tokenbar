$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$version = '0.161.0'
$expected = 'A0F89ACCA07A511734CAC7FDDEE26B2106FAB68918717BC90DF16104A0760A30'
$destination = 'src-tauri/resources/codex/codex.exe'
if (Test-Path -LiteralPath $destination) {
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $expected) { return }
    throw 'Bundled Codex checksum differs from the pinned release.'
}
New-Item -ItemType Directory -Force vendor-download | Out-Null
& npm pack "@openai/codex@$version-win32-x64" --pack-destination vendor-download --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not download the official Codex helper.' }
& tar -xzf "vendor-download/openai-codex-$version-win32-x64.tgz" -C vendor-download package/vendor/x86_64-pc-windows-msvc/bin/codex.exe
if ($LASTEXITCODE -ne 0) { throw 'Could not extract the Codex helper.' }
$source = 'vendor-download/package/vendor/x86_64-pc-windows-msvc/bin/codex.exe'
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $expected) { throw 'Codex helper checksum mismatch.' }
New-Item -ItemType Directory -Force src-tauri/resources/codex | Out-Null
Copy-Item -LiteralPath $source -Destination $destination
Write-Output "Prepared official Codex $version (Windows x64)."

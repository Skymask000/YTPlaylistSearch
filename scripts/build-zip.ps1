# Builds the ship-ready ZIP for the current manifest.json version.
#
# Run: pwsh -File scripts/build-zip.ps1            -> sideload build (keeps "key")
#      pwsh -File scripts/build-zip.ps1 -ForStore  -> Chrome Web Store build (strips "key")
#
# Output: dist/YT-Playlist-Search-v<VERSION>.zip
#         dist/YT-Playlist-Search-v<VERSION>-store.zip
#
# Why two builds: manifest.json carries a "key" field that pins the extension ID, so a
# sideloaded copy has an ID matching the one authorized redirect URI. The Chrome Web Store
# REJECTS any uploaded manifest containing "key" -- it assigns its own ID and key. The two
# artifacts are therefore not interchangeable, and the filenames differ so they can't be
# mixed up at upload time.

param(
  [switch]$ForStore
)

$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $PSScriptRoot

$manifest = Get-Content "$src\manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$suffix = if ($ForStore) { "-store" } else { "" }
$out = "$src\dist\YT-Playlist-Search-v$version$suffix.zip"

New-Item -ItemType Directory -Force -Path "$src\dist" | Out-Null
if (Test-Path $out) { Remove-Item $out -Force }

$staging = "$env:TEMP\ytps-build-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $staging | Out-Null

Copy-Item -Path @(
  "$src\manifest.json",
  "$src\background.js",
  "$src\popup.html",
  "$src\popup.js",
  "$src\popup.css"
) -Destination $staging
Copy-Item -Path "$src\icons" -Destination $staging -Recurse
Copy-Item -Path "$src\src" -Destination $staging -Recurse

if ($ForStore) {
  # Strip "key" from the STAGED copy only -- the working manifest keeps it, so local
  # unpacked installs and the sideload build retain the pinned ID.
  $staged = Get-Content "$staging\manifest.json" -Raw | ConvertFrom-Json
  $staged.PSObject.Properties.Remove("key")
  $staged | ConvertTo-Json -Depth 20 | Set-Content "$staging\manifest.json" -Encoding utf8
}

Compress-Archive -Path "$staging\*" -DestinationPath $out -Force
Remove-Item -Recurse -Force $staging

# Verify the artifact matches its intent rather than trusting the branch above.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($out)
try {
  $entry = $zip.Entries | Where-Object { $_.FullName -eq "manifest.json" }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  $hasKey = ($reader.ReadToEnd() | ConvertFrom-Json).PSObject.Properties.Name -contains "key"
  $reader.Close()
} finally { $zip.Dispose() }

if ($ForStore -and $hasKey) { throw "ABORT: -ForStore build still contains 'key'. CWS would reject this." }
if (-not $ForStore -and -not $hasKey) { throw "ABORT: sideload build is missing 'key'. Installs would get mismatched IDs and sign-in would fail." }

$size = (Get-Item $out).Length
$kind = if ($ForStore) { "STORE build, 'key' stripped" } else { "SIDELOAD build, 'key' retained" }
Write-Host "Built: $out ($size bytes)"
Write-Host "  $kind -- verified against the packaged manifest."

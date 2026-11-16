$ErrorActionPreference = "Stop"

$backendDirectory = $PSScriptRoot
$archivePath = Join-Path $backendDirectory "..\backend-lambda.zip"

Push-Location $backendDirectory
try {
  npm ci --omit=dev
  if ($LASTEXITCODE -ne 0) {
    throw "Installing backend dependencies failed."
  }
} finally {
  Pop-Location
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

$archive = [System.IO.Compression.ZipFile]::Open(
  $archivePath,
  [System.IO.Compression.ZipArchiveMode]::Create
)
try {
  Get-ChildItem -LiteralPath $backendDirectory -Recurse -File -Force |
    Where-Object { $_.Name -notmatch "^\.env($|\.)" } |
    ForEach-Object {
      $entryName = $_.FullName.Substring($backendDirectory.Length + 1).Replace("\", "/")
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive,
        $_.FullName,
        $entryName,
        [System.IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
} finally {
  $archive.Dispose()
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName })
  $requiredEntries = @(
    "lambda.js",
    "server.js",
    "package.json",
    "node_modules/express/package.json"
  )
  $missingEntries = @($requiredEntries | Where-Object { $entries -notcontains $_ })
  $secretEntries = @($entries | Where-Object { $_ -match "(^|/)\.env(\..*)?$" })

  if ($missingEntries.Count -gt 0) {
    throw "Lambda archive is missing required entries: $($missingEntries -join ', ')"
  }
  if ($secretEntries.Count -gt 0) {
    throw "Lambda archive must not contain .env files."
  }

  $sizeInMegabytes = (Get-Item $archivePath).Length / 1MB
  Write-Output ("Created {0:N1} MB archive: {1}" -f $sizeInMegabytes, (Resolve-Path $archivePath))
  Write-Output "Verified handler, Express dependency, and no .env secrets."
} finally {
  $archive.Dispose()
}

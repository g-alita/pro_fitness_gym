$ErrorActionPreference = "Stop"

$frontendDirectory = $PSScriptRoot
$archivePath = Join-Path $frontendDirectory "..\frontend-cloudflare.zip"

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
  Get-ChildItem -LiteralPath $frontendDirectory -Recurse -File -Force |
    Where-Object {
      $relativePath = $_.FullName.Substring($frontendDirectory.Length + 1).Replace("\", "/")
      $hasLocalToolingPath = $relativePath -match "(^|/)(node_modules|\.wrangler|\.git)(/|$)"
      $hasLocalSecretFile = $_.Name -match "^\.(env|dev\.vars)($|\.)"
      -not $hasLocalToolingPath -and
        -not $hasLocalSecretFile -and
        $relativePath -ne "photos/hero1.MP4" -and
        $_.Name -notin @("CLOUDFLARE.md", "package-cloudflare.ps1")
    } |
    ForEach-Object {
      $entryName = $_.FullName.Substring($frontendDirectory.Length + 1).Replace("\", "/")
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
    "gym.html",
    "_redirects",
    "_routes.json",
    "wrangler.toml",
    "functions/api/[[path]].js",
    "photos/hero1-web.mp4"
  )
  $missingEntries = @($requiredEntries | Where-Object { $entries -notcontains $_ })
  $secretEntries = @($entries | Where-Object { $_ -match "(^|/)\.(env|dev\.vars)(\..*)?$" })
  $oversizedEntries = @($archive.Entries | Where-Object { $_.Length -gt 25MB })

  if ($missingEntries.Count -gt 0) {
    throw "Cloudflare archive is missing required entries: $($missingEntries -join ', ')"
  }
  if ($secretEntries.Count -gt 0) {
    throw "Cloudflare archive must not contain local environment files."
  }
  if ($oversizedEntries.Count -gt 0) {
    throw "Cloudflare Pages does not accept assets over 25 MiB: $(($oversizedEntries | ForEach-Object { $_.FullName }) -join ', ')"
  }

  $sizeInMegabytes = (Get-Item $archivePath).Length / 1MB
  Write-Output ("Created {0:N1} MB archive: {1}" -f $sizeInMegabytes, (Resolve-Path $archivePath))
  Write-Output "Verified Pages root files, Function routing, and no local environment files."
} finally {
  $archive.Dispose()
}

param([Parameter(Mandatory=$true)][string]$Migration)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$migrationPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Migration))
if (-not $migrationPath.StartsWith((Join-Path $projectRoot 'supabase/migrations'), [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Migrasi di luar proyek' }
$sql = [System.IO.File]::ReadAllText($migrationPath)
$sql = [regex]::Replace($sql, '(?im)^begin;\s*', '')
$sql = [regex]::Replace($sql, '(?im)^commit;\s*', '')
$tests = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-operations.sql'))
$tests = [regex]::Replace($tests, '(?im)^begin;\s*', '')
$tempSql = Join-Path ([System.IO.Path]::GetTempPath()) ('ayam-validate-' + [guid]::NewGuid().ToString() + '.sql')
try {
 [System.IO.File]::WriteAllText($tempSql, "begin;`n" + $sql + "`n" + $tests, [System.Text.UTF8Encoding]::new($false))
 supabase db query --linked --file $tempSql
 if ($LASTEXITCODE -ne 0) { throw 'Validasi migrasi dan transaksi gagal' }
} finally { Remove-Item -LiteralPath $tempSql -ErrorAction SilentlyContinue }

# run_quarterly_update.ps1
# 每季執行一次，觸發法規更新 Agent
# 用法：.\law\run_quarterly_update.ps1 -Quarter 2026-Q3

param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^\d{4}-Q[1-4]$')]
    [string]$Quarter
)

$RepoRoot   = "C:\Users\gloom.lai\OHS-Portal"
$PromptFile = "$RepoRoot\law\quarterly-agent.md"

if (-not (Test-Path $PromptFile)) {
    Write-Error "找不到 $PromptFile"
    exit 1
}

$SourceDir = "$RepoRoot\law\sources\$Quarter"
if (-not (Test-Path $SourceDir)) {
    Write-Warning "來源資料夾不存在：$SourceDir"
    Write-Host "請先建立資料夾並放入法規文件，再執行此腳本。" -ForegroundColor Yellow
    exit 1
}

$FileCount = (Get-ChildItem $SourceDir -File).Count
if ($FileCount -eq 0) {
    Write-Warning "$SourceDir 內沒有法規文件"
    exit 1
}

Write-Host ""
Write-Host "╔══════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  職安法規季度更新                ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "  季度：$Quarter" -ForegroundColor Yellow
Write-Host "  來源文件：$FileCount 個" -ForegroundColor Yellow
Write-Host ""

$Prompt = (Get-Content $PromptFile -Raw -Encoding UTF8) -replace '\{QUARTER\}', $Quarter

Set-Location $RepoRoot
claude $Prompt

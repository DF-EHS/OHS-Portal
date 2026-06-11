# run_scheduled_update.ps1
# 由 Windows 工作排程器呼叫，無需手動輸入季度參數
# 自動依當前月份判斷季度，並以非互動模式執行 Claude Code 更新

$RepoRoot   = "C:\Users\gloom.lai\OHS-Portal"
$PromptFile = "$RepoRoot\law\quarterly-agent.md"
$LogDir     = "$RepoRoot\law\logs"

# 依月份判斷季度
$Year    = (Get-Date).Year
$Month   = (Get-Date).Month
$Quarter = switch ($Month) {
    3  { "Q1" }
    6  { "Q2" }
    9  { "Q3" }
    12 { "Q4" }
    default {
        Write-Host "[$((Get-Date -Format 'yyyy-MM-dd HH:mm'))] 非預定季度月份（$Month 月），不執行。"
        exit 0
    }
}
$QuarterParam = "$Year-$Quarter"

# 確認來源資料夾
$SourceDir = "$RepoRoot\law\sources\$QuarterParam"
if (-not (Test-Path $SourceDir)) {
    Write-Host "[$QuarterParam] 來源資料夾不存在：$SourceDir`n請先建立資料夾並放入法規 .txt 檔案。"
    exit 0
}
$FileCount = (Get-ChildItem $SourceDir -File).Count
if ($FileCount -eq 0) {
    Write-Host "[$QuarterParam] 來源資料夾為空，跳過執行。"
    exit 0
}

# 建立 logs 資料夾
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}
$LogFile  = "$LogDir\$QuarterParam.log"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host ""
Write-Host "╔══════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  職安法規季度更新（自動排程）    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "  季度：$QuarterParam" -ForegroundColor Yellow
Write-Host "  來源文件：$FileCount 個" -ForegroundColor Yellow
Write-Host "  記錄檔案：$LogFile" -ForegroundColor Yellow
Write-Host ""

# 讀取並替換 prompt
$Prompt = (Get-Content $PromptFile -Raw -Encoding UTF8) -replace '\{QUARTER\}', $QuarterParam

# 寫入 log 標頭
"[$Timestamp] 開始 $QuarterParam 季度法規更新，來源文件 $FileCount 個" | Out-File -FilePath $LogFile -Encoding UTF8

# 切換目錄並以非互動模式執行
Set-Location $RepoRoot
$Prompt | claude -p 2>&1 | Tee-Object -FilePath $LogFile -Append

"[$( Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 執行完成" | Out-File -FilePath $LogFile -Append -Encoding UTF8
Write-Host ""
Write-Host "完成。記錄已存至 law\logs\$QuarterParam.log" -ForegroundColor Green

#
# 修复行尾符脚本：把所有 .ts 文件的 CRLF 统一改成 LF
# 解决 VS Code 断点变空心 / disk verification 失败的问题
#

$srcPath = Join-Path $PSScriptRoot 'src'
Write-Host "Scanning: $srcPath" -ForegroundColor Cyan

$count = 0
Get-ChildItem -Path $srcPath -Recurse -Filter '*.ts' | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $hasCRLF = $false
    for ($i = 0; $i -lt $bytes.Length - 1; $i++) {
        if ($bytes[$i] -eq 13 -and $bytes[$i+1] -eq 10) {
            $hasCRLF = $true
            break
        }
    }
    if ($hasCRLF) {
        $text = [System.IO.File]::ReadAllText($_.FullName)
        $newText = $text -replace "`r`n", "`n"
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($_.FullName, $newText, $utf8NoBom)
        Write-Host "Fixed: $($_.FullName)" -ForegroundColor Green
        $count++
    }
}

Write-Host "`nTotal files fixed: $count" -ForegroundColor Yellow
Write-Host "Done!" -ForegroundColor Green

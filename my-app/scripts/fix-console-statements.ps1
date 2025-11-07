# PowerShell script to replace console.* statements with logger.* throughout the codebase
# This ensures production-ready logging with proper error tracking

$replacements = @{
    "console.error\(" = "logger.error("
    "console.warn\(" = "logger.warn("
    "console.log\(" = "logger.log("
    "console.info\(" = "logger.log("
    "console.debug\(" = "logger.debug("
}

$files = Get-ChildItem -Path "src" -Recurse -Include *.ts,*.tsx | Where-Object { 
    $_.FullName -notlike "*\lib\logger.ts" -and 
    $_.FullName -notlike "*\lib\errorMonitoring.ts" -and
    $_.FullName -notlike "*\lib\envValidator.ts"
}

$totalReplacements = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    $fileReplacements = 0
    
    foreach ($pattern in $replacements.Keys) {
        $replacement = $replacements[$pattern]
        $matches = [regex]::Matches($content, $pattern)
        if ($matches.Count -gt 0) {
            $content = $content -replace $pattern, $replacement
            $fileReplacements += $matches.Count
        }
    }
    
    if ($fileReplacements -gt 0) {
        # Check if logger import exists
        if ($content -notmatch "import.*logger.*from.*@/lib/logger") {
            # Add logger import at the top after other imports
            $content = $content -replace "(import.*\n)", "`$1import { logger } from '@/lib/logger';`n"
        }
        
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "✓ $($file.Name): $fileReplacements replacements" -ForegroundColor Green
        $totalReplacements += $fileReplacements
    }
}

Write-Host "`n✅ Total replacements: $totalReplacements" -ForegroundColor Cyan
Write-Host "⚠️  Please review files in logger.ts, errorMonitoring.ts, and envValidator.ts manually" -ForegroundColor Yellow

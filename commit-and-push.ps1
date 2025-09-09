# PowerShell script to commit and push changes, ensuring data directory is included
# Usage: .\commit-and-push.ps1 "Your commit message"

param(
    [Parameter(Mandatory=$true)]
    [string]$CommitMessage
)

Write-Host "🔄 Staging all changes..." -ForegroundColor Yellow
git add .

Write-Host "📊 Checking what will be committed..." -ForegroundColor Yellow
git status --porcelain

Write-Host "💾 Committing changes with message: '$CommitMessage'" -ForegroundColor Green
git commit -m $CommitMessage

if ($LASTEXITCODE -eq 0) {
    Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Green
    git push origin master
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully committed and pushed to GitHub!" -ForegroundColor Green
        Write-Host "📁 Data directory changes are included in this commit." -ForegroundColor Cyan
    } else {
        Write-Host "❌ Failed to push to GitHub" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Failed to commit changes" -ForegroundColor Red
}

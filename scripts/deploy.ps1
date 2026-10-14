param(
  [string]$HostName = "vps-433854af.vps.ovh.net",
  [string]$User = "ubuntu",
  [string]$RemoteDir = "~/ariane-dashboard"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 Deploiement automatique Ariane -> VPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Enregistrer les modifications locales si existantes
$status = git status --porcelain
if ($status) {
    Write-Host "`n[1/4] 📦 Enregistrement des modifications locales..." -ForegroundColor Yellow
    git add .
    $commitMsg = "chore(deploy): auto-deploy " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    git commit -m $commitMsg
} else {
    Write-Host "`n[1/4] ✓ Arbre de travail propre" -ForegroundColor Green
}

# 2. Pousser vers GitHub
Write-Host "[2/4] 📤 Synchronisation GitHub (origin master)..." -ForegroundColor Cyan
try {
    git push origin master
} catch {
    Write-Host "⚠️ Attention : push GitHub ignore ou non bloquant." -ForegroundColor Yellow
}

# 3. Pousser le code directement sur le VPS par SSH
Write-Host "[3/4] 🌐 Envoi direct du code vers le VPS..." -ForegroundColor Cyan
git push vps master

# 4. Compilation et redemarrage sur le VPS
Write-Host "[4/4] ⚡ Compilation Next.js et redemarrage PM2 sur le serveur..." -ForegroundColor Cyan
$target = $User + "@" + $HostName
$remoteCmd = "set -e; cd " + $RemoteDir + "; npm run build; pm2 restart ariane"

ssh -o BatchMode=yes $target $remoteCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🎉 Deploiement VPS termine avec succes ! Ariane est en ligne." -ForegroundColor Green
} else {
    Write-Host "`n❌ Erreur lors de la compilation ou du redemarrage sur le VPS." -ForegroundColor Red
    exit 1
}

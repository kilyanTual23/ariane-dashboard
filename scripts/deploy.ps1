param(
  [string]$HostName = "vps-433854af.vps.ovh.net",
  [string]$User = "ubuntu",
  [string]$RemoteDir = "~/ariane-dashboard"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 Déploiement automatique Ariane -> VPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Vérifier si des modifications locales non commitées existent
$status = git status --porcelain
if ($status) {
    Write-Host "📦 Enregistrement des modifications en cours (commit automatique)..." -ForegroundColor Yellow
    git add .
    git commit -m "chore(deploy): auto-deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
} else {
    Write-Host "✓ Arbre de travail propre (aucun nouveau commit requis)" -ForegroundColor Green
}

# 2. Pousser vers GitHub
Write-Host "📤 Envoi vers GitHub (git push)..." -ForegroundColor Cyan
git push origin master

# 3. Connexion SSH et mise à jour sur le VPS
Write-Host "🌐 Exécution sur le VPS ($User@$HostName)..." -ForegroundColor Cyan
$remoteCommands = "set -e; cd $RemoteDir; git pull; npm run build; pm2 restart ariane; echo '✅ Déploiement terminé avec succès !'"

ssh -o BatchMode=yes "$User@$HostName" "$remoteCommands"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🎉 Déploiement VPS terminé avec succès !" -ForegroundColor Green
} else {
    Write-Host "`n❌ Échec de la commande distante sur le VPS." -ForegroundColor Red
    exit 1
}

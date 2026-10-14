param(
  [string]$HostName = "vps-433854af.vps.ovh.net",
  [string]$User = "ubuntu",
  [string]$RemoteDir = "~/ariane-dashboard"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploiement automatique Ariane -> VPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Verifier si des modifications locales non commitees existent
$status = git status --porcelain
if ($status) {
    Write-Host "[1/3] Enregistrement des modifications locales..." -ForegroundColor Yellow
    git add .
    $commitMsg = "chore(deploy): auto-deploy " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    git commit -m $commitMsg
} else {
    Write-Host "[1/3] Aucun nouveau commit requis (arbre propre)" -ForegroundColor Green
}

# 2. Pousser vers GitHub
Write-Host "[2/3] Envoi vers GitHub (git push)..." -ForegroundColor Cyan
git push origin master

# 3. Connexion SSH et execution sur le VPS
$target = $User + "@" + $HostName
Write-Host "[3/3] Execution distante sur le VPS ($target)..." -ForegroundColor Cyan

$remoteCommands = "set -e; cd " + $RemoteDir + "; git pull origin master; npm run build; pm2 restart ariane; echo 'DEPLOIEMENT_VPS_OK'"

ssh -o BatchMode=yes $target $remoteCommands

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDeploiement VPS termine avec succes !" -ForegroundColor Green
} else {
    Write-Host "`nErreur lors de l'execution sur le VPS." -ForegroundColor Red
    exit 1
}

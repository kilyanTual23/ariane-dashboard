import { execSync } from "node:child_process";

const VPS_USER = "ubuntu";
const VPS_HOST = "vps-433854af.vps.ovh.net";
const VPS_DIR = "~/ariane-dashboard";

console.log("\n========================================");
console.log("  Deploiement automatique Ariane -> VPS");
console.log("========================================\n");

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

try {
  // 1. Verifier et commiter les modifications locales
  const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
  if (status) {
    console.log("[1/3] Enregistrement des modifications locales...");
    run("git add .");
    const time = new Date().toISOString().replace("T", " ").substring(0, 19);
    run(`git commit -m "chore(deploy): auto-deploy ${time}"`);
  } else {
    console.log("[1/3] Aucun nouveau commit local necessaire (arbre propre).");
  }

  // 2. Envoi direct du code vers le VPS via SSH (rapide et sans besoin de mot de passe GitHub)
  console.log("\n[2/3] Envoi direct du code vers le VPS (git push vps master)...");
  run("git push vps master");

  // 3. Compilation et redemarrage sur le VPS
  console.log("\n[3/3] Compilation Next.js et redemarrage PM2 sur le serveur...");
  const remoteCmd = `set -e; cd ${VPS_DIR}; npm run build; pm2 restart ariane`;
  run(`ssh -o BatchMode=yes ${VPS_USER}@${VPS_HOST} "${remoteCmd}"`);

  console.log("\n========================================");
  console.log("  Deploiement VPS termine avec succes !");
  console.log("========================================\n");
} catch (error) {
  console.error("\n[ERREUR DE DEPLOIEMENT]:", error.message || error);
  process.exit(1);
}

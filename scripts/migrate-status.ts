/**
 * Passage du vocabulaire Notion (cinq états) aux quatre du dashboard.
 * Idempotent : relancer ne change rien de plus.
 *
 *   npm run migrate:status
 */
import { db } from "../src/lib/db";

const MAPPING: Record<string, string> = {
  "À définir": "Pas commencé",
  "À rechercher": "Pas commencé",
  "En recherche": "En recherche",
  "Bloqué / Stoppé": "Bloqué",
  Complet: "Complet",
};

const before = db
  .prepare(`SELECT status, COUNT(*) AS c FROM persons GROUP BY status ORDER BY c DESC`)
  .all() as { status: string; c: number }[];

const update = db.prepare(`UPDATE persons SET status = ? WHERE status = ?`);
const run = db.transaction(() => {
  for (const [from, to] of Object.entries(MAPPING)) {
    if (from !== to) update.run(to, from);
  }
  // Toute valeur inattendue retombe sur « Pas commencé » plutôt que de rester orpheline.
  db.prepare(
    `UPDATE persons SET status = 'Pas commencé'
     WHERE status NOT IN ('Pas commencé', 'En recherche', 'Bloqué', 'Complet')`,
  ).run();
});
run();

const after = db
  .prepare(`SELECT status, COUNT(*) AS c FROM persons GROUP BY status ORDER BY c DESC`)
  .all() as { status: string; c: number }[];

console.log("avant :", before.map((r) => `${r.status} ${r.c}`).join(" · "));
console.log("après :", after.map((r) => `${r.status} ${r.c}`).join(" · "));

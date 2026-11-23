import { getChromeExecutablePath } from "../act-downloader";
import type { ArchiveRegister, ArchiveSearchResult, DepartmentConnector } from "./types";
import { closest, communeKey, kindsOf } from "./util";

/**
 * Ille-et-Vilaine (35) — plateforme Thot. Le formulaire « Registres paroissiaux et état civil »
 * dépend d'une session construite par le JavaScript de ses cadres : on le remplit dans un Chrome
 * sans interface. Dans la même session, on lit pour chaque registre le fichier des vues de sa
 * visionneuse, qui donne le lien permanent (ark) de chaque page.
 */
const BASE = "https://archives-en-ligne.ille-et-vilaine.fr/thot_internet";
const ARK = `${BASE}/ark:/49933/`;

// Une seule session Chrome à la fois : le serveur est modeste et le site aussi.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

let communesCache: { at: number; list: string[] } | null = null;

type Row = { cote: string; commune: string; parish: string; years: string; type: string; lot: string[] | null };

async function search(commune: string, year: number): Promise<ArchiveSearchResult> {
  const chrome = getChromeExecutablePath();
  if (!chrome) return { ok: false, error: "Chrome est introuvable sur le serveur : la recherche du 35 en a besoin." };

  return exclusive(async () => {
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(30000);
      // Certains outils de compilation ajoutent un appel à __name dans les fonctions envoyées au navigateur.
      await page.evaluateOnNewDocument("window.__name = function (f) { return f; };");
      await page.setRequestInterception(true);
      page.on("request", (r) =>
        ["image", "stylesheet", "font", "media"].includes(r.resourceType()) || /matomo/.test(r.url()) ? r.abort() : r.continue(),
      );
      await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
      await page.goto(`${BASE}/Recherche/FrmRechFrame.asp?MOD=10`, { waitUntil: "networkidle2" });
      const form = page.frames().find((f) => /FrmRechDOCCritere/.test(f.url()));
      if (!form) throw new Error("Formulaire de recherche du 35 introuvable");

      // Liste des paroisses / communes proposées par le site
      const list = await form.evaluate(() =>
        [...document.querySelectorAll<HTMLOptionElement>("#txt_CIN_LISTE0 option")].map((o) => o.value).filter(Boolean),
      );
      communesCache = { at: Date.now(), list };
      const key = communeKey(commune);
      const match = list.find((c) => communeKey(c) === key);
      if (!match) {
        return {
          ok: false as const,
          error: `« ${commune} » ne figure pas dans la liste des communes des Archives d’Ille-et-Vilaine.`,
          suggestions: closest(commune, list),
        };
      }

      await form.select("#txt_CIN_LISTE0", match);
      await form.evaluate(() => document.querySelector("#txt_CIN_LISTE0")!.dispatchEvent(new Event("change", { bubbles: true })));
      await form.type("#txt_CIN_DEX_D", String(year));
      await form.type("#txt_CIN_DEX_F", String(year));
      await Promise.all([
        page.waitForResponse((r) => /FrmRechListeHaut/.test(r.url())),
        form.evaluate(() => (document.querySelector("form button[type=submit]") as HTMLButtonElement).click()),
      ]);
      await new Promise((r) => setTimeout(r, 600));
      const listFrame = page.frames().find((f) => /FrmRechListeHaut/.test(f.url()));
      if (!listFrame) throw new Error("Résultats du 35 introuvables");
      await listFrame.waitForSelector("body");

      const rows: Row[] = await listFrame.evaluate(() =>
        [...document.querySelectorAll("tr")]
          .map((tr) => {
            const td = [...tr.querySelectorAll("td")].map((c) => (c as HTMLElement).innerText.trim());
            if (td.length < 6) return null;
            const lot = tr.innerHTML.match(/openLot\(\s*'(\d+)',\s*'(\d+)',\s*'(\d+)',\s*'(\w+)'/);
            return { cote: td[0], commune: td[1], parish: td[2], years: td[3], type: td[4], lot: lot ? lot.slice(1) : null };
          })
          .filter((r): r is NonNullable<typeof r> => !!r && !!r.cote),
      );

      // Lien permanent de la première vue et nombre de vues, lus dans la visionneuse de chaque registre.
      const withLot = rows.filter((r) => r.lot).slice(0, 30);
      const views: ({ ark: string; pages: number } | null)[] = await page.evaluate(
        async (base: string, lots: string[][]) => {
          const read = async (lot: string[]) => {
            try {
              const [idfic, idlot, ref, appli] = lot;
              const frame = await fetch(
                `${base}/FrmLotDocFrame.asp?idlot=${idlot}&idfic=${idfic}&ref=${ref}&appliCindoc=${appli}&resX=1400&resY=1000&init=1&visionneuseHTML5=1`,
                { credentials: "include" },
              );
              const html = new TextDecoder("windows-1252").decode(await frame.arrayBuffer());
              const slides = html.match(/zSlidePath=([^&"]+)/)?.[1];
              if (!slides) return null;
              const xml = await (await fetch(new URL(slides, base).toString(), { credentials: "include" })).text();
              const arks = [...xml.matchAll(/LIENARK="([^"]+)"/g)].map((m) => m[1]);
              return arks.length ? { ark: arks[0], pages: arks.length } : null;
            } catch {
              return null;
            }
          };
          const out: ({ ark: string; pages: number } | null)[] = [];
          for (let i = 0; i < lots.length; i += 5) out.push(...(await Promise.all(lots.slice(i, i + 5).map(read))));
          return out;
        },
        BASE,
        withLot.map((r) => r.lot!),
      );

      const registers: ArchiveRegister[] = [];
      withLot.forEach((r, i) => {
        const v = views[i];
        if (!v) return;
        const { kinds, isTable } = kindsOf(r.type);
        registers.push({
          id: r.cote,
          dept: "35",
          commune: communeKey(r.commune) === key ? commune : capitalize(r.commune),
          parish: r.parish && communeKey(r.parish) !== communeKey(r.commune) ? capitalize(r.parish) : null,
          typeLabel: r.type,
          kinds,
          isTable,
          years: r.years.replace(/\s*-\s*/g, "-"),
          cote: r.cote,
          pages: v.pages,
          url: ARK + v.ark.replace(/^\/+/, ""),
        });
      });
      if (!registers.length) {
        return { ok: false as const, error: `Aucun registre numérisé de ${year} pour ${capitalize(match)} aux Archives d’Ille-et-Vilaine.` };
      }
      // L'orthographe de la fiche (avec accents) plutôt que celle du site, en capitales sans accents.
      return { ok: true as const, dept: "35", deptName: "Ille-et-Vilaine", commune, year, registers };
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}

/** « SAINT-AUBIN-DU-CORMIER » → « Saint-Aubin-du-Cormier ». */
function capitalize(name: string): string {
  const small = new Set(["de", "du", "des", "la", "le", "les", "en", "sur", "sous", "lès", "lez", "et", "d", "l", "aux", "au"]);
  return name
    .toLowerCase()
    .split(/([- '’])/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

/** Liste des communes connues (si une recherche a déjà eu lieu), pour les suggestions côté client. */
export const knownCommunes35 = () => communesCache?.list ?? [];

export const ad35: DepartmentConnector = { code: "35", name: "Ille-et-Vilaine", platform: "Thot", search };

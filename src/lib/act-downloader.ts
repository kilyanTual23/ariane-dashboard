import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export type ActTarget =
  | { kind: "person"; personId: number; actKind: "birth" | "death" }
  | { kind: "union"; unionId: number };

export function getActFilename(target: ActTarget): string {
  if (target.kind === "person") {
    return `person_${target.personId}_${target.actKind}.jpg`;
  }
  return `union_${target.unionId}_marriage.jpg`;
}

export function getActStorageDir(): string {
  const dir = path.join(process.cwd(), "data", "actes");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getActFilePath(target: ActTarget): string {
  return path.join(getActStorageDir(), getActFilename(target));
}

export function hasLocalAct(target: ActTarget): boolean {
  const filePath = getActFilePath(target);
  try {
    const stat = fs.statSync(filePath);
    return stat.size > 1024;
  } catch {
    return false;
  }
}

/**
 * Version de la copie locale (date de modification du fichier), ou null s'il n'y en a pas.
 * Elle entre dans l'adresse de l'image : une nouvelle copie n'est jamais masquée par le cache.
 */
export function localActVersion(target: ActTarget): number | null {
  try {
    const stat = fs.statSync(getActFilePath(target));
    return stat.size > 1024 ? Math.round(stat.mtimeMs) : null;
  } catch {
    return null;
  }
}

/** Supprime la copie locale : elle ne correspond plus au lien de l'acte. */
export function removeLocalAct(target: ActTarget): void {
  fs.rmSync(getActFilePath(target), { force: true });
}

export function getLocalActUrl(target: ActTarget): string | null {
  if (!hasLocalAct(target)) return null;
  return `/api/actes/${getActFilename(target)}`;
}

/**
 * Téléchargeur principal d'actes pour toutes les archives départementales supportées :
 * - Ille-et-Vilaine (35) : Visionneuse Thot / Zoomify
 * - Mayenne (53) : Serveur IIIF
 * - Corrèze (19) : REST API / Originaux
 * - Archinoë (17, 22, 49, 56, etc.) : Visionneuse Archinoë / Téléchargement direct
 * - Seine-Maritime (76) : IIIF / Mnesys
 * - Manche (50) : Puppeteer
 * - Google Drive : Téléchargement direct
 */
/**
 * Convertit un tampon contenant un document PDF en une image JPEG haute résolution.
 * 1. Extraction ultra-rapide des flux JPEG (DCTDecode) encapsulés (sans perte de qualité).
 * 2. Extraction des bitmaps internes via unpdf + Sharp.
 * 3. Rendu vectoriel de la page 1 via unpdf + @napi-rs/canvas.
 */
export async function convertPdfToJpeg(pdfBuffer: Buffer): Promise<Buffer> {
  // 1. Recherche directe des flux JPEG (DCTDecode) imbriqués
  try {
    let start = 0;
    let bestCandidate: { buffer: Buffer; pixels: number } | null = null;
    while ((start = pdfBuffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]), start)) !== -1) {
      const end = pdfBuffer.indexOf(Buffer.from([0xff, 0xd9]), start);
      if (end !== -1 && end > start + 1024) {
        const candidate = pdfBuffer.subarray(start, end + 2);
        try {
          const meta = await sharp(candidate).metadata();
          if (meta.width && meta.height) {
            const pixels = meta.width * meta.height;
            if (!bestCandidate || pixels > bestCandidate.pixels) {
              bestCandidate = { buffer: candidate, pixels };
            }
          }
        } catch {
          // Candidat non valide ou flux partiel, continuer
        }
      }
      start += 3;
    }

    if (bestCandidate && bestCandidate.pixels >= 250 * 250) {
      return bestCandidate.buffer;
    }
  } catch (err) {
    console.warn("[PDF] Extraction JPEG directe ignorée:", err);
  }

  // 2. Extraction via unpdf extractImages
  try {
    const { extractImages, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    if (pdf.numPages > 0) {
      const images = await extractImages(pdf, 1);
      if (images.length > 0) {
        const largest = images.sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (largest.width * largest.height >= 100 * 100) {
          return await sharp(largest.data, {
            raw: {
              width: largest.width,
              height: largest.height,
              channels: largest.channels,
            },
          })
            .jpeg({ quality: 92 })
            .toBuffer();
        }
      }
    }
  } catch (err) {
    console.warn("[PDF] Extraction unpdf images ignorée:", err);
  }

  // 3. Rendu de la page 1 avec @napi-rs/canvas
  try {
    const { renderPageAsImage, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const rawImage = await renderPageAsImage(pdf, 1, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: 2.5,
    });
    return await sharp(Buffer.from(rawImage)).jpeg({ quality: 90 }).toBuffer();
  } catch (err) {
    console.error("[PDF] Erreur lors du rendu du document PDF:", err);
    throw new Error("Impossible d'extraire une image lisible du document PDF");
  }
}

export async function downloadAct(
  url: string,
  target: ActTarget,
): Promise<{ ok: boolean; filename?: string; size?: number; error?: string }> {
  if (!url || !url.startsWith("http")) {
    return { ok: false, error: "URL invalide" };
  }

  const filename = getActFilename(target);
  const destPath = path.join(getActStorageDir(), filename);

  try {
    let imageBuffer: Buffer | null = null;

    if (url.includes("ille-et-vilaine.fr")) {
      imageBuffer = await downloadIlleEtVilaine(url);
    } else if (url.includes("lamayenne.fr")) {
      imageBuffer = await downloadMayenne(url);
    } else if (url.includes("correze.fr")) {
      imageBuffer = await downloadCorreze(url);
    } else if (url.includes("drive.google.com") || url.includes("docs.google.com")) {
      imageBuffer = await downloadGoogleDrive(url);
    } else if (url.includes("archivesdepartementales76.net")) {
      imageBuffer = await downloadSeineMaritime(url);
    } else if (url.includes("archives-manche.fr")) {
      imageBuffer = await downloadManche(url);
    } else if (url.includes("archinoe.net") || url.includes("archinoe.fr") || url.includes("archinoe")) {
      imageBuffer = await downloadArchinoe(url);
    } else if (url.includes("archives.gironde.fr") || url.includes("gironde.fr")) {
      imageBuffer = await downloadGironde(url);
    } else if (url.match(/\.(pdf|jpe?g|png|webp)($|\?)/i)) {
      const directRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (directRes.ok) {
        imageBuffer = Buffer.from(await directRes.arrayBuffer());
      }
    } else {
      return { ok: false, error: "Archive non supportée pour le téléchargement automatique" };
    }

    if (!imageBuffer || imageBuffer.length < 1024) {
      return { ok: false, error: "Image vide ou non récupérable" };
    }

    // Détection et conversion automatique si le document reçu est un PDF
    if (imageBuffer.subarray(0, 5).toString().startsWith("%PDF-")) {
      imageBuffer = await convertPdfToJpeg(imageBuffer);
    }

    // Une page d'erreur ou de connexion n'est pas un acte : on ne l'enregistre pas.
    const meta = await sharp(imageBuffer)
      .metadata()
      .catch(() => null);
    if (!meta?.width || !meta.height) {
      return { ok: false, error: "Le lien ne mène pas à une image d’acte" };
    }

    fs.writeFileSync(destPath, imageBuffer);
    return { ok: true, filename, size: imageBuffer.length };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ActDownloader] Erreur sur ${url}:`, errorMsg);
    return { ok: false, error: errorMsg };
  }
}

/* ---------------------------------------------------------------- Ille-et-Vilaine (35) */

async function downloadIlleEtVilaine(url: string): Promise<Buffer> {
  const res1 = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  const html = await res1.text();

  const slideMatch = html.match(/zSlidePath=([^&"\s]+)/);
  if (!slideMatch) throw new Error("Impossible de trouver le chemin des diapositives Thot");

  const slideXmlUrl = new URL(slideMatch[1], res1.url).toString();
  const xmlRes = await fetch(slideXmlUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Cookie: res1.headers.get("set-cookie") ?? "",
    },
  });
  const xmlText = await xmlRes.text();

  // Déterminer la diapositive cible (ex: se termine par 47309/12)
  const arkEndingMatch = url.match(/([0-9a-z]+\/\d+\/\d+)$/i) || url.match(/(\d+\/\d+)$/);
  const arkEnding = arkEndingMatch ? arkEndingMatch[1] : "";

  let slideMedia: string | null = null;
  if (arkEnding) {
    const slideRegex = new RegExp(`<SLIDE\\s+MEDIA="([^"]+)"[^>]*LIENARK="[^"]*${arkEnding}"`, "i");
    const m = xmlText.match(slideRegex);
    if (m) slideMedia = m[1];
  }

  if (!slideMedia) {
    const allSlides = [...xmlText.matchAll(/<SLIDE\s+MEDIA="([^"]+)"/gi)];
    if (!allSlides.length) throw new Error("Aucune diapositive trouvée dans l'XML Thot");
    // Extraire le numéro de page en fin d'URL
    const pageNumMatch = url.match(/\/(\d+)$/);
    const pageNum = pageNumMatch ? parseInt(pageNumMatch[1], 10) : 1;
    const slideIndex = Math.max(0, Math.min(allSlides.length - 1, pageNum - 1));
    slideMedia = allSlides[slideIndex][1];
  }

  // Si le média est directement un fichier JPEG (fréquent sur les lots récents Thot LOT10B)
  if (/\.jpe?g$/i.test(slideMedia)) {
    const directRes = await fetch(slideMedia, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (directRes.ok) {
      return Buffer.from(await directRes.arrayBuffer());
    }
  }

  // Lecture des propriétés de l'image Zoomify
  const propsRes = await fetch(`${slideMedia}/ImageProperties.xml`);
  const propsXml = await propsRes.text();
  const widthMatch = propsXml.match(/WIDTH="(\d+)"/);
  const heightMatch = propsXml.match(/HEIGHT="(\d+)"/);
  const tileSizeMatch = propsXml.match(/TILESIZE="(\d+)"/);

  if (!widthMatch || !heightMatch) throw new Error("Propriétés d'image Zoomify invalides");

  const width = Number(widthMatch[1]);
  const height = Number(heightMatch[1]);
  const tileSize = Number(tileSizeMatch?.[1] ?? 256);

  // Calcul des niveaux de la pyramide Zoomify
  let w = width;
  let h = height;
  const levels = [{ w, h, level: 0 }];
  while (w > tileSize || h > tileSize) {
    w = Math.floor(w / 2);
    h = Math.floor(h / 2);
    levels.unshift({ w, h, level: 0 });
  }
  levels.forEach((l, i) => (l.level = i));
  const topLevel = levels[levels.length - 1];

  let tileIndex = 0;
  for (let i = 0; i < levels.length - 1; i++) {
    const c = Math.ceil(levels[i].w / tileSize);
    const r = Math.ceil(levels[i].h / tileSize);
    tileIndex += c * r;
  }

  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const tileList: { left: number; top: number; url: string }[] = [];

  let currentTile = tileIndex;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileGroup = Math.floor(currentTile / 256);
      const tileUrl = `${slideMedia}/TileGroup${tileGroup}/${topLevel.level}-${x}-${y}.jpg`;
      tileList.push({ left: x * tileSize, top: y * tileSize, url: tileUrl });
      currentTile++;
    }
  }

  // Téléchargement parallèle par paquets de 10 tuiles
  const composites: { input: Buffer; left: number; top: number }[] = [];
  for (let i = 0; i < tileList.length; i += 10) {
    const chunk = tileList.slice(i, i + 10);
    const results = await Promise.all(
      chunk.map(async (t) => {
        const res = await fetch(t.url);
        if (!res.ok) throw new Error(`Échec tuile ${t.url}: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return { input: buf, left: t.left, top: t.top };
      }),
    );
    composites.push(...results);
  }

  // Assemblage avec Sharp
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
}

/* ------------------------------------------------------------------- Mayenne (53) */

async function downloadMayenne(url: string): Promise<Buffer> {
  const mMatch = url.match(/ark:\/37963\/([^/]+)\/([^/?#]+)/);
  if (!mMatch) throw new Error("Identifiants ARK Mayenne introuvables");

  const arkId = mMatch[1];
  const pageId = mMatch[2];

  // 1. Obtenir les dimensions réelles via info.json
  const infoUrl = `https://archives.lamayenne.fr/archives-en-ligne/iiif/ark:/37963/${arkId}/${pageId}/info.json`;
  const infoRes = await fetch(infoUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!infoRes.ok) throw new Error(`Échec info.json Mayenne: ${infoRes.status}`);

  const info = await infoRes.json();
  const width = info.width || 3000;
  const height = info.height || 2000;

  // Tentative directe si le serveur autorise le plein format
  const directUrl = `https://archives.lamayenne.fr/archives-en-ligne/iiif/ark:/37963/${arkId}/${pageId}/full/${width},/0/default.jpg`;
  try {
    const directRes = await fetch(directUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (directRes.ok && directRes.headers.get("content-type")?.includes("image")) {
      return Buffer.from(await directRes.arrayBuffer());
    }
  } catch {
    // Si direct non autorisé, bascule sur l'assemblage par tuiles IIIF
  }

  // 2. Assemblage haute définition par tuiles IIIF (contourne le 403 d'IIPImage sur /full/)
  const tileSize = info.tiles?.[0]?.width || 512;
  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);

  const tiles: { left: number; top: number; url: string }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileX = x * tileSize;
      const tileY = y * tileSize;
      const tileW = Math.min(tileSize, width - tileX);
      const tileH = Math.min(tileSize, height - tileY);
      const tileUrl = `https://archives.lamayenne.fr/archives-en-ligne/iiif/ark:/37963/${arkId}/${pageId}/${tileX},${tileY},${tileW},${tileH}/${tileW},${tileH}/0/default.jpg`;
      tiles.push({ left: tileX, top: tileY, url: tileUrl });
    }
  }

  const composites: { input: Buffer; left: number; top: number }[] = [];
  for (let i = 0; i < tiles.length; i += 10) {
    const chunk = tiles.slice(i, i + 10);
    const results = await Promise.all(
      chunk.map(async (t) => {
        const res = await fetch(t.url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) throw new Error(`Échec tuile Mayenne: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return { input: buf, left: t.left, top: t.top };
      }),
    );
    composites.push(...results);
  }

  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
}

/* ------------------------------------------------------------------- Corrèze (19) */

async function downloadCorreze(url: string): Promise<Buffer> {
  const uuidMatch = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (!uuidMatch) throw new Error("UUID d'acte Corrèze introuvable");

  const uuid = uuidMatch[1];
  const imgUrl = `https://www.archives.correze.fr/images/${uuid}.jpg`;
  const res = await fetch(imgUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Échec image Corrèze: ${res.status}`);

  return Buffer.from(await res.arrayBuffer());
}

/* --------------------------------------------------------------- Google Drive */

async function downloadGoogleDrive(url: string): Promise<Buffer> {
  const idMatch =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (!idMatch) throw new Error("ID de fichier Google Drive introuvable dans le lien");

  const fileId = idMatch[1];
  const downloadUrls = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
  ];

  let lastError = "";
  for (const dlUrl of downloadUrls) {
    try {
      const res = await fetch(dlUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        redirect: "follow",
      });

      if (!res.ok) {
        lastError = `Statut HTTP ${res.status}`;
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      const buf = Buffer.from(await res.arrayBuffer());

      // Vérifier si Google a renvoyé une page HTML de confirmation (ex: antivirus sur gros fichier)
      if (contentType.includes("text/html") && buf.toString().includes("confirm=")) {
        const text = buf.toString();
        const confirmMatch =
          text.match(/href="(\/uc\?export=download[^"]+confirm=[^"&]+[^"]*)"/) ||
          text.match(/action="([^"]+)"/);
        if (confirmMatch) {
          const confirmUrl = confirmMatch[1].startsWith("http")
            ? confirmMatch[1]
            : `https://drive.google.com${confirmMatch[1]}`;
          const confirmRes = await fetch(confirmUrl, { redirect: "follow" });
          if (confirmRes.ok) {
            const confirmedBuf = Buffer.from(await confirmRes.arrayBuffer());
            if (confirmedBuf.length > 500) return confirmedBuf;
          }
        }
      }

      if (buf.length > 500) {
        return buf;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(
    `Échec Google Drive : ${lastError || "Fichier inaccessible"}. Assurez-vous que le fichier est partagé avec 'Tous les utilisateurs disposant du lien'.`,
  );
}

/* ----------------------------------------------------------- Navigateur Chrome */

function getChromeExecutablePath(): string | null {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_BIN && fs.existsSync(/*turbopackIgnore: true*/ process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const paths = [
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    // Linux / VPS
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const p of paths) {
    if (fs.existsSync(/*turbopackIgnore: true*/ p)) return p;
  }
  return null;
}

/* ----------------------------------------------------------- Seine-Maritime (76) */

async function downloadSeineMaritime(url: string): Promise<Buffer> {
  const chromePath = getChromeExecutablePath();
  if (!chromePath) throw new Error("Chrome/Edge introuvable pour contourner la protection Anubis");

  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 35000 });

    const pageNumMatch = url.match(/\/dao\/\d+\/(\d+)/);
    const pageNum = pageNumMatch ? parseInt(pageNumMatch[1], 10) : 1;

    const manifest = await page.evaluate(async () => {
      const arkMatch = window.location.pathname.match(/\/ark:\/50278\/[a-f0-9]+/);
      if (!arkMatch) return null;
      const res = await fetch(`${arkMatch[0]}/manifest`);
      return await res.json();
    });

    if (!manifest) throw new Error("Manifeste 76 introuvable");

    const canvases = manifest.sequences?.[0]?.canvases || [];
    const canvas =
      canvases.find((c: Record<string, unknown>) => typeof c["@id"] === "string" && c["@id"].includes(`/canvas/0/${pageNum}`)) ||
      canvases[pageNum - 1] ||
      canvases[0];

    const imgRes = canvas?.images?.[0]?.resource;
    const service = imgRes?.service?.["@id"];
    const directFile = imgRes?.["@id"];
    const imgUrl = service ? `${service}/full/full/0/default.jpg` : directFile;

    if (!imgUrl) throw new Error("URL d'image 76 introuvable");

    const base64Data = await page.evaluate(async (targetUrl: string) => {
      const res = await fetch(targetUrl);
      const blob = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }, imgUrl);

    return Buffer.from(base64Data.split(",")[1], "base64");
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------------- Manche (50) */

async function downloadManche(url: string): Promise<Buffer> {
  const chromePath = getChromeExecutablePath();
  if (!chromePath) throw new Error("Chrome/Edge introuvable pour contourner la protection de la Manche");

  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 35000 });

    const hash = await page.evaluate(() => window.location.hash);
    const m = hash.match(/image\/(\d+)\/(\d+)/);
    const detailM = page.url().match(/detail=(\d+)/);

    let fullImgUrl: string | null = null;
    if (m && detailM) {
      fullImgUrl = `https://www.archives-manche.fr/_recherche-images/show/${detailM[1]}/image/${m[1]}/${m[2]}`;
    } else {
      const imgInDom = await page.evaluate(() => {
        const found = Array.from(document.querySelectorAll("img"))
          .map((i) => i.src)
          .find((s) => s.includes("_recherche-images"));
        return found ? found.split("?")[0] : null;
      });
      fullImgUrl = imgInDom;
    }

    if (!fullImgUrl) throw new Error("URL d'image de la Manche introuvable");

    const base64Data = await page.evaluate(async (targetUrl: string) => {
      const res = await fetch(targetUrl);
      const blob = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }, fullImgUrl);

    return Buffer.from(base64Data.split(",")[1], "base64");
  } finally {
    await browser.close();
  }
}

/* ---------------------------------------------------------------- Archinoë (17, 22, 49, 56, etc.) */

async function downloadArchinoe(url: string): Promise<Buffer> {
  const pageRes = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    redirect: "follow",
  });
  const html = await pageRes.text();
  const cookies = pageRes.headers.get("set-cookie") ?? "";
  const baseUrl = new URL(pageRes.url).origin;

  // Extraire le chemin data-original du visualiseur
  const dataOriginalMatch = html.match(/data-original=["']([^"']+\.jpe?g)/i);
  if (!dataOriginalMatch) {
    throw new Error("Impossible de trouver le chemin de l'image dans la visionneuse Archinoë");
  }
  const imgPath = dataOriginalMatch[1];

  // Extraire l'identifiant (ark id ou infocote)
  const infocoteMatch =
    html.match(/name=['"]infocote['"][^>]*value=['"]([^'"]+)['"]/i) ||
    url.match(/ark:\/\d+\/([a-zA-Z0-9]+)/);
  const arkId = infocoteMatch ? infocoteMatch[1] : "";

  // Extraire le numéro de vue
  const vueMatch = html.match(/id=["']visu_image_(\d+)["']/i);
  const vue = vueMatch ? vueMatch[1] : "1";

  // Extraire la cote
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const cote = titleMatch ? titleMatch[1].split("-")[0].trim() : "";

  // Méthode 1 : telechargement.html direct (originale pleine résolution)
  try {
    const telechargementUrl = new URL("/v2/visualiseur/telechargement.html", baseUrl).toString();
    const hashRes = await fetch(telechargementUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Cookie: cookies,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: pageRes.url,
      },
      body: new URLSearchParams({
        id: arkId,
        img: imgPath,
        cote,
        vue,
        type: "hash",
      }).toString(),
    });
    const hash = (await hashRes.text()).trim();
    if (hash && hash.startsWith("h")) {
      const downloadParams = new URLSearchParams({
        type: "direct",
        img: imgPath,
        w: "6000",
        h: "6000",
        ha: hash,
        vue,
        id: arkId,
        ir: "",
      });
      const imgRes = await fetch(`${telechargementUrl}?${downloadParams.toString()}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Cookie: cookies,
          Referer: pageRes.url,
        },
      });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length > 5000) return buf;
      }
    }
  } catch (err) {
    console.warn("[Archinoe] Échec du téléchargement direct, tentative via genereImage:", err);
  }

  // Méthode 2 : Fallback genereImage
  const genereUrl = new URL("/v2/images/genereImage.html", baseUrl);
  genereUrl.search = new URLSearchParams({
    l: "3500",
    h: "3500",
    r: "0",
    n: "0",
    b: "0",
    c: "0",
    o: "IMG",
    id: `visu_image_${vue}`,
    image: imgPath,
  }).toString();

  const genereRes = await fetch(genereUrl.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Cookie: cookies,
      Referer: pageRes.url,
    },
  });
  const data = await genereRes.text();
  const parts = data.split("\t");
  if (parts.length >= 2 && parts[1].startsWith("/cache/")) {
    const cachedImgUrl = new URL(parts[1], baseUrl).toString();
    const cacheRes = await fetch(cachedImgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Cookie: cookies,
        Referer: pageRes.url,
      },
    });
    if (cacheRes.ok) {
      return Buffer.from(await cacheRes.arrayBuffer());
    }
  }

  throw new Error("Échec du téléchargement de l'image Archinoë");
}

/* ---------------------------------------------------------------- Gironde (33) / Anubis PoW + Ligeo IIIF */

async function solveAnubis(url: string, userAgent: string): Promise<string> {
  const res1 = await fetch(url, { headers: { "User-Agent": userAgent } });
  const html1 = await res1.text();

  if (!html1.includes("anubis_challenge")) {
    const rawCookie = res1.headers.get("set-cookie");
    return rawCookie ? rawCookie.split(";")[0].trim() : "";
  }

  const challengeMatch = html1.match(/<script id="anubis_challenge"[^>]*>([\s\S]*?)<\/script>/);
  if (!challengeMatch) throw new Error("Challenge Anubis introuvable");

  const { challenge, rules } = JSON.parse(challengeMatch[1]);
  const s = challenge.randomData as string;
  const a = rules.difficulty as number;
  const c = Math.floor(a / 2);
  const l = a % 2 !== 0;

  const t0 = Date.now();
  let nonce = 0;
  let hashHex = "";
  for (;; nonce++) {
    const buf = crypto.createHash("sha256").update(s + nonce).digest();
    let match = true;
    for (let i = 0; i < c; i++) {
      if (buf[i] !== 0) {
        match = false;
        break;
      }
    }
    if (match && l && (buf[c] >> 4) !== 0) match = false;
    if (match) {
      hashHex = buf.toString("hex");
      break;
    }
  }
  const elapsed = Date.now() - t0;

  const baseUrl = new URL(url).origin;
  const passUrl = new URL("/.within.website/x/cmd/anubis/api/pass-challenge", baseUrl);
  passUrl.searchParams.set("id", challenge.id);
  passUrl.searchParams.set("response", hashHex);
  passUrl.searchParams.set("nonce", String(nonce));
  passUrl.searchParams.set("redir", url);
  passUrl.searchParams.set("elapsedTime", String(elapsed));

  const passRes = await fetch(passUrl.toString(), {
    headers: {
      "User-Agent": userAgent,
      Referer: url,
    },
    redirect: "manual",
  });

  const passCookies = passRes.headers.getSetCookie?.() || [passRes.headers.get("set-cookie")];
  const authCookie = passCookies
    .filter(Boolean)
    .map((raw) => (raw ? raw.split(";")[0].trim() : ""))
    .find((cookie) => cookie.includes("anubis-auth"));

  if (!authCookie) {
    throw new Error("Échec de validation de la protection Anubis");
  }

  return authCookie;
}

async function downloadGironde(url: string): Promise<Buffer> {
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  const cookie = await solveAnubis(url, userAgent);

  const arkMatch = url.match(/ark:\/\d+\/([a-zA-Z0-9]+)/);
  if (!arkMatch) throw new Error("Identifiant ARK introuvable dans l'URL de la Gironde");
  const arkId = arkMatch[1];

  // Numéro de vue (ex: daogrp/0/6 ou canvas/0/6)
  const pageMatch = url.match(/(?:daogrp|canvas)\/\d+\/(\d+)/i) || url.match(/\/(\d+)$/);
  const targetPage = pageMatch ? parseInt(pageMatch[1], 10) : 1;

  // Récupération du manifeste IIIF Ligeo
  const manifestUrl = `https://archives.gironde.fr/ark:/25651/${arkId}/manifest`;
  const manifestRes = await fetch(manifestUrl, {
    headers: { "User-Agent": userAgent, Cookie: cookie },
  });
  if (!manifestRes.ok) throw new Error(`Échec récupération manifeste IIIF: ${manifestRes.status}`);

  const manifest = await manifestRes.json();
  const canvases = manifest.sequences?.[0]?.canvases || [];
  if (!canvases.length) throw new Error("Aucun canvas dans le manifeste Gironde");

  // Recherche du canvas correspondant
  const canvasTargetStr = `/canvas/0/${targetPage}`;
  const targetCanvas =
    canvases.find((item: { "@id"?: string }) => item["@id"]?.includes(canvasTargetStr)) ||
    canvases[Math.min(targetPage - 1, canvases.length - 1)];

  const resource = targetCanvas?.images?.[0]?.resource;
  if (!resource) throw new Error("Ressource image introuvable dans le canvas Gironde");

  const iiifServiceUrl = resource.service?.["@id"];
  const directDownloadUrl = resource["@id"];

  // 1. Priorité au serveur IIIF haute fidélité (image complète pleine résolution)
  if (iiifServiceUrl) {
    const iiifUrl = `${iiifServiceUrl}/full/full/0/default.jpg`;
    const iiifRes = await fetch(iiifUrl, {
      headers: { "User-Agent": userAgent, Cookie: cookie },
    });
    if (iiifRes.ok) {
      const buf = Buffer.from(await iiifRes.arrayBuffer());
      if (buf.length > 5000) return buf;
    }
  }

  // 2. Téléchargement direct en repli
  if (directDownloadUrl) {
    const directRes = await fetch(directDownloadUrl, {
      headers: { "User-Agent": userAgent, Cookie: cookie },
    });
    if (directRes.ok) {
      const contentType = directRes.headers.get("content-type") ?? "";
      if (contentType.includes("image") || contentType.includes("octet-stream")) {
        const buf = Buffer.from(await directRes.arrayBuffer());
        if (buf.length > 5000) return buf;
      }
    }
  }

  throw new Error("Impossible de télécharger l'acte des Archives de la Gironde");
}



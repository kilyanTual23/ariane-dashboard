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

export function getLocalActUrl(target: ActTarget): string | null {
  if (!hasLocalAct(target)) return null;
  return `/api/actes/${getActFilename(target)}`;
}

/**
 * Téléchargeur principal d'actes pour toutes les archives départementales supportées :
 * - Ille-et-Vilaine (35) : Visionneuse Thot / Zoomify
 * - Mayenne (53) : Serveur IIIF
 * - Corrèze (19) : REST API / Originaux
 * - Google Drive : Téléchargement direct
 */
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
    } else if (url.includes("drive.google.com")) {
      imageBuffer = await downloadGoogleDrive(url);
    } else {
      return { ok: false, error: "Archive non supportée pour le téléchargement automatique" };
    }

    if (!imageBuffer || imageBuffer.length < 1024) {
      return { ok: false, error: "Image vide ou non récupérable" };
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

  // Obtenir les dimensions réelles via info.json
  const infoUrl = `https://archives.lamayenne.fr/archives-en-ligne/iiif/ark:/37963/${arkId}/${pageId}/info.json`;
  const infoRes = await fetch(infoUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!infoRes.ok) throw new Error(`Échec info.json Mayenne: ${infoRes.status}`);

  const info = await infoRes.json();
  const width = info.width || 3000;

  // Téléchargement de l'image haute définition
  const imgUrl = `https://archives.lamayenne.fr/archives-en-ligne/iiif/ark:/37963/${arkId}/${pageId}/full/${width},/0/default.jpg`;
  const imgRes = await fetch(imgUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!imgRes.ok) throw new Error(`Échec image IIIF Mayenne: ${imgRes.status}`);

  return Buffer.from(await imgRes.arrayBuffer());
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
  const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (!idMatch) throw new Error("ID de fichier Google Drive introuvable");

  const fileId = idMatch[1];
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Échec Google Drive: ${res.status}`);

  return Buffer.from(await res.arrayBuffer());
}

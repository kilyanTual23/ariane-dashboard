import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getActStorageDir, convertPdfToJpeg } from "@/lib/act-downloader";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  // Sécurité : n'autoriser que les noms de fichiers sains (ex: person_1_birth.jpg)
  if (!filename || !/^[a-zA-Z0-9_\-]+\.jpg$/.test(filename)) {
    return new NextResponse("Nom de fichier invalide", { status: 400 });
  }

  const storageDir = getActStorageDir();
  const filePath = path.join(storageDir, filename);

  if (!fs.existsSync(filePath)) {
    return new NextResponse("Image non trouvée", { status: 404 });
  }

  let fileBuffer: Buffer = fs.readFileSync(filePath);

  // Auto-réparation transparente : si un acte a été enregistré au format PDF brut
  if (fileBuffer.subarray(0, 5).toString().startsWith("%PDF-")) {
    try {
      fileBuffer = await convertPdfToJpeg(fileBuffer);
      // Remplacer le fichier sur disque par le JPEG converti pour les lectures ultérieures instantanées
      fs.writeFileSync(filePath, fileBuffer);
    } catch (err) {
      console.error(`[API Actes] Erreur conversion PDF ${filename}:`, err);
      return new NextResponse("Erreur lors de la conversion du PDF", { status: 500 });
    }
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": fileBuffer.length.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}


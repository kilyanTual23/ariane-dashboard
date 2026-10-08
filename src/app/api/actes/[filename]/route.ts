import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getActStorageDir } from "@/lib/act-downloader";

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

  const stat = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": stat.size.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}


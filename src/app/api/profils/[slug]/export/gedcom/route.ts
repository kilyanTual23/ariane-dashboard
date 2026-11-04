import { NextResponse } from "next/server";
import { getProfileBySlug, listParentChildLinks, listPersons, listUnions } from "@/lib/queries";
import { generateGedcom, type GedcomExportOptions } from "@/lib/gedcom";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/profils/[slug]/export/gedcom">,
) {
  const { slug } = await ctx.params;
  const profile = await getProfileBySlug(slug);
  if (!profile) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  }

  const url = new URL(request.url);
  const sosaOnly = url.searchParams.get("sosa") === "1";
  const includeSources = url.searchParams.get("sources") !== "0";
  const includeNotes = url.searchParams.get("notes") !== "0";
  const protectLiving = url.searchParams.get("protect_living") === "1";

  const options: GedcomExportOptions = {
    sosaOnly,
    includeSources,
    includeNotes,
    protectLiving,
  };

  const [persons, unions, parentChildLinks] = await Promise.all([
    listPersons(profile.id),
    listUnions(profile.id),
    listParentChildLinks(profile.id),
  ]);

  const gedcomContent = generateGedcom(
    profile.name,
    persons,
    unions,
    parentChildLinks,
    options,
  );

  const dateStr = new Date().toISOString().slice(0, 10);
  const suffix = sosaOnly ? "-sosa" : "";
  const filename = `${slug}${suffix}-${dateStr}.ged`;

  return new NextResponse(gedcomContent, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}


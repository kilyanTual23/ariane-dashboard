import { NextResponse } from "next/server";

import { getProfileBySlug, listAllSourcesForProfile, listPersons, listResources, listTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/profils/[slug]/export">) {
  const { slug } = await ctx.params;
  const profile = await getProfileBySlug(slug);
  if (!profile) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });

  const [persons, tasks, resources, sources] = await Promise.all([
    listPersons(profile.id),
    listTasks(profile.id),
    listResources(profile.id),
    listAllSourcesForProfile(profile.id),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    profile,
    persons,
    tasks,
    resources,
    sources,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

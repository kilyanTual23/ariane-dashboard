import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getProfileBySlug, listPersons, listResources, listTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/profils/[slug]/export">) {
  const { slug } = await ctx.params;
  const profile = getProfileBySlug(slug);
  if (!profile) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });

  const payload = {
    exportedAt: new Date().toISOString(),
    profile,
    persons: listPersons(profile.id),
    tasks: listTasks(profile.id),
    resources: listResources(profile.id),
    sources: db.prepare(`SELECT * FROM sources WHERE profile_id = ?`).all(profile.id),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

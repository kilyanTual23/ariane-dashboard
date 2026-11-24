import crypto from "node:crypto";

import { UA } from "./util";

/**
 * Sites protégés par Anubis (preuve de travail) : on résout le défi une fois, côté serveur,
 * et on garde le cookie d'accès par site tant qu'il est accepté.
 */
const cookies = new Map<string, { at: number; cookie: string }>();
const TTL = 6 * 3600 * 1000;

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((raw) => raw.split(";")[0].trim())
    .filter((c) => !c.endsWith("="));

async function solve(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  const html = await res.text();
  const json = html.match(/<script id="anubis_challenge"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!json) return cookiesOf(res).join("; ");
  // Le serveur rattache le défi à ce cookie : il faut le renvoyer avec la réponse.
  const verification = cookiesOf(res).join("; ");
  const { challenge, rules } = JSON.parse(json) as {
    challenge: { id: string; randomData: string };
    rules: { difficulty: number };
  };
  const full = Math.floor(rules.difficulty / 2);
  const half = rules.difficulty % 2 === 1;
  const t0 = Date.now();
  let nonce = 0;
  let hash = "";
  for (;; nonce++) {
    const buf = crypto.createHash("sha256").update(challenge.randomData + nonce).digest();
    let ok = true;
    for (let i = 0; i < full && ok; i++) if (buf[i] !== 0) ok = false;
    if (ok && half && buf[full] >> 4 !== 0) ok = false;
    if (ok) {
      hash = buf.toString("hex");
      break;
    }
  }
  const pass = new URL("/.within.website/x/cmd/anubis/api/pass-challenge", url);
  pass.searchParams.set("id", challenge.id);
  pass.searchParams.set("response", hash);
  pass.searchParams.set("nonce", String(nonce));
  pass.searchParams.set("redir", url);
  pass.searchParams.set("elapsedTime", String(Math.max(Date.now() - t0, 300)));
  const passRes = await fetch(pass, {
    headers: { "User-Agent": UA, Referer: url, Cookie: verification },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  const auth = cookiesOf(passRes).filter((c) => c.includes("anubis-auth"));
  if (!auth.length) throw new Error("Le site d’archives a refusé l’accès (protection anti-robot)");
  return auth.join("; ");
}

/** Comme fetchText, en passant la protection Anubis du site si besoin. */
export async function fetchAnubis(url: string, timeoutMs = 20000): Promise<string> {
  const origin = new URL(url).origin;
  for (let attempt = 0; attempt < 2; attempt++) {
    let entry = cookies.get(origin);
    if (!entry || Date.now() - entry.at > TTL) {
      entry = { at: Date.now(), cookie: await solve(`${origin}/`) };
      cookies.set(origin, entry);
    }
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: entry.cookie },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Site d’archives indisponible (${res.status})`);
    const html = await res.text();
    if (!html.includes("anubis_challenge")) return html;
    cookies.delete(origin); // cookie expiré : on refait le défi une fois
  }
  throw new Error("Le site d’archives a refusé l’accès (protection anti-robot)");
}
